// 타석 단위 경기 시뮬레이터. 같은 RNG 상태면 항상 같은 결과가 나온다.
import { buildLineup, battingOrder, teamDefense, nextStarter, bullpenOf } from './roster.js';
import { ovrOf } from './player.js';
import { clamp } from './util.js';

export const blankBat = () => ({ g: 0, pa: 0, ab: 0, h: 0, d2: 0, d3: 0, hr: 0, rbi: 0, bb: 0, k: 0, r: 0 });
export const blankPit = () => ({ g: 0, gs: 0, outs: 0, er: 0, h: 0, bb: 0, k: 0, hr: 0, w: 0, l: 0, sv: 0 });

// 리그별 득점 환경 보정(실제 평균에 맞춘 값). calibrate 스크립트/테스트로 확인한다.
export const ENV = {
  mlb: { k: 0.036, bb: -0.012, hr: -0.0035, babip: -0.028, home: 0.018, maxInn: 15, ghost: true },
  kbo: { k: 0.006, bb: 0.0, hr: -0.003, babip: -0.011, home: 0.016, maxInn: 11, ghost: false },
};

function makeSide(team, user) {
  const slots = buildLineup(team, user);
  const ord = battingOrder(slots);
  const sp = nextStarter(team);
  const pen = bullpenOf(team, sp);
  return {
    team, slots, lineup: ord.map((x) => x.p), order: 0, defAvg: teamDefense(slots), pen, closer: pen[0] || null,
    penUsed: 0, pitcher: sp, starter: sp, pitches: 0, limit: 62 + sp.sta * 0.5, curRuns: 0, used: [sp], pc: new Map([[sp.id, 0]]),
  };
}

function rates(b, p, fatigued, defAvg, env, home) {
  const f = fatigued ? 10 : 0;
  const stf = p.stf - f;
  const ctl = p.ctl - f;
  return {
    k: clamp(0.205 + env.k + (stf - 50) * 0.0042 - (b.con - 50) * 0.003, 0.07, 0.4),
    bb: clamp(0.085 + env.bb + (b.eye - 50) * 0.0018 - (ctl - 50) * 0.002, 0.025, 0.18),
    hr: clamp(0.028 + env.hr + (b.pow - 50) * 0.0007 - (stf - 50) * 0.0002 - (ctl - 50) * 0.0001, 0.004, 0.085),
    babip: clamp(0.3 + env.babip + (home ? env.home : 0) + (b.con - 50) * 0.0022 + (b.pow - 50) * 0.0006 + (b.spd - 50) * 0.0004 - (stf - 50) * 0.0008 - (defAvg - 50) * 0.0016, 0.2, 0.4),
    t3: clamp(0.03 + (b.spd - 50) * 0.0008, 0.005, 0.08),
    t2: clamp(0.21 + (b.pow - 50) * 0.002, 0.12, 0.32),
  };
}

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

function rollInjury(p, rng, perGame) {
  if (p.inj > 0 || !rng.chance(perGame)) return 0;
  const x = rng.next();
  const n = x < 0.6 ? rng.int(3, 10) : x < 0.88 ? rng.int(11, 30) : x < 0.98 ? rng.int(31, 60) : rng.int(61, 120);
  p.inj = n;
  return n;
}

