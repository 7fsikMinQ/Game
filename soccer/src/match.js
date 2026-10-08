// 90분 경기 시뮬레이션. 분 단위로 점유 → 찬스 → 슈팅 → 골/세이브를 굴리고, 에너지·교체·카드·부상을 반영한다.
import { clamp } from './util.js';
import { effAt, famOf, caOf, caAt } from './player.js';
import { lineStrength, condFactor, MENT, PRESS, HOME_ADV } from './strength.js';

const SHOOT_W = { ST: 1, AM: 0.6, ML: 0.45, MR: 0.45, MC: 0.22, DM: 0.1, DL: 0.06, DR: 0.06, DC: 0.06 };
const CREATE_W = { AM: 1, MC: 0.9, ML: 0.85, MR: 0.85, DM: 0.5, ST: 0.45, DL: 0.4, DR: 0.4, DC: 0.15 };
const INJ_DAYS = [[1, 0.35], [2, 0.55], [3, 0.65], [5, 0.75], [8, 0.9], [14, 0.98], [24, 1]];

function mkRec(p, role, line, min) {
  return { p, role, line, en: 0.55 + 0.45 * (p.cond / 100), from: min, to: 90, g: 0, a: 0, yc: 0, red: false, inj: 0, f: 1 };
}

function mkSide(team, sq, tactic, home) {
  const pl = sq.xi.map(({ p, slot }) => mkRec(p, slot.r, slot.l, 0));
  return {
    team, home, mentality: tactic.mentality, pressing: tactic.pressing,
    atk: MENT[tactic.mentality].atk, open: MENT[tactic.mentality].open * PRESS[tactic.pressing].open,
    drain: PRESS[tactic.pressing].drain, foulMul: PRESS[tactic.pressing].foul, plv: PRESS[tactic.pressing].lvl,
    pl, all: pl.slice(), bench: sq.bench.slice(), subs: 0,
    D: 1, M: 1, A: 1, gk: 3, shots: 0, sot: 0, xg: 0, corners: 0, fouls: 0, yc: 0, rc: 0, goals: 0, gkOut: false,
  };
}

function refresh(S) {
  const entries = S.pl.map((r) => {
    r.f = famOf(r.p, r.role) * condFactor(r.en, r.p.mor ?? 70);
    return { p: r.p, line: r.line, f: r.f };
  });
  const s = lineStrength(entries);
  const h = S.home ? HOME_ADV : 1;
  S.D = s.D; S.M = s.M * h; S.A = s.A * h;
  S.gk = S.gkOut ? 3 : s.gk;
}

// 정규화 기준: CA 100 구단의 공격/GK 강도. 능력치 절대 수준이 높은 리그에서도 경기당 득점이 같게 유지된다.
const REF_A = 9.45, REF_GK = 11.84;

