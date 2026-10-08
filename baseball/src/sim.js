// 타석 단위 경기 시뮬레이터. 같은 RNG 상태면 항상 같은 결과가 나온다.
import { getLineup, getRotation, getBullpen } from './league.js';
import { clamp, avg } from './util.js';

export const blankBat = () => ({ pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0 });
export const blankPit = () => ({ g: 0, gs: 0, outs: 0, er: 0, h: 0, bb: 0, k: 0, hr: 0, w: 0, l: 0 });

const MAX_INNINGS = 15;

function makeSide(team) {
  const lineup = getLineup(team);
  const rot = getRotation(team);
  const sp = rot[team.rot % rot.length];
  return {
    team,
    lineup,
    order: 0,
    defAvg: avg(lineup.map((p) => p.def)),
    pen: getBullpen(team),
    penIdx: -1,
    pitcher: sp,
    starter: sp,
    pitches: 0,
    limit: 55 + sp.sta * 0.6,
    curRuns: 0,
    used: [sp],
  };
}

function rates(b, p, fatigued, defAvg) {
  const f = fatigued ? 10 : 0;
  const stf = p.stf - f;
  const ctl = p.ctl - f;
  return {
    k: clamp(0.205 + (stf - 50) * 0.0042 - (b.con - 50) * 0.003, 0.07, 0.4),
    bb: clamp(0.085 + (b.eye - 50) * 0.0018 - (ctl - 50) * 0.002, 0.025, 0.18),
    hr: clamp(0.028 + (b.pow - 50) * 0.0007 - (stf - 50) * 0.0002 - (ctl - 50) * 0.0001, 0.004, 0.085),
    babip: clamp(0.3 + (b.con - 50) * 0.0022 + (b.pow - 50) * 0.0006 + (b.spd - 50) * 0.0004 - (stf - 50) * 0.0008 - (defAvg - 50) * 0.0016, 0.2, 0.4),
    t3: clamp(0.03 + (b.spd - 50) * 0.0008, 0.005, 0.08),
    t2: clamp(0.21 + (b.pow - 50) * 0.002, 0.12, 0.32),
  };
}

// 안타류에서 주자 진루. bases = [1루, 2루, 3루] 주자 객체 또는 null. 득점한 선수 목록을 돌려준다.
function runHit(kind, b, bases, rng) {
  const [r1, r2, r3] = bases;
  const scored = [];
  const spd = (r, base) => base + (r.spd - 50) * 0.006;
  if (kind === 'HR') {
    [r3, r2, r1].forEach((r) => r && scored.push(r));
    scored.push(b);
    bases[0] = bases[1] = bases[2] = null;
  } else if (kind === '3B') {
    [r3, r2, r1].forEach((r) => r && scored.push(r));
    bases[0] = bases[1] = null;
    bases[2] = b;
  } else if (kind === '2B') {
    if (r3) scored.push(r3);
    if (r2) scored.push(r2);
    bases[0] = bases[1] = bases[2] = null;
    if (r1) {
      if (rng.chance(spd(r1, 0.4))) scored.push(r1);
      else bases[2] = r1;
    }
    bases[1] = b;
  } else {
    if (r3) scored.push(r3);
    let n3 = null;
    let n2 = null;
    if (r2) {
      if (rng.chance(spd(r2, 0.6))) scored.push(r2);
      else n3 = r2;
    }
    if (r1) {
      if (!n3 && rng.chance(spd(r1, 0.22))) n3 = r1;
      else n2 = r1;
    }
    bases[0] = b;
    bases[1] = n2;
    bases[2] = n3;
  }
  return scored;
}

function runWalk(b, bases) {
  const scored = [];
  if (bases[0]) {
    if (bases[1]) {
      if (bases[2]) scored.push(bases[2]);
      bases[2] = bases[1];
    }
    bases[1] = bases[0];
  }
  bases[0] = b;
  return scored;
}