export function simulateGame(home, away, rng, { log = false, env = ENV.mlb, userId = -1 } = {}) {
  const sides = [makeSide(away, away.id === userId), makeSide(home, home.id === userId)]; // 0 = 원정(초), 1 = 홈(말)
  const bs = new Map();
  const ps = new Map();
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

  // 투수 교체: 이닝이 시작될 때 / 타석 사이에 지치면
  const relief = (fi, half, outs, startOfInning) => {
    const fld = sides[fi];
    const lead = score[fi === 1 ? 1 : 0] - score[fi === 1 ? 0 : 1]; // 수비 팀 기준 리드
    const tired = fld.pitches >= fld.limit || fld.curRuns >= 6;
    const save = startOfInning && inning >= 9 && lead >= 1 && lead <= 3 && fld.closer && fld.pitcher !== fld.closer && fld.pitcher.pos !== 'RP';
    const closerNow = startOfInning && inning >= 9 && lead >= 1 && lead <= 3 && fld.closer && fld.pitcher !== fld.closer && !fld.used.includes(fld.closer);
    if (!tired && !save && !closerNow) return;
    const avail = fld.pen.filter((p) => !fld.used.includes(p));
    if (!avail.length) return;
    let next;
    if (closerNow && avail.includes(fld.closer)) next = fld.closer;
    else {
      const pool = avail.filter((p) => p !== fld.closer);
      const arr = pool.length ? pool : avail;
      next = Math.abs(lead) >= 5 ? arr[arr.length - 1] : arr[0];
    }
    fld.pitcher = next;
    fld.pitches = 0;
    fld.limit = 18 + next.sta * 0.45 + (next.pos === 'SP' ? 25 : 0);
    fld.curRuns = 0;
    fld.used.push(next);
    fld.pc.set(next.id, 0);
    if (log) plays.push({ inn: inning, half: 1 - fi, text: `투수 교체 · ${next.name}`, runs: 0, hit: false, out: 0, change: true, score: score.slice() });
  };

  const halfInning = (half) => {
    const bat = sides[half];
    const fldI = 1 - half;
    const fld = sides[fldI];
    let outs = 0;
    let runs = 0;
    const bases = [null, null, null];
    if (inning > 9 && env.ghost) bases[1] = bat.lineup[(bat.order + 8) % 9];
    let first = true;
    while (outs < 3) {
      relief(fldI, half, outs, first);
      first = false;
      const b = bat.lineup[bat.order % 9];
      bat.order++;
      const p = fld.pitcher;
      const r = rates(b, p, fld.pitches > fld.limit * 0.85, fld.defAvg, env, half === 1);
      const bst = bStat(b);
      const pst = pStat(p);
      bst.pa++;
      let kind;
      let scored = [];
      let outsAdded = 0;
      let x = rng.next();
      if (x < r.k) {
        kind = 'K'; outsAdded = 1; bst.ab++; bst.k++; pst.k++;
      } else if ((x -= r.k) < r.bb) {
        kind = 'BB'; scored = runWalk(b, bases); bst.bb++; pst.bb++;
      } else if ((x -= r.bb) < r.hr) {
        kind = 'HR'; scored = runHit('HR', b, bases, rng); bst.ab++; bst.h++; bst.hr++; pst.h++; pst.hr++; hits[half]++;
      } else if (rng.next() < r.babip) {
        const t = rng.next();
        kind = t < r.t3 ? '3B' : t < r.t3 + r.t2 ? '2B' : '1B';
        scored = runHit(kind, b, bases, rng);
        bst.ab++; bst.h++;
        if (kind === '2B') bst.d2++;
        if (kind === '3B') bst.d3++;
        pst.h++; hits[half]++;
      } else if (rng.chance(0.48)) {
        bst.ab++;
        const [r1, r2, r3] = bases;
        if (r1 && outs < 2 && rng.chance(0.42)) {
          kind = 'DP'; outsAdded = 2; bases[0] = null;
          if (outs + 2 < 3) {
            if (r3 && rng.chance(0.6)) { scored.push(r3); bases[2] = null; }
            if (r2 && !bases[2]) { bases[2] = r2; bases[1] = null; }
          }
        } else {
          kind = 'GO'; outsAdded = 1;
          if (outs < 2) {
            if (r3 && rng.chance(0.55)) { scored.push(r3); bases[2] = null; }
            if (r2 && !bases[2] && rng.chance(0.5)) { bases[2] = r2; bases[1] = null; }
            if (r1 && !bases[1] && rng.chance(0.6)) { bases[1] = r1; bases[0] = null; }
          }
        }
      } else {
        const r3 = bases[2];
        if (r3 && outs < 2 && rng.chance(0.55)) { kind = 'SF'; scored.push(r3); bases[2] = null; }
        else { kind = 'FO'; bst.ab++; }
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
      const pit = Math.round(3.2 + rng.next() * 2.4 + (kind === 'K' || kind === 'BB' ? 0.8 : 0));
      fld.pitches += pit;
      fld.pc.set(p.id, (fld.pc.get(p.id) || 0) + pit);
      if (log) {
        const label = { K: '삼진', BB: '볼넷', '1B': '안타', '2B': '2루타', '3B': '3루타', HR: '홈런', GO: '땅볼 아웃', FO: '뜬공 아웃', DP: '병살타', SF: '희생플라이' }[kind];
        let text = `${b.name} ${label}`;
        if (n) text += ` · ${n}점`;
        plays.push({ inn: inning, half, text, runs: n, hit: ['1B', '2B', '3B', 'HR'].includes(kind), out: outsAdded, score: score.slice() });
      }
      if (inning >= 9 && half === 1 && score[1] > score[0]) { walkoff = true; break; }
    }
    line[half].push(runs);
    return runs;
  };

  const maxInn = env.maxInn;
  let tie = false;
  while (!over) {
    halfInning(0);
    if (inning >= 9 && score[1] > score[0]) {
      line[1].push(null);
      over = true;
    } else {
      halfInning(1);
      if (inning >= 9 && score[0] !== score[1]) over = true;
    }
    if (!over && inning >= maxInn) {
      if (env.ghost) {
        const homeWins = rng.chance(0.5);
        score[homeWins ? 1 : 0]++;
        line[homeWins ? 1 : 0][line[homeWins ? 1 : 0].length - 1]++;
      } else tie = true;
      over = true;
    }
    if (!over) inning++;
  }

  const homeWon = score[1] > score[0];
  const res = {
    homeId: home.id, awayId: away.id, hs: score[1], as: score[0], innings: inning,
    line: { away: line[0], home: line[1] }, hits: { away: hits[0], home: hits[1] },
    winnerId: tie ? null : homeWon ? home.id : away.id, tie, walkoff,
    wp: null, lp: null, sv: null, sp: { away: sides[0].starter.name, home: sides[1].starter.name }, plays: log ? plays : null, inj: [],
  };

  if (!tie) {
    const winSide = sides[homeWon ? 1 : 0];
    const loseSide = sides[homeWon ? 0 : 1];
    const winP = pStat(winSide.starter).outs >= 15 ? winSide.starter : winSide.used[winSide.used.length - 1];
    const loseP = pStat(loseSide.starter).outs >= 15 ? loseSide.starter : loseSide.used[loseSide.used.length - 1];
    pStat(winP).w = 1;
    pStat(loseP).l = 1;
    res.wp = winP.name;
    res.lp = loseP.name;
    const fin = winSide.used[winSide.used.length - 1];
    const margin = Math.abs(score[1] - score[0]);
    if (fin !== winP && fin !== winSide.starter && margin <= 3 && pStat(fin).outs >= 1) { pStat(fin).sv = 1; res.sv = fin.name; }
  }

  // 기록 반영, 피로, 부상
  for (const side of sides) {
    for (const x of side.slots) { const c = bs.get(x.p.id); if (!c) continue; c.g = 1; x.p.s = x.p.s || blankBat(); for (const k in c) x.p.s[k] += c[k]; }
    for (const p of side.used) {
      const c = ps.get(p.id);
      p.s = p.s || blankPit();
      c.g = 1;
      for (const k in c) p.s[k] += c[k];
      const pitches = side.pc.get(p.id) || 0;
      p.fat = Math.min(100, p.fat + pitches * (p.pos === 'SP' ? 0.9 : 1.6));
      if (p.id === side.starter.id) p.rest = 0;
    }
    for (const x of side.slots) {
      const n = rollInjury(x.p, rng, 0.0011);
      if (n) res.inj.push({ id: x.p.id, name: x.p.name, team: side.team.id, n });
    }
    for (const p of side.used) {
      const n = rollInjury(p, rng, p.pos === 'SP' ? 0.0045 : 0.0018);
      if (n) res.inj.push({ id: p.id, name: p.name, team: side.team.id, n });
    }
  }
  return res;
}

export { ovrOf };