export function simulateMatch(homeTeam, awayTeam, hSq, aSq, rng, { log = false, commit = true, goalMul = 1 } = {}) {
  const H = mkSide(homeTeam, hSq, hSq.tactic, true);
  const A = mkSide(awayTeam, aSq, aSq.tactic, false);
  const sides = [H, A];
  const lvl = { kA: 1, kG: 1 };
  const events = log ? [] : null;
  let score = [0, 0];
  let possH = 0;
  const norm = () => { lvl.kA = REF_A / ((H.A + A.A) / 2); lvl.kG = REF_GK / ((H.gk + A.gk) / 2); };
  refresh(H); refresh(A); norm();
  const side = (S) => (S === H ? 'h' : 'a');
  const ev = (min, t, S, text) => { if (log) events.push({ min, t, side: side(S), text, score: score.slice() }); };

  const pick = (S, wf) => {
    let tot = 0;
    const ws = S.pl.map((r) => { const w = r.line === 'G' ? 0 : wf(r); tot += w; return w; });
    let x = rng.next() * tot;
    for (let i = 0; i < ws.length; i++) { x -= ws[i]; if (x <= 0) return S.pl[i]; }
    return S.pl[S.pl.length - 1];
  };

  const goal = (S, Y, min, shooter, assister, how) => {
    score[S === H ? 0 : 1]++;
    S.goals++;
    shooter.g++;
    if (assister) assister.a++;
    ev(min, 'goal', S, `${shooter.p.name} ${how}${assister ? ` (도움 ${assister.p.name})` : ''}`);
  };

  const chance = (S, Y, min, edge) => {
    const setp = rng.chance(0.12);
    // kA^-0.25: 능력 수준이 낮은 경기일수록 남는 득점 편향을 상쇄한다(실측으로 구한 계수)
    const q0 = (0.025 + Math.pow(rng.next(), 2.2) * 0.27) * goalMul * Math.pow(lvl.kA, -0.25);
    const sh = setp
      ? pick(S, (r) => (r.line === 'D' ? 0.8 : r.line === 'M' ? 0.5 : 1) * Math.pow((r.p.a.hea * 0.6 + r.p.a.jmp * 0.2 + r.p.a.str * 0.2) / 10, 1.5))
      : pick(S, (r) => SHOOT_W[r.role] * Math.pow(r.p.a.fin / 10, 1.5));
    const finC = setp ? sh.p.a.hea * 0.6 + sh.p.a.cmp * 0.4 : sh.p.a.fin * 0.6 + sh.p.a.cmp * 0.25 + sh.p.a.fst * 0.15;
    const finF = 0.5 + 0.05 * finC * lvl.kA * (0.82 + 0.18 * sh.en);
    const gkF = clamp(1.55 - 0.055 * Y.gk * lvl.kG, 0.7, 1.4);
    const eq = Math.pow(clamp(edge, 0.6, 1.6), 0.5);
    const pg = clamp(q0 * eq * finF * gkF, 0.005, 0.75);
    S.shots++;
    S.xg += q0 * eq;
    if (setp) S.corners++;
    const r = rng.next();
    if (r < pg) {
      S.sot++;
      let as = null;
      if (rng.chance(setp ? 0.6 : 0.72)) as = pick(S, (x) => (x === sh ? 0 : CREATE_W[x.role] * Math.pow((x.p.a.pas * 0.5 + x.p.a.vis * 0.3 + x.p.a.crs * 0.2) / 10, 1.3)));
      if (as === sh) as = null;
      goal(S, Y, min, sh, as, setp ? '세트피스 골' : '골');
    } else if ((r - pg) / (1 - pg) < 0.3) {
      S.sot++;
      if (rng.chance(0.35)) S.corners++;
      if (log) ev(min, 'save', S, `${sh.p.name} 슈팅, 선방`);
    } else if (log && q0 > 0.22) ev(min, 'miss', S, `${sh.p.name} 결정적 기회를 놓침`);
  };

  const penalty = (S, Y, min) => {
    const taker = pick(S, (r) => Math.pow(r.p.a.fin + r.p.a.cmp, 2));
    const gkF = clamp(1.55 - 0.055 * Y.gk * lvl.kG, 0.7, 1.4);
    S.shots++; S.xg += 0.76; S.sot += 1;
    ev(min, 'pen', S, `${taker.p.name} 페널티킥 획득`);
    if (rng.chance(clamp(0.76 * (gkF > 1 ? 1 + (gkF - 1) * 0.3 : 1 - (1 - gkF) * 0.4) * (0.9 + 0.01 * taker.p.a.cmp), 0.5, 0.92))) goal(S, Y, min, taker, null, '페널티킥 골');
    else ev(min, 'miss', S, `${taker.p.name} 페널티킥 실패`);
  };

  const remove = (S, rec, min, reason) => {
    rec.to = min;
    S.pl.splice(S.pl.indexOf(rec), 1);
    if (rec.line === 'G') {
      const g = S.bench.findIndex((b) => b.pos === 'GK');
      if (g >= 0 && S.subs < 3 && reason === 'inj') return sub(S, rec, min, S.bench.splice(g, 1)[0]);
      S.gkOut = true;
    }
  };
  const sub = (S, out, min, inP) => {
    S.subs++;
    const r = mkRec(inP, out.role, out.line, min);
    S.pl.push(r);
    S.all.push(r);
    ev(min, 'sub', S, `교체: ${out.p.name} → ${inP.name}`);
  };
  const injure = (S, rec, min) => {
    const x = rng.next();
    rec.inj = INJ_DAYS.find((d) => x < d[1])[0];
    ev(min, 'inj', S, `${rec.p.name} 부상`);
    const idx = S.bench.findIndex((b) => (rec.line === 'G') === (b.pos === 'GK'));
    remove(S, rec, min, 'noreplace');
    if (rec.line !== 'G' && S.subs < 3 && idx >= 0) {
      // 같은 라인 역할에 가장 잘 맞는 벤치 선수
      let bi = -1, bs = -1;
      S.bench.forEach((b, i) => { if (b.pos !== 'GK' && !b.out && effAt(b, rec.role) > bs) { bs = effAt(b, rec.role); bi = i; } });
      if (bi >= 0) sub(S, rec, min, S.bench.splice(bi, 1)[0]);
    } else if (rec.line === 'G') {
      const g = S.bench.findIndex((b) => b.pos === 'GK');
      if (g >= 0 && S.subs < 3) { S.gkOut = false; sub(S, rec, min, S.bench.splice(g, 1)[0]); }
    }
    refresh(S);
  };

  // 후반 교체: 가장 이득이 큰 (경기장 선수, 벤치 선수) 쌍을 고른다. 새로 들어오는 선수는 체력이 싱싱하므로
  // 능력이 조금 낮아도 지친 선수와 비교해 크게 손해가 아니면 교체한다(현실의 교체 흐름, 최대 3명).
  const doSubs = (S, min) => {
    if (S.subs >= 3 || !S.bench.length) return;
    let best = null, bestScore = -Infinity;
    for (const r of S.pl) {
      if (r.line === 'G') continue;
      const cur = effAt(r.p, r.role) * (0.82 + 0.18 * r.en);
      for (let i = 0; i < S.bench.length; i++) {
        const b = S.bench[i];
        if (b.pos === 'GK' || b.out || b.suspend) continue;
        const v = effAt(b, r.role) * (0.82 + 0.18 * Math.min(1, 0.55 + 0.45 * b.cond / 100));
        const score = (v - cur) / cur;
        if (score > bestScore) { bestScore = score; best = { r, i }; }
      }
    }
    if (!best || bestScore < -0.12) return;
    remove(S, best.r, min, 'sub');
    sub(S, best.r, min, S.bench.splice(best.i, 1)[0]);
    refresh(S);
  };

  for (let min = 1; min <= 90; min++) {
    for (const S of sides) for (const r of S.pl) r.en = Math.max(0.05, r.en - 0.0055 * (1.25 - 0.03 * r.p.a.sta) * S.drain);
    if (min % 6 === 0) { refresh(H); refresh(A); norm(); }
    if (min === 60 || min === 68 || min === 75) { doSubs(H, min); doSubs(A, min); }

    const mh = H.M * H.M, ma = A.M * A.M;
    const pH = clamp(mh / (mh + ma) + 0.025 * (H.plv - A.plv), 0.15, 0.85);
    const hasH = rng.next() < pH;
    if (hasH) possH++;
    for (const [X, Y, has] of [[H, A, hasH], [A, H, !hasH]]) {
      const edge = clamp(X.A / Y.D, 0.5, 2);
      const pc = (has ? 0.185 : 0.075) * Math.pow(edge, 1.15) * X.atk * Y.open;
      if (rng.next() < pc) chance(X, Y, min, edge);
    }
    // 파울 / 카드 / 페널티
    for (const [X, Y] of [[H, A], [A, H]]) {
      if (rng.next() < 0.16 * X.foulMul) {
        X.fouls++;
        const r = rng.next();
        const out = X.pl.filter((q) => q.line !== 'G');
        const off = out[Math.floor(rng.next() * out.length)];
        if (r < 0.004) { off.red = true; X.rc++; ev(min, 'rc', X, `${off.p.name} 퇴장`); remove(X, off, min, 'red'); refresh(X); }
        else if (r < 0.07) {
          off.yc++; X.yc++;
          if (off.yc >= 2) { off.red = true; X.rc++; ev(min, 'rc', X, `${off.p.name} 경고 누적 퇴장`); remove(X, off, min, 'red'); refresh(X); }
          else ev(min, 'yc', X, `${off.p.name} 경고`);
        }
        if (rng.next() < 0.025) penalty(Y, X, min);
      }
    }
    // 부상 (경기당 평균 약 0.25건)
    let tot = 0;
    const ps = [];
    for (const S of sides) for (const r of S.pl) { const pr = 0.00011 * (r.p.inj / 10) * (1 + (1 - r.en) * 1.2); ps.push([S, r, pr]); tot += pr; }
    if (rng.next() < tot) {
      let x = rng.next() * tot;
      for (const [S, r, pr] of ps) { x -= pr; if (x <= 0) { injure(S, r, min); break; } }
    }
  }

  // ───────── 결과 정리 ─────────
  const gf = [score[0], score[1]];
  const res = [gf[0] > gf[1] ? 1 : gf[0] === gf[1] ? 0 : -1, gf[1] > gf[0] ? 1 : gf[0] === gf[1] ? 0 : -1];
  const players = [[], []];
  [H, A].forEach((S, si) => {
    const conceded = gf[1 - si];
    for (const r of S.all) {
      const mins = Math.max(0, (r.red ? r.to : r.to) - r.from);
      let rt = 6.1 + (res[si] === 1 ? 0.35 : res[si] === -1 ? -0.25 : 0) + Math.min(3, r.g) * 1.1 + r.a * 0.7 - r.yc * 0.2 - (r.red ? 1.5 : 0) + rng.normal(0, 0.35);
      if (['GK', 'DC', 'DL', 'DR', 'DM'].includes(r.role)) rt += conceded === 0 ? 0.5 : -0.2 * Math.min(conceded, 3);
      rt = mins >= 10 ? clamp(6 + (rt - 6) * (0.4 + 0.6 * Math.min(1, mins / 70)), 3, 10) : 0;
      players[si].push({ id: r.p.id, name: r.p.name, role: r.role, min: mins, g: r.g, a: r.a, yc: r.yc, red: r.red, inj: r.inj, rt: Math.round(rt * 10) / 10, en: r.en });
    }
  });
  const motm = [...players[0], ...players[1]].sort((a, b) => b.rt - a.rt)[0];

  if (commit) {
    [H, A].forEach((S, si) => {
      const byId = new Map(S.all.map((r) => [r.p.id, r]));
      for (const x of players[si]) {
        const r = byId.get(x.id);
        const p = r.p;
        if (x.min > 0) {
          p.s = p.s || { app: 0, min: 0, g: 0, a: 0, rt: 0, yc: 0, rc: 0 };
          p.s.app++; p.s.min += x.min; p.s.g += x.g; p.s.a += x.a; p.s.rt += x.rt; p.s.yc += x.yc; p.s.rc += x.red ? 1 : 0;
          p.cond = Math.round(clamp(p.cond - (x.min / 90) * (24 + (20 - p.a.sta) * 0.9), 5, 100) * 10) / 10;
          p.mor = clamp((p.mor ?? 70) + (res[si] === 1 ? 3 : res[si] === -1 ? -3 : 0) + (x.g ? 2 : 0), 10, 100);
        }
        if (x.inj) p.out = x.inj + 1;
        if (x.red) p.suspend = 1;
      }
    });
  }

  const stat = (S) => ({ shots: S.shots, sot: S.sot, xg: Math.round(S.xg * 100) / 100, corners: S.corners, fouls: S.fouls, yc: S.yc, rc: S.rc });
  return {
    homeId: homeTeam.id, awayId: awayTeam.id, hs: gf[0], as: gf[1],
    poss: Math.round((possH / 90) * 100),
    stats: { h: stat(H), a: stat(A) },
    form: { h: hSq.form.id, a: aSq.form.id },
    players, motm: motm ? { id: motm.id, name: motm.name, rt: motm.rt, g: motm.g, a: motm.a } : null,
    events,
  };
}
export { caOf, caAt };
