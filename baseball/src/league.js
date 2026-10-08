import { LEAGUES, POSITIONS } from './data.js';
import { genPlayer } from './player.js';
import { clamp } from './util.js';

export const lgOf = (L, t) => (L.id === 'mlb' ? (t.id < 15 ? 0 : 1) : 0);

// ───────── 팀/선수 생성 ─────────
function bench(rng, pos) {
  const p = ['2B', '3B', 'SS', 'LF', 'CF', 'RF', '1B'];
  return pos ?? rng.pick(p);
}
function genTeam(ctx, id, def) {
  const { rng, L } = ctx;
  const mean = 52 + def.str * (L.id === 'kbo' ? 3 : 4) + rng.normal(0, 0.8);
  const mk = (o) => {
    const p = genPlayer(ctx, o);
    return p;
  };
  const players = [];
  const age = () => clamp(Math.round(rng.normal(29, 4)), 22, 40);
  const stars = new Set([rng.int(0, 8), rng.int(13, 17)]);
  let i = 0;
  const starter = (pos) => mk({ role: 'H', pos, ovr: mean + 4 + rng.normal(0, 6) + (stars.has(i++) ? 11 : 0), age: age() });
  for (const pos of POSITIONS) players.push(starter(pos));
  const nBench = L.nH - 9;
  const bpos = ['C', ...Array.from({ length: nBench - 1 }, () => bench(rng))];
  bpos.forEach((pos) => players.push(mk({ role: 'H', pos, ovr: mean - 5 + rng.normal(0, 5), age: age() })));
  for (let k = 0; k < L.nSP; k++) players.push(mk({ role: 'P', pos: 'SP', ovr: mean + 3 + rng.normal(0, 6) + (stars.has(i++ + 4) ? 11 : 0), age: age() }));
  const nRP = L.active - L.nH - L.nSP;
  for (let k = 0; k < nRP; k++) players.push(mk({ role: 'P', pos: 'RP', ovr: mean - 3 + rng.normal(0, 5.5), age: age() }));
  // 2군(유망주 위주)
  const farmH = L.id === 'mlb' ? 6 : 9, farmP = L.farmMax - farmH;
  for (let k = 0; k < farmH; k++) players.push(mk({ role: 'H', pos: k === 0 ? 'C' : bench(rng), ovr: mean - 13 + rng.normal(0, 6), age: rng.int(19, 26), act: 0, hypeBoost: 0.05 }));
  for (let k = 0; k < farmP; k++) players.push(mk({ role: 'P', pos: k < Math.ceil(farmP * 0.4) ? 'SP' : 'RP', ovr: mean - 13 + rng.normal(0, 6), age: rng.int(19, 26), act: 0, hypeBoost: 0.05 }));
  if (L.foreign) {
    // 외국인 3명(선발 2 + 타자 1) + 아시아쿼터 1명. 이미 있는 선수 일부를 외국인으로 바꾼다.
    const swap = (pos, fx, lang, plus) => {
      const cand = players.filter((p) => p.act && p.pos === pos && !p.fx);
      const t = cand.sort((a, b) => a.id - b.id)[0];
      if (!t) return;
      const n = genPlayer(ctx, { role: t.role, pos, ovr: mean + plus + rng.normal(0, 4), age: rng.int(25, 34), fx, lang });
      n.id = t.id; players[players.indexOf(t)] = n;
    };
    swap('SP', 1, 'en', 5); players.filter((p) => p.act && p.pos === 'SP' && !p.fx).length && swap('SP', 1, 'en', 4);
    swap('RF', 1, 'en', 5);
    swap('RP', 2, 'jp', 2);
  }
  // 시작 연봉 총액을 구단 예산에 맞춘다(시장 계약 선수만 조정)
  const budget = L.rev0 * def.mkt * 1.0 * L.budgetShare;
  const target = budget * (0.88 + def.str * 0.05);
  const pay = players.reduce((a, p) => a + p.sal, 0);
  const f = clamp(target / pay, 0.55, 1.7);
  for (const p of players) if (p.svc >= L.arbAt && p.fx !== 2) p.sal = Math.max(L.minSal, Math.round(p.sal * f * 100) / 100);
  return { id, name: def.name, short: def.short, color: def.color, div: def.div, mkt: def.mkt, players, w: 0, l: 0, rs: 0, ra: 0, fan: 50, auto: true, lineup: null, manual: false, fac: null };
}

export function createLeague(rng, country) {
  const L = LEAGUES[country];
  let counter = 1;
  const ctx = { rng, nextId: () => counter++, used: new Set(), L, lang: country === 'kbo' ? 'kr' : 'en' };
  const teams = L.teams.map((d, i) => genTeam(ctx, i, d));
  return { teams, nextId: counter };
}