export function simulateGame(home, away, rng, { log = false, stats = true } = {}) {
  const sides = [makeSide(away), makeSide(home)]; // 0 = 원정(초), 1 = 홈(말)
  const bs = new Map(); // 타자 id -> 기록
  const ps = new Map(); // 투수 id -> 기록
  const bStat = (p) => bs.get(p.id) || (bs.set(p.id, blankBat()), bs.get(p.id));
  const pStat = (p) => ps.get(p.id) || (ps.set(p.id, blankPit()), ps.get(p.id));
  pStat(sides[0].starter).gs = 1;
  pStat(sides[1].starter).gs = 1;

  const line = [[], []];
  const score = [0, 0];
  const hits = [0, 0];
  const plays = [];
  let walkoff = false;
  let inning = 1;
  let over = false;

  const relief = (fld) => {
    const tired = fld.pitches >= fld.limit || fld.curRuns >= 6;
    if (!tired || !fld.pen.length) return;
    // 마지막 구원 투수는 끝까지 던진다.
    if (fld.pitcher !== fld.starter && fld.penIdx >= fld.pen.length - 1) return;
    fld.penIdx++;
    const next = fld.pen[fld.penIdx];
    fld.pitcher = next;
    fld.pitches = 0;
    fld.limit = 25 + next.sta * 0.35;
    fld.curRuns = 0;
    fld.used.push(next);
  };

  const halfInning = (half) => {
    const bat = sides[half];
    const fld = sides[1 - half];
    let outs = 0;
    let runs = 0;
    const bases = [null, null, null];
    while (outs < 3) {
      relief(fld);
      const b = bat.lineup[bat.order % 9];
      bat.order++;
      const p = fld.pitcher;
      const r = rates(b, p, fld.pitches > fld.limit * 0.85, fld.defAvg);
      const bst = bStat(b);
      const pst = pStat(p);
      bst.pa++;
      let kind;
      let scored = [];
      let outsAdded = 0;
      let x = rng.next();
      if (x < r.k) {
        kind = 'K';
        outsAdded = 1;
        bst.ab++;
        bst.k++;
        pst.k++;
      } else if ((x -= r.k) < r.bb) {
        kind = 'BB';
        scored = runWalk(b, bases);
        bst.bb++;
        pst.bb++;
      } else if ((x -= r.bb) < r.hr) {
        kind = 'HR';
        scored = runHit('HR', b, bases, rng);
        bst.ab++;
        bst.h++;
        bst.hr++;
        pst.h++;
        pst.hr++;
        hits[half]++;
      } else if (rng.next() < r.babip) {
        const t = rng.next();
        kind = t < r.t3 ? '3B' : t < r.t3 + r.t2 ? '2B' : '1B';
        scored = runHit(kind, b, bases, rng);
        bst.ab++;
        bst.h++;
        if (kind === '2B') bst.d2++;
        if (kind === '3B') bst.d3++;
        pst.h++;
        hits[half]++;
      } else if (rng.chance(0.48)) {
        // 땅볼
        bst.ab++;
        const [r1, r2, r3] = bases;
        if (r1 && outs < 2 && rng.chance(0.42)) {
          kind = 'DP';
          outsAdded = 2;
          bases[0] = null;
          if (outs + 2 < 3) {
            if (r3 && rng.chance(0.6)) {
              scored.push(r3);
              bases[2] = null;
            }
            if (r2 && !bases[2]) {
              bases[2] = r2;
              bases[1] = null;
            }
          }
        } else {
          kind = 'GO';
          outsAdded = 1;
          if (outs < 2) {
            if (r3 && rng.chance(0.55)) {
              scored.push(r3);
              bases[2] = null;
            }
            if (r2 && !bases[2] && rng.chance(0.5)) {
              bases[2] = r2;
              bases[1] = null;
            }
            if (r1 && !bases[1] && rng.chance(0.6)) {
              bases[1] = r1;
              bases[0] = null;
            }
          }
        }
      } else {
        // 뜬공
        const r3 = bases[2];
        if (r3 && outs < 2 && rng.chance(0.55)) {
          kind = 'SF';
          scored.push(r3);
          bases[2] = null;
        } else {
          kind = 'FO';
          bst.ab++;
        }
        outsAdded = 1;
      }
      outs += outsAdded;
      pst.outs += outsAdded;
      const n = scored.length;
      if (n) {
        bst.rbi += n;
        scored.forEach((s) => bStat(s).r++);
        pst.er += n;
        fld.curRuns += n;
        score[half] += n;
        runs += n;
      }
      fld.pitches += Math.round(3.2 + rng.next() * 2.4 + (kind === 'K' || kind === 'BB' ? 0.8 : 0));
      if (log) {
        const label = { K: '삼진', BB: '볼넷', '1B': '안타', '2B': '2루타', '3B': '3루타', HR: '홈런', GO: '땅볼 아웃', FO: '뜬공 아웃', DP: '병살타', SF: '희생플라이' }[kind];
        let text = `${b.name} ${label}`;
        if (n) text += ` · ${n}점`;
        plays.push({ inn: inning, half, text, runs: n, hit: ['1B', '2B', '3B', 'HR'].includes(kind), out: outsAdded, score: score.slice() });
      }
      if (inning >= 9 && half === 1 && score[1] > score[0]) {
        walkoff = true;
        break;
      }
    }
    line[half].push(runs);
    return runs;
  };

  while (!over) {
    halfInning(0);
    if (inning >= 9 && score[1] > score[0]) {
      line[1].push(null); // 홈이 앞서면 말 공격 생략
      over = true;
    } else {
      halfInning(1);
      if (inning >= 9 && score[0] !== score[1]) over = true;
    }
    if (!over && inning >= MAX_INNINGS) {
      const homeWins = rng.chance(0.5);
      score[homeWins ? 1 : 0]++;
      line[homeWins ? 1 : 0][line[homeWins ? 1 : 0].length - 1]++;
      over = true;
    }
    if (!over) inning++;
  }

  const homeWon = score[1] > score[0];
  const winSide = sides[homeWon ? 1 : 0];
  const loseSide = sides[homeWon ? 0 : 1];
  const winP = pStat(winSide.starter).outs >= 15 ? winSide.starter : winSide.used[winSide.used.length - 1];
  const loseP = pStat(loseSide.starter).outs >= 15 ? loseSide.starter : loseSide.used[loseSide.used.length - 1];
  pStat(winP).w = 1;
  pStat(loseP).l = 1;

  if (stats) {
    const all = [...sides[0].lineup, ...sides[1].lineup];
    for (const p of all) {
      const c = bs.get(p.id);
      if (!c) continue;
      p.s = p.s || blankBat();
      for (const k of Object.keys(c)) p.s[k] += c[k];
    }
    for (const side of sides) {
      for (const p of side.used) {
        const c = ps.get(p.id);
        p.s = p.s || blankPit();
        c.g = 1;
        for (const k of Object.keys(c)) p.s[k] += c[k];
      }
    }
  }

  return {
    homeId: home.id,
    awayId: away.id,
    hs: score[1],
    as: score[0],
    innings: inning,
    line: { away: line[0], home: line[1] },
    hits: { away: hits[0], home: hits[1] },
    winnerId: homeWon ? home.id : away.id,
    walkoff,
    wp: winP.name,
    lp: loseP.name,
    sp: { away: sides[0].starter.name, home: sides[1].starter.name },
    plays: log ? plays : null,
  };
}
