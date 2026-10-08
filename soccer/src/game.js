// 게임 상태와 규칙. 브라우저에 의존하지 않는다(Node에서 그대로 테스트).
import { createRng } from './rng.js';
import { SQUAD_PLAN, SQUAD_MIN, SQUAD_MAX, FORMATIONS, ALL_ATTRS } from './data.js';
import { LEAGUES, clubNames, colorFor, makeRounds, splitRounds, windowState } from './league.js';
import { genPlayer, caOf, valueOf, wageOf, trainStep, ageUp, retireChance, touch } from './player.js';
import { pickSquad, bestFormation, entriesOf } from './squad.js';
import { simulateMatch } from './match.js';
import { lineStrength, expectedGoals, wdl } from './strength.js';
import { clamp, avg, fmtMoney } from './util.js';
import { refreshMarket, processOffers, acceptBestYouth } from './market.js';
import { userTeam, userDiv, divCfg, rulesOf, findPlayer, withRng, ctxOf, addNews, annualRevenue, roundsOf, seasonLabel } from './core.js';

export { withRng, userTeam, userDiv, divCfg, rulesOf, findPlayer, annualRevenue, roundsOf, seasonLabel, caOf, windowState };
export const VERSION = 2;
export const INTERVAL_CHOICES = [5, 15, 30, 60]; // 분
export const MAX_CATCHUP = 120;
export const FAC_MAX = 10;
export const FAC_INFO = {
  training: { name: '훈련 시설', desc: '선수 성장 속도 +10% / 레벨', base: 0.18 },
  youth: { name: '유스 아카데미', desc: '유스 인원 증가, 높은 잠재력의 유망주 확률 상승', base: 0.18 },
  stadium: { name: '경기장', desc: '홈경기 입장 수입 +12% / 레벨', base: 0.18 },
  scout: { name: '스카우트', desc: '타 구단 선수 잠재능력(PA) 추정 오차 감소', base: 0.12 },
  medical: { name: '의무팀', desc: '부상 기간 -5% / 레벨, 컨디션 회복 +1.5 / 레벨', base: 0.12 },
};
export const intervalMs = (s) => (s.intervalMin * 60 * 1000) / (s.dev.timeScale || 1);
export const clubMeanCA = (s, t) => { const dc = divCfg(s, t.div); return dc.caBase + (t.rep - dc.rep[0]) * dc.caSlope; };

// ───────── 월드 생성 ─────────
const genAge = (rng) => clamp(Math.round(25 + rng.normal(0, 4.2)), 17, 37);
// 나이와 현재 능력은 연결되어 있다: 어린 선수는 아직 덜 컸고(잠재력은 따로 높을 수 있다), 30대 중반부터는 떨어진다.
export const ageAdjust = (age) => { if (age >= 24) return age >= 33 ? -(age - 32) * 3 : 0; const x = 24 - age; return -Math.round(0.55 * x * x + 0.9 * x); };
function genSquad(ctx, mean) {
  const { rng } = ctx;
  return SQUAD_PLAN.map((pos) => { const age = genAge(rng); return genPlayer(ctx, { pos, ca: clamp(Math.round(mean + rng.normal(0, 11) + ageAdjust(age)), 30, 180), age }); });
}
const spread = (n, [lo, hi], rng) => rng.shuffle(Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / Math.max(1, n - 1) + rng.normal(0, 1.2)));

export function newGame(seed, now, country = 'epl') {
  const rng = createRng(seed);
  let counter = 1;
  const ctx = { rng, nextId: () => counter++, used: new Set() };
  const L = LEAGUES[country];
  const names = clubNames(L.namePool, L.divs.reduce((a, d) => a + d.n, 0), rng);
  const teams = [], divs = [];
  L.divs.forEach((dc, di) => {
    const reps = spread(dc.n, dc.rep, rng);
    const ids = [];
    reps.forEach((rep) => {
      const id = teams.length;
      const t = { id, name: names[id], color: colorFor(id), rep: Math.round(rep * 10) / 10, div: di, players: [], form: '442', mentality: rng.chance(0.6) ? 'bal' : rng.chance(0.5) ? 'atk' : 'def', pressing: rng.pick(['low', 'mid', 'mid', 'high']), auto: true, manual: null, w: 0, d: 0, l: 0, gf: 0, ga: 0, grp: null, deduct: 0 };
      t.players = genSquad(ctx, dc.caBase + (t.rep - dc.rep[0]) * dc.caSlope);
      t.form = bestFormation(t);
      teams.push(t);
      ids.push(id);
    });
    divs.push({ tier: di + 1, name: dc.name, ids, rounds: makeRounds(ids, dc.cycles), roundIdx: 0, splitDone: false });
  });
  const s = {
    v: VERSION, game: 'soccer', seed, rng: rng.state(), nextPid: counter, createdAt: now, country, season: 1, phase: 'setup',
    teams, divs, userId: 0, intervalMin: 15, nextGameAt: null, lastSeen: now, money: 0,
    fac: { training: 0, youth: 0, stadium: 0, scout: 0, medical: 0 }, trainFocus: 'bal',
    settings: { autopilot: true, autoRenew: true },
    history: { games: [], seasons: [] }, latest: null, seq: 0, streak: [], tick: 0, lastFix: null, scrChecked: false,
    market: { list: [], loan: [], free: [], at: 0 }, listings: [], offers: [], news: [], offseason: null,
    dev: { timeScale: 1, used: false }, totals: { games: 0, wins: 0 }, lastBackupAt: 0,
  };
  return s;
}