// ───────── 일정 ─────────
function pairCount(L, i, j) {
  if (L.id === 'kbo') return 16;
  const di = Math.floor(i / 5), dj = Math.floor(j / 5);
  if (di === dj) return 13;
  const li = i < 15 ? 0 : 1, lj = j < 15 ? 0 : 1;
  if (li === lj) return 9;
  const a = li === 0 ? i % 15 : j % 15, b = li === 0 ? j % 15 : i % 15;
  return (a + b) % 3 === 0 ? 2 : 1;
}
// 각 라운드는 "하루". 팀마다 하루에 한 경기 이하. 남는 팀은 휴식일. [홈, 원정] 쌍의 배열을 돌려준다.
export function makeSchedule(L, rng) {
  const n = L.teams.length;
  const rem = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : pairCount(L, i, j))));
  const homeSeen = Array.from({ length: n }, () => new Array(n).fill(0));
  const left = rem.map((r) => r.reduce((a, b) => a + b, 0));
  let total = left.reduce((a, b) => a + b, 0) / 2;
  const rounds = [];
  while (total > 0) {
    const used = new Array(n).fill(false);
    const round = [];
    const order = rng.shuffle([...Array(n).keys()]).sort((a, b) => left[b] - left[a]);
    for (const i of order) {
      if (used[i] || left[i] <= 0) continue;
      let best = -1, bv = -1;
      for (let j = 0; j < n; j++) {
        if (j === i || used[j] || rem[i][j] <= 0) continue;
        const v = left[j] * 100 + rem[i][j] + rng.next();
        if (v > bv) { bv = v; best = j; }
      }
      if (best < 0) continue;
      const j = best;
      used[i] = used[j] = true;
      rem[i][j]--; rem[j][i]--; left[i]--; left[j]--; total--;
      const iHome = homeSeen[i][j] < homeSeen[j][i] || (homeSeen[i][j] === homeSeen[j][i] && rng.chance(0.5));
      const h = iHome ? i : j, a = iHome ? j : i;
      homeSeen[h][a]++;
      round.push([h, a]);
    }
    rounds.push(round);
  }
  return rounds;
}

// ───────── 포스트시즌 ─────────
const PAT = {
  3: ['a', 'a', 'a'],
  5: ['a', 'a', 'b', 'b', 'a'],
  7: ['a', 'a', 'b', 'b', 'b', 'a', 'a'],
};
export const series = (a, b, bestOf, label, adv = 0) => ({ a, b, need: Math.floor(bestOf / 2) + 1, bestOf, w: [adv, 0], pat: bestOf === 2 ? ['a', 'a'] : PAT[bestOf], g: 0, label, win: null });
export const seriesOver = (sr) => sr.win !== null;
export const seriesHome = (sr) => (sr.pat[sr.g] === 'a' ? sr.a : sr.b);
export function seriesRecord(sr, winnerSide) {
  sr.w[winnerSide]++;
  sr.g++;
  if (sr.w[0] >= sr.need) sr.win = sr.a;
  else if (sr.w[1] >= sr.need) sr.win = sr.b;
  else if (sr.g >= sr.pat.length) sr.win = sr.w[0] >= sr.w[1] ? sr.a : sr.b;
}

// po = { seeds, rounds:[[series..]], round, champion, bracket, userOut }
export function startBracket(country, seedsInfo) {
  if (country === 'kbo') {
    const [, , , s4, s5] = seedsInfo.seeds;
    return { seeds: seedsInfo.seeds, round: 0, rounds: [[series(s4, s5, 3, '와일드카드', 1)]], champion: null, userOut: false };
  }
  const { AL, NL } = seedsInfo;
  const wc = (L) => [series(L[2], L[5], 3, 'WC'), series(L[3], L[4], 3, 'WC')];
  return { seeds: { AL, NL }, round: 0, rounds: [[...wc(AL), ...wc(NL)]], champion: null, userOut: false, ws: null };
}
// 한 라운드가 끝나면 다음 라운드 시리즈를 만든다. 우승이 정해지면 null.
export function nextRound(country, po, recordOf) {
  const cur = po.rounds[po.round];
  const win = (sr) => sr.win;
  if (country === 'kbo') {
    const [s1, s2, s3] = po.seeds;
    if (po.round === 0) return [series(s3, win(cur[0]), 5, '준플레이오프')];
    if (po.round === 1) return [series(s2, win(cur[0]), 5, '플레이오프')];
    if (po.round === 2) return [series(s1, win(cur[0]), 7, '한국시리즈')];
    po.champion = win(cur[0]);
    return null;
  }
  const { AL, NL } = po.seeds;
  const best = (a, b) => (recordOf(a) >= recordOf(b) ? [a, b] : [b, a]);
  if (po.round === 0) {
    const out = [];
    for (const [L, o] of [[AL, 0], [NL, 2]]) {
      const w45 = win(cur[o + 1]), w36 = win(cur[o]);
      out.push(series(L[0], w45, 5, 'DS'), series(L[1], w36, 5, 'DS'));
    }
    return out;
  }
  if (po.round === 1) {
    return [[0, 1], [2, 3]].map(([x, y]) => {
      const a = win(cur[x]), b = win(cur[y]);
      const [hi, lo] = best(a, b);
      return series(hi, lo, 7, 'CS');
    });
  }
  if (po.round === 2) {
    const [hi, lo] = best(win(cur[0]), win(cur[1]));
    return [series(hi, lo, 7, '월드시리즈')];
  }
  po.champion = win(cur[0]);
  return null;
}
export const ROUND_NAME = {
  mlb: ['와일드카드 시리즈', '디비전 시리즈', '리그 챔피언십', '월드시리즈'],
  kbo: ['와일드카드 결정전', '준플레이오프', '플레이오프', '한국시리즈'],
};