// 시작 화면에서 구단을 고른다
export function chooseClub(s, id, now) {
  s.userId = id;
  s.phase = 'regular';
  s.lastSeen = now;
  s.nextGameAt = now + intervalMs(s);
  const t = userTeam(s);
  s.money = Math.round(annualRevenue(s, t) * 0.3);
  withRng(s, (rng) => refreshMarket(s, rng));
  addNews(s, 'info', `${t.name} 감독으로 부임했습니다. 목표: 시즌 최종 ${expectedRank(s)}위 이내.`);
}

// 평판 순위로 본 기대 순위(1부/2부 내에서)
export function expectedRank(s) {
  const t = userTeam(s);
  const d = s.divs[t.div];
  const sorted = d.ids.map((i) => s.teams[i]).sort((a, b) => b.rep - a.rep);
  return sorted.findIndex((x) => x.id === t.id) + 1;
}

// ───────── 순위 / 기록 ─────────
export const points = (t) => t.w * 3 + t.d - t.deduct;
export function standings(s, di = userTeam(s).div) {
  const rows = s.divs[di].ids.map((id) => {
    const t = s.teams[id];
    return { id, name: t.name, color: t.color, grp: t.grp, p: t.w + t.d + t.l, w: t.w, d: t.d, l: t.l, gf: t.gf, ga: t.ga, gd: t.gf - t.ga, pts: points(t), deduct: t.deduct };
  });
  rows.sort((a, b) => (a.grp && b.grp && a.grp !== b.grp ? (a.grp < b.grp ? -1 : 1) : 0) || b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.id - b.id);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
export function leaders(s, key, n = 10, di = userTeam(s).div) {
  const out = [];
  for (const id of s.divs[di].ids) { const t = s.teams[id]; for (const p of t.players) if (p.s && p.s.app) out.push({ p, team: t, app: p.s.app, v: key === 'rt' ? p.s.rt / p.s.app : p.s[key] }); }
  const minApp = key === 'rt' ? Math.max(1, Math.min(8, Math.floor(s.divs[di].roundIdx * 0.4))) : 1;
  return out.filter((x) => (key === 'rt' ? x.app >= minApp : x.v > 0)).sort((a, b) => b.v - a.v || b.app - a.app).slice(0, n);
}

// ───────── 경기 준비 / 예측 ─────────
export function squadFor(s, team) {
  const user = team.id === s.userId;
  const sq = pickSquad(team, team.form, user && !team.auto ? team.manual : null);
  sq.tactic = { mentality: team.mentality, pressing: team.pressing };
  return sq;
}
export function nextFixture(s) {
  if (s.phase !== 'regular') return null;
  const d = userDiv(s);
  const round = d.rounds[d.roundIdx];
  if (!round) return null;
  return round.find((f) => f.h === s.userId || f.a === s.userId) || null;
}
export function preview(s) {
  const fx = nextFixture(s);
  if (!fx) return null;
  const home = s.teams[fx.h], away = s.teams[fx.a];
  const hs = squadFor(s, home), as = squadFor(s, away);
  const hS = lineStrength(entriesOf(hs.xi)), aS = lineStrength(entriesOf(as.xi));
  const lh = expectedGoals(hS, aS, hs.tactic, as.tactic, true), la = expectedGoals(aS, hS, as.tactic, hs.tactic, false);
  return { fx, ...wdl(lh, la), xg: [lh, la], str: { h: hS, a: aS } };
}

// ───────── 재정 ─────────
export const wageBill = (team) => team.players.reduce((a, p) => a + p.w, 0); // 연간
export const amortization = (team) => team.players.reduce((a, p) => a + (p.fee > 0 && p.cy > 0 ? p.fee / Math.min(5, p.cy) : 0), 0);
export const upkeepAnnual = (s) => 0.012 * Object.values(s.fac).reduce((a, b) => a + b, 0) * annualRevenue(s, userTeam(s));
export function facCost(s, key, lv) { return Math.round(annualRevenue(s, userTeam(s)) * FAC_INFO[key].base * Math.pow(1.6, lv) / 100) * 100; }

export function scrInfo(s) {
  const t = userTeam(s);
  const rev = annualRevenue(s, t);
  const cost = wageBill(t) + amortization(t);
  const r = rulesOf(s).scr;
  return { ratio: cost / rev, cost, revenue: rev, green: r.green, red: r.red, enforce: r.enforce, wages: wageBill(t), amort: amortization(t) };
}

function endOfRoundFinance(s) {
  const t = userTeam(s);
  const rounds = roundsOf(s);
  const rev = annualRevenue(s, t) / rounds;
  const f = s.lastFix;
  const gate = rev * 0.55 * (1 + 0.12 * s.fac.stadium);
  const income = (f ? (f.home ? gate * 1.3 : gate * 0.7) : 0) + rev * 0.45 + (f ? rev * (f.res === 1 ? 0.1 : f.res === 0 ? 0.04 : 0) : 0);
  const cost = (wageBill(t) + upkeepAnnual(s)) / rounds;
  const net = Math.round(income - cost);
  s.money += net;
  if (s.latest && f && s.latest.seq === s.seq) { s.latest.net = net; s.latest.income = Math.round(income); }
  if (s.history.games[0] && f && s.history.games[0].seq === s.seq) { s.history.games[0].net = net; s.history.games[0].income = Math.round(income); }
  return net;
}

function checkSCR(s) {
  const info = scrInfo(s);
  const t = userTeam(s);
  if (!info.enforce) { if (info.ratio > info.green) addNews(s, 'finance', `선수단 비용 비율 ${Math.round(info.ratio * 100)}% — 권장 한도(${Math.round(info.green * 100)}%)를 넘었습니다. (이 리그는 게임에서 경고만 합니다)`); return; }
  if (info.ratio > info.red) { t.deduct += 6; addNews(s, 'finance', `재정 규정 위반! 선수단 비용 비율 ${Math.round(info.ratio * 100)}% > ${Math.round(info.red * 100)}%. 승점 6점 삭감 제재를 받았습니다.`); }
  else if (info.ratio > info.green) { const fine = Math.round((info.ratio - info.green) * info.revenue * 0.5); s.money -= fine; addNews(s, 'finance', `선수단 비용 비율 ${Math.round(info.ratio * 100)}% (한도 ${Math.round(info.green * 100)}%). 초과분에 대한 부담금 ${fmtMoney(fine)}을 납부했습니다.`); }
  else addNews(s, 'finance', `선수단 비용 비율 ${Math.round(info.ratio * 100)}% — 재정 규정 점검을 통과했습니다.`);
}

// ───────── 한 라운드 ─────────
function recordUserMatch(s, r, fx, di) {
  const isHome = fx.h === s.userId;
  const us = isHome ? r.hs : r.as, them = isHome ? r.as : r.hs;
  const res = us > them ? 1 : us === them ? 0 : -1;
  s.lastFix = { home: isHome, res };
  s.totals.games++;
  if (res === 1) s.totals.wins++;
  s.streak = [...s.streak.slice(-4), res === 1 ? 'W' : res === 0 ? 'D' : 'L'];
  s.seq++;
  const d = s.divs[di];
  const goals = (r.events || []).filter((e) => e.t === 'goal');
  const entry = { seq: s.seq, season: s.season, round: d.roundIdx + 1, rounds: d.rounds.length, homeId: fx.h, awayId: fx.a, oppId: isHome ? fx.a : fx.h, home: isHome, us, them, res, hs: r.hs, as: r.as, poss: r.poss, stats: r.stats, form: r.form, motm: r.motm, goals: goals.map((g) => ({ min: g.min, side: g.side, text: g.text })), net: 0 };
  s.history.games.unshift(entry);
  s.history.games.length = Math.min(s.history.games.length, 30);
  s.latest = { ...entry, events: r.events, players: r.players };
  const mine = r.players[isHome ? 0 : 1];
  for (const x of mine) if (x.inj) addNews(s, 'injury', `${x.name} 부상 (${x.inj}라운드 결장 예정)`);
  for (const x of mine) if (x.red) addNews(s, 'match', `${x.name} 퇴장으로 다음 경기 출전정지`);
}

function playDivRound(s, rng, di, played) {
  const d = s.divs[di];
  const round = d.rounds[d.roundIdx];
  const userDivIdx = userTeam(s).div;
  for (const fx of round) {
    const home = s.teams[fx.h], away = s.teams[fx.a];
    const feat = di === userDivIdx && (fx.h === s.userId || fx.a === s.userId);
    const r = simulateMatch(home, away, squadFor(s, home), squadFor(s, away), rng, { log: feat, goalMul: rulesOf(s).goalMul });
    for (const side of r.players) for (const x of side) if (x.min > 0) played.add(x.id);
    home.gf += r.hs; home.ga += r.as; away.gf += r.as; away.ga += r.hs;
    if (r.hs > r.as) { home.w++; away.l++; } else if (r.hs < r.as) { away.w++; home.l++; } else { home.d++; away.d++; }
    home.rot = (home.rot || 0) + 1;
    if (feat) recordUserMatch(s, r, fx, di);
  }
  d.roundIdx++;
  // K리그1 파이널 라운드: 정규 라운드가 끝나면 상위/하위 그룹으로 나눈다
  const cfg = divCfg(s, di);
  if (cfg.split && !d.splitDone && d.roundIdx === cfg.cycles * (d.ids.length - 1)) {
    const st = standings(s, di);
    const half = Math.ceil(st.length / 2);
    const A = st.slice(0, half).map((r) => r.id), B = st.slice(half).map((r) => r.id);
    A.forEach((id) => (s.teams[id].grp = 'A'));
    B.forEach((id) => (s.teams[id].grp = 'B'));
    d.rounds.push(...splitRounds(A, B));
    d.splitDone = true;
    if (di === userDivIdx) addNews(s, 'match', `정규 라운드 종료. 파이널 ${s.teams[s.userId].grp === 'A' ? 'A(우승/대륙대회권)' : 'B(강등권)'} 그룹에서 5경기를 더 치릅니다.`);
  }
}
const divDone = (d) => d.roundIdx >= d.rounds.length;

function tickAll(s, rng) {
  const played = new Set();
  s.lastFix = null;
  const ui = userTeam(s).div;
  s.divs.forEach((d, di) => { if (!divDone(d)) playDivRound(s, rng, di, played); });
  // 내 리그가 끝났다면 다른 리그의 남은 경기는 즉시 끝낸다
  if (divDone(s.divs[ui])) s.divs.forEach((d, di) => { while (!divDone(d)) playDivRound(s, rng, di, played); });
  s.tick++;
  endOfRound(s, rng, played);
  if (s.divs.every(divDone)) finishSeason(s, rng);
}

// 라운드 후처리: 재정·훈련·회복·부상 경과·출장정지·제안
function endOfRound(s, rng, played) {
  endOfRoundFinance(s);
  for (const t of s.teams) {
    const user = t.id === s.userId;
    const level = user ? s.fac.training : Math.round(t.rep / 22);
    const med = user ? s.fac.medical : 2;
    for (const p of t.players) {
      trainStep(p, rng, { level, focus: user ? s.trainFocus : 'bal', played: played.has(p.id) });
      p.cond = Math.round(clamp(p.cond + 28 + 1.5 * med, 0, 100) * 10) / 10;
      p.mor = Math.round((p.mor ?? 70) + (70 - (p.mor ?? 70)) * 0.1);
      if (p.out > 0) p.out--;
      if (p.suspend === 2) p.suspend = 0; else if (p.suspend === 1) p.suspend = 2;
    }
    if (user && s.fac.medical) for (const p of t.players) if (p.out > 1 && rng.chance(0.05 * s.fac.medical)) p.out--;
  }
  const ui = userTeam(s).div;
  for (const t of s.teams) if (t.id !== s.userId && s.divs[t.div].roundIdx % 6 === 5) t.form = bestFormation(t);
  const d = s.divs[ui];
  const total = d.rounds.length;
  if (!s.scrChecked && d.roundIdx >= Math.floor(total * 0.8)) { s.scrChecked = true; checkSCR(s); }
  if (s.tick % 5 === 0) refreshMarket(s, rng);
  processOffers(s, rng);
  // 이적시장 열림/닫힘 알림
  const w = windowState(rulesOf(s), s.phase, d.roundIdx, total);
  if (w.open !== s.winOpen) { if (s.winOpen !== undefined) addNews(s, 'window', w.open ? `${w.label}이 열렸습니다.` : '이적시장이 닫혔습니다.'); s.winOpen = w.open; }
}

// ───────── 시즌 종료 / 승강 ─────────
function playTie(s, rng, lowId, highId, legs) {
  // lowId = 낮은 순위(1차전 홈), highId = 높은 순위. legs=1 이면 높은 순위 홈 단판.
  const results = [];
  const run = (h, a) => {
    const H = s.teams[h], A = s.teams[a];
    const feat = h === s.userId || a === s.userId;
    const r = simulateMatch(H, A, squadFor(s, H), squadFor(s, A), rng, { log: feat, goalMul: rulesOf(s).goalMul });
    results.push({ h, a, hs: r.hs, as: r.as });
    if (feat) { const fx = { h, a }; recordUserMatch(s, r, fx, userTeam(s).div); }
    return r;
  };
  let g = { [lowId]: 0, [highId]: 0 };
  if (legs === 2) { const r1 = run(lowId, highId); g[lowId] += r1.hs; g[highId] += r1.as; const r2 = run(highId, lowId); g[highId] += r2.hs; g[lowId] += r2.as; }
  else { const r1 = run(highId, lowId); g[highId] += r1.hs; g[lowId] += r1.as; }
  let winner;
  if (g[lowId] !== g[highId]) winner = g[lowId] > g[highId] ? lowId : highId;
  else winner = rng.chance(0.5 + 0.05) ? highId : lowId; // 연장/승부차기: 높은 순위가 근소하게 유리
  return { winner, results, agg: [g[lowId], g[highId]], low: lowId, high: highId };
}

function applyPromotions(s, rng) {
  const rules = rulesOf(s);
  const t0 = standings(s, 0), t1 = standings(s, 1);
  const down = t0.slice(t0.length - rules.relegate).map((r) => r.id);
  const up = t1.slice(0, rules.promoteAuto).map((r) => r.id);
  const po = [];
  const tie = (low, high, legs, name) => {
    const x = playTie(s, rng, low, high, legs);
    po.push({ name, low: low, high: high, lowName: s.teams[low].name, highName: s.teams[high].name, agg: x.agg, winner: x.winner, winnerName: s.teams[x.winner].name, legs });
    return x.winner;
  };
  if (rules.playoff === 'six') {
    // 챔피언십 3~8위 6팀: 5v8, 6v7 단판 → 3위/4위와 2차전(3위는 가장 낮은 시드와) → 결승 단판
    const r = t1.slice(2, 8).map((x) => x.id);
    const idx = (id) => r.indexOf(id);
    const a = tie(r[5], r[2], 1, '준준결승'), b = tie(r[4], r[3], 1, '준준결승');
    const [worse, better] = idx(a) > idx(b) ? [a, b] : [b, a];
    const f1 = tie(worse, r[0], 2, '준결승'), f2 = tie(better, r[1], 2, '준결승');
    const [lo, hi] = idx(f1) > idx(f2) ? [f1, f2] : [f2, f1];
    up.push(tie(lo, hi, 1, '결승'));
  } else if (rules.playoff === 'bl') {
    // 1부 16위 vs 2부 3위 (2경기). 2부 팀이 이기면 승격 + 16위 강등
    const stay = t0[t0.length - 3].id, chall = t1[2].id;
    const w = tie(chall, stay, 2, '승강 플레이오프');
    if (w === chall) { up.push(chall); down.push(stay); }
  } else if (rules.playoff === 'kl') {
    const stay = t0[t0.length - 2].id, chall = t1[1].id;
    const w = tie(chall, stay, 2, '승강 플레이오프');
    if (w === chall) { up.push(chall); down.push(stay); }
  }
  return { down, up, po };
}

function moveTeams(s, down, up) {
  const swap = (id, to) => {
    const t = s.teams[id];
    s.divs[t.div].ids = s.divs[t.div].ids.filter((x) => x !== id);
    t.div = to;
    s.divs[to].ids.push(id);
    const r = divCfgRange(s, to);
    t.rep = clamp(t.rep + (to === 0 ? 6 : -6), r[0], r[1]);
  };
  down.forEach((id) => swap(id, 1));
  up.forEach((id) => swap(id, 0));
}
const divCfgRange = (s, di) => divCfg(s, di).rep;

function returnLoans(s) {
  for (const t of s.teams) {
    for (const p of t.players.slice()) {
      if (p.loan && p.loan.until <= s.season) {
        const owner = s.teams[p.loan.from];
        t.players.splice(t.players.indexOf(p), 1);
        const cameBack = p.loan.from === s.userId;
        p.loan = null;
        owner.players.push(p);
        if (owner.id === s.userId) { owner.manual = null; addNews(s, 'loan', `${p.name}이(가) 임대에서 복귀했습니다.`); }
        else if (t.id === s.userId) addNews(s, 'loan', `임대 선수 ${p.name}이(가) 원소속팀(${owner.name})으로 복귀했습니다.`);
        void cameBack;
      }
    }
  }
}

function finishSeason(s, rng) {
  const me = userTeam(s);
  const ui = me.div;
  returnLoans(s);
  const cfgTop = LEAGUES[s.country];
  const tables = s.divs.map((d, di) => standings(s, di));
  const myRows = tables[ui];
  const mine = myRows.find((r) => r.id === s.userId);
  const dc = divCfg(s, ui);
  const n = myRows.length;
  const prize = Math.round(dc.rev * (0.45 * (1 - (mine.rank - 1) / (n - 1)) + 0.04) / 100) * 100;
  s.money += prize;
  const scorer = leaders(s, 'g', 1, ui)[0], best = leaders(s, 'rt', 1, ui)[0];
  const expected = expectedRank(s);
  const delta = expected - mine.rank;
  me.rep = clamp(me.rep + clamp(delta, -3, 3) * 0.8 + (mine.rank === 1 ? 2 : 0), dc.rep[0] - 4, dc.rep[1] + 6);
  const rec = { season: s.season, label: seasonLabel(s), div: dc.name, tier: ui + 1, champion: myRows[0].name, championId: myRows[0].id, rank: mine.rank, pts: mine.pts, w: mine.w, d: mine.d, l: mine.l, gf: mine.gf, ga: mine.ga, prize, rounds: s.divs[ui].rounds.length, scorer: scorer ? { name: scorer.p.name, team: scorer.team.name, g: scorer.v } : null, best: best ? { name: best.p.name, team: best.team.name, rt: Math.round(best.v * 100) / 100 } : null, table: myRows.map((r) => ({ rank: r.rank, name: r.name, p: r.p, w: r.w, d: r.d, l: r.l, gd: r.gd, pts: r.pts, me: r.id === s.userId })), champs: s.divs.map((d, di) => ({ div: LEAGUES[s.country].divs[di].name, name: tables[di][0].name })) };
  // 승강
  const pr = applyPromotions(s, rng);
  const wasUserDown = pr.down.includes(s.userId), wasUserUp = pr.up.includes(s.userId);
  moveTeams(s, pr.down, pr.up);
  let parachute = 0;
  if (wasUserDown) { parachute = Math.round(LEAGUES[s.country].divs[0].rev * 0.2 / 100) * 100; s.money += parachute; }
  rec.promoted = wasUserUp; rec.relegated = wasUserDown;
  rec.playoffs = pr.po; rec.upNames = pr.up.map((i) => s.teams[i].name); rec.downNames = pr.down.map((i) => s.teams[i].name);
  s.history.seasons.unshift(rec);
  // 저장 크기가 계속 커지지 않도록 오래된 시즌의 상세 순위표/플레이오프는 지운다(최근 3시즌만 유지)
  s.history.seasons.slice(3).forEach((h) => { delete h.table; delete h.playoffs; });
  if (s.history.seasons.length > 60) s.history.seasons.length = 60;
  addNews(s, 'season', `시즌 종료: ${dc.name} ${mine.rank}위 (승점 ${mine.pts}). 우승 ${myRows[0].name}.${wasUserUp ? ' 승격!' : ''}${wasUserDown ? ' 강등…' : ''}`);
  s.phase = 'offseason';
  s.nextGameAt = null;
  s.offseason = {
    prize, expected, delta, parachute, promoted: wasUserUp, relegated: wasUserDown, playoffs: pr.po, upNames: rec.upNames, downNames: rec.downNames,
    youth: makeYouth(s, rng), expiring: me.players.filter((p) => p.ctr <= 1).map((p) => p.id), notes: [], continental: mine.rank <= rulesOf(s).continental && ui === 0,
  };
  if (s.offseason.continental) { const bonus = Math.round(dc.rev * 0.12 / 100) * 100; s.money += bonus; s.offseason.contBonus = bonus; }
  refreshMarket(s, rng);
  void cfgTop;
}

function makeYouth(s, rng) {
  const ctx = ctxOf(s, rng);
  const lv = s.fac.youth;
  const n = 3 + Math.floor(lv / 3);
  return Array.from({ length: n }, () => {
    const age = rng.int(16, 18);
    const p = genPlayer(ctx, { pos: rng.pick(SQUAD_PLAN), ca: 15 + rng.int(0, 25), age, paBoost: lv * 4 }); // 시설이 좋을수록 높은 등급 확률 상승
    p.ctr = 3; p.w = Math.max(400, Math.round(p.w * 0.6));
    return p;
  });
}

// ───────── 오프시즌 → 다음 시즌 ─────────
export function wageDemand(p) { return Math.round(wageOf(p) * (1.3 - (p.mor ?? 70) / 400)); }
export const renewBonus = (p) => Math.round(wageDemand(p) * 0.1);

export function renewPlayer(s, pid, years = 3) {
  const me = userTeam(s);
  const p = me.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  const cost = renewBonus(p);
  if (s.money < cost) return { ok: false, err: 'money', cost };
  s.money -= cost;
  p.w = wageDemand(p);
  p.ctr = clamp(years, 1, 5);
  p.cy = Math.max(p.cy, p.ctr);
  if (s.offseason) s.offseason.expiring = s.offseason.expiring.filter((x) => x !== pid);
  return { ok: true, cost, wage: p.w };
}

function autoRenew(s) {
  const me = userTeam(s);
  const median = [...me.players].map(caOf).sort((a, b) => a - b)[Math.floor(me.players.length / 2)];
  for (const pid of (s.offseason?.expiring || []).slice()) {
    const p = me.players.find((x) => x.id === pid);
    if (!p) continue;
    const needGK = p.pos === 'GK' && me.players.filter((x) => x.pos === 'GK').length <= 2;
    const worth = caOf(p) >= median - 4 || (p.age <= 23 && p.pa >= caOf(p) + 12) || needGK;
    // 재정 한도: 재계약 후 선수단 비용 비율이 한도(+5%p)를 넘으면 포기한다
    const info = scrInfo(s);
    const over = (info.cost + (wageDemand(p) - p.w)) / info.revenue > Math.max(info.green, 0.8) + 0.05;
    if (worth && p.age <= 33 && (!over || needGK) && s.money > 0) renewPlayer(s, pid, p.age <= 27 ? 4 : 2);
  }
}

export function startNextSeason(s, now, { auto = false } = {}) {
  if (s.phase !== 'offseason') return false;
  const o = s.offseason;
  withRng(s, (rng) => {
    const ctx = ctxOf(s, rng);
    if (auto || s.settings.autopilot) { acceptBestYouth(s); }
    if (auto || s.settings.autoRenew) autoRenew(s);
    const notes = o.notes;
    for (const t of s.teams) {
      const user = t.id === s.userId;
      const keep = [];
      for (const p of t.players) {
        ageUp(p, rng);
        p.out = 0; p.cond = 100; p.suspend = 0; p.ctr--;
        if (p.ctr <= 0) {
          if (user) { notes.push(`${p.name}의 계약이 만료되어 팀을 떠났습니다.`); s.market.free.push(Object.assign(p, { ctr: 0, mor: 70, keep: true })); continue; }
          p.ctr = rng.int(2, 4); p.w = wageOf(p);
        }
        if (rng.chance(retireChance(p.age))) { if (user) notes.push(`${p.name}(${p.age}세)이(가) 은퇴했습니다.`); continue; }
        keep.push(p);
      }
      t.players = keep;
      const need = [...SQUAD_PLAN];
      for (const p of t.players) { const i = need.indexOf(p.pos); if (i >= 0) need.splice(i, 1); }
      const target = user ? SQUAD_MIN : SQUAD_PLAN.length;
      const gkNeed = Math.max(0, 2 - t.players.filter((p) => p.pos === 'GK').length);
      const fill = [];
      for (let i = 0; i < gkNeed; i++) fill.push('GK');
      for (const pos of need) if (pos !== 'GK' && t.players.length + fill.length < target) fill.push(pos);
      const mean = clubMeanCA(s, t);
      for (const pos of fill) {
        const p = genPlayer(ctx, { pos, ca: Math.round(clamp(mean - 20 + rng.normal(0, 6), 30, 150)), age: rng.int(17, 23), paBoost: 20 });
        p.ctr = 3;
        t.players.push(p);
        if (user) notes.push(`선수단 보충: ${p.name}(${pos}) 입단`);
      }
      if (!user) {
        const worst = t.players.slice().sort((a, b) => caOf(a) - caOf(b)).find((p) => p.pos !== 'GK');
        if (worst && worst.age >= 26) {
          const idx = t.players.indexOf(worst);
          t.players[idx] = genPlayer(ctx, { pos: worst.pos, ca: clamp(Math.round(mean - 28 + rng.normal(0, 8)), 25, 130), age: rng.int(17, 20), paBoost: 25 });
        }
        t.form = bestFormation(t);
      }
      t.w = t.d = t.l = t.gf = t.ga = 0; t.grp = null; t.deduct = 0; t.rot = 0;
      if (user) t.manual = null;
    }
    s.listings = []; s.offers = [];
    refreshMarket(s, rng);
  });
  s.season++;
  s.phase = 'regular';
  s.divs.forEach((d, di) => { d.rounds = makeRounds(d.ids, divCfg(s, di).cycles); d.roundIdx = 0; d.splitDone = false; });
  s.streak = []; s.scrChecked = false; s.tick = 0; s.winOpen = undefined;
  s.nextGameAt = now + intervalMs(s);
  s.lastSeen = now;
  s.lastOffseason = o;
  s.offseason = null;
  addNews(s, 'season', `${seasonLabel(s)} 시즌이 시작되었습니다. (${divCfg(s, userTeam(s).div).name})`);
  return true;
}

// ───────── 시간 진행 / 건너뛰기 ─────────
function stepOnce(s, rng, rep) {
  if (s.phase === 'offseason') {
    if (!s.settings.autopilot) return false;
    startNextSeason(s, s.lastSeen, { auto: true });
    rep.seasons++;
    return true;
  }
  const seq = s.seq;
  tickAll(s, rng);
  rep.games++;
  if (s.seq !== seq) { const r = s.history.games[0].res; r === 1 ? rep.w++ : r === 0 ? rep.d++ : rep.l++; }
  return true;
}

export function advance(s, now) {
  const rep = { games: 0, w: 0, d: 0, l: 0, money: 0, seasons: 0, skipped: 0, phaseChanged: false };
  if (s.phase === 'setup') return rep;
  const before = s.money, startPhase = s.phase;
  if (s.nextGameAt != null) {
    const iv = intervalMs(s);
    if (s.nextGameAt - now > iv * 1.01) s.nextGameAt = now + iv;
    if (now >= s.nextGameAt) {
      const due = Math.floor((now - s.nextGameAt) / iv) + 1;
      const run = Math.min(due, MAX_CATCHUP);
      let done = 0;
      withRng(s, (rng) => { for (; done < run; done++) { s.lastSeen = s.nextGameAt + done * iv; if (!stepOnce(s, rng, rep)) break; } });
      if (s.phase === 'offseason' && !s.settings.autopilot) s.nextGameAt = null;
      else if (due > MAX_CATCHUP) { rep.skipped = due - MAX_CATCHUP; s.nextGameAt = now + iv; }
      else s.nextGameAt += run * iv;
    }
  }
  s.lastSeen = now;
  rep.money = s.money - before;
  rep.phaseChanged = s.phase !== startPhase;
  return rep;
}

// 지금 바로 n라운드 진행 (건너뛰기). 시간과 무관하게 시즌이 끝나면 멈춘다.
export function playNow(s, n, now) {
  const rep = { games: 0, w: 0, d: 0, l: 0, money: 0, seasons: 0, skipped: 0 };
  if (s.phase !== 'regular') return rep;
  const before = s.money;
  withRng(s, (rng) => { for (let i = 0; i < n && s.phase === 'regular'; i++) stepOnce(s, rng, rep); });
  s.lastSeen = now;
  s.nextGameAt = s.phase === 'regular' ? now + intervalMs(s) : null;
  rep.money = s.money - before;
  return rep;
}
export const roundsLeft = (s) => { const d = userDiv(s); return Math.max(0, d.rounds.length - d.roundIdx); };

// 시즌 사이 자동 진행이 켜져 있으면 오프시즌도 알아서 처리한다
export function autoOffseason(s, now) { return startNextSeason(s, now, { auto: true }); }

export { genPlayer, valueOf, wageOf, FORMATIONS, ALL_ATTRS, avg, touch, SQUAD_MIN, SQUAD_MAX };

// ───────── 시설 / 전술 / 설정 ─────────
export function upgradeFacility(s, key) {
  if (!(key in FAC_INFO)) return { ok: false, err: 'notfound' };
  const lv = s.fac[key];
  if (lv >= FAC_MAX) return { ok: false, err: 'max' };
  const cost = facCost(s, key, lv);
  if (s.money < cost) return { ok: false, err: 'money', cost };
  s.money -= cost;
  s.fac[key]++;
  return { ok: true, cost };
}
export function setFormation(s, id) {
  if (!FORMATIONS.some((f) => f.id === id)) return false;
  const t = userTeam(s);
  t.form = id;
  t.manual = null;
  return true;
}
export function setTactic(s, { mentality, pressing }) {
  const t = userTeam(s);
  if (mentality) t.mentality = mentality;
  if (pressing) t.pressing = pressing;
}
export function setAuto(s, on) {
  const t = userTeam(s);
  t.auto = !!on;
  if (!on && !t.manual) {
    const sq = pickSquad(t, t.form);
    t.manual = Object.fromEntries(sq.xi.map((x, i) => [i, x.p.id]));
  }
}
export function setSlot(s, slotIdx, pid) {
  const t = userTeam(s);
  if (t.auto) setAuto(s, false);
  const slot = FORMATIONS.find((f) => f.id === t.form).slots[slotIdx];
  const p = t.players.find((x) => x.id === pid);
  if (!slot || !p || (slot.r === 'GK') !== (p.pos === 'GK')) return false;
  for (const k of Object.keys(t.manual)) if (t.manual[k] === pid) t.manual[k] = t.manual[slotIdx];
  t.manual[slotIdx] = pid;
  return true;
}
export function recommendFormation(s) { const t = userTeam(s); const id = bestFormation(t); setFormation(s, id); t.auto = true; return id; }
export function setTrainFocus(s, f) { if (['bal', 'tec', 'men', 'phy'].includes(f)) s.trainFocus = f; }
export function setIntervalMin(s, min, now) {
  if (!INTERVAL_CHOICES.includes(min)) return false;
  s.intervalMin = min;
  if (s.phase === 'regular') s.nextGameAt = now + intervalMs(s);
  return true;
}
export function setSetting(s, key, on) { if (key in s.settings) s.settings[key] = !!on; }
export function renameTeam(s, name) { const n = String(name).trim().slice(0, 16); if (!n) return false; userTeam(s).name = n; return true; }

// ───────── 개발자 메뉴 ─────────
export const dev = {
  setScale(s, x, now) { s.dev.used = true; s.dev.timeScale = x; if (s.phase === 'regular') s.nextGameAt = now + intervalMs(s); },
  addMoney(s, n) { s.dev.used = true; s.money += n; },
  boost(s, n) {
    s.dev.used = true;
    for (const p of userTeam(s).players) { for (const k of ALL_ATTRS) if (p.a[k] > 4) p.a[k] = clamp(p.a[k] + n, 1, 20); touch(p); p.pa = Math.max(p.pa, caOf(p)); }
  },
  heal(s) { s.dev.used = true; for (const p of userTeam(s).players) { p.out = 0; p.cond = 100; p.suspend = 0; } },
  skip(s, n, now = Date.now()) { s.dev.used = true; return playNow(s, n, now); },
  toOffseason(s, now = Date.now()) { s.dev.used = true; const rep = { games: 0, w: 0, d: 0, l: 0, seasons: 0 }; withRng(s, (rng) => { while (s.phase === 'regular') stepOnce(s, rng, rep); }); s.nextGameAt = null; s.lastSeen = now; },
};
export const teamCA = (t) => avg(t.players.map(caOf));

export * from './market.js';
