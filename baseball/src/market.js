// 계약 / 자유계약(FA) / 트레이드 / 드래프트 / 오퍼
import { Lof, userTeam, addNews, payroll, budgetOf, ctxOf, teamOvr } from './core.js';
import { ovrOf, valueOf, marketWage, genPlayer, rollHype } from './player.js';
import { autoRoster } from './roster.js';
import { POSITIONS } from './data.js';
import { clamp, r2, fuzz, fmtMoney } from './util.js';

export const LOCK_DAYS = 25;
export const ASIA_CAP = 3.0; // 억 원 (약 20만 달러)
export const rosterMax = (s) => Lof(s).active + Lof(s).farmMax;
export const rosterMin = (s) => Lof(s).active + 4;
export const dayOf = (s) => (s.sched ? s.sched.idx : 0);
export const lockLeft = (s, p) => Math.max(0, (p.lock || 0) - dayOf(s));

export function tradeOpen(s) {
  if (s.phase === 'offseason') return true;
  if (s.phase !== 'regular') return false;
  return s.sched.idx < Math.floor(s.sched.rounds.length * Lof(s).tradeDeadline);
}

// ───────── 연봉 / 계약 ─────────
export const askSalary = (s, p) => {
  const L = Lof(s);
  const base = marketWage(L, ovrOf(p), p.age) * (p.fx ? 1.15 : 1.08);
  const v = r2(Math.max(L.minSal, base * (s.phase === 'regular' ? 0.78 : 1)));
  return p.fx === 2 ? Math.min(v, ASIA_CAP) : v; // 아시아쿼터: 신규 영입 연봉·계약금 합계 20만 달러 한도
};
export const maxYears = (p) => (p.age >= 36 ? 1 : p.age >= 33 ? 2 : p.age >= 30 ? 4 : 6);
export function releaseCost(s, p) { return r2(p.sal * Math.max(1, p.yrs) * 0.5); }
export function foreignCount(t, fx) { return t.players.filter((p) => p.fx === fx).length; }
export const FOREIGN_MAX = { 1: 3, 2: 1 };
const total = (t) => t.players.length;

function fixUser(s) {
  const t = userTeam(s);
  if (s.settings.autoRoster) autoRoster(t, Lof(s));
}

export function release(s, pid) {
  const t = userTeam(s);
  const p = t.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (total(t) <= rosterMin(s)) return { ok: false, err: 'min' };
  const cost = releaseCost(s, p);
  s.money = r2(s.money - cost);
  t.players.splice(t.players.indexOf(p), 1);
  p.act = 0; p.yrs = 0; p.lock = 0;
  if (ovrOf(p) >= 38) s.market.free.push(p);
  addNews(s, 'contract', `${p.name} 방출 (위약금 ${fmtMoney(s.country, cost)})`);
  fixUser(s);
  return { ok: true, cost };
}
export function setActive(s, pid, act) {
  const L = Lof(s);
  const t = userTeam(s);
  const p = t.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (act) {
    if (p.inj > 0) return { ok: false, err: 'injured' };
    if (t.players.filter((x) => x.act).length >= L.active) return { ok: false, err: 'full' };
    p.act = 1;
  } else p.act = 0;
  return { ok: true };
}
export function extend(s, pid, yrs) {
  const L = Lof(s);
  const t = userTeam(s);
  const p = t.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (s.phase !== 'offseason') return { ok: false, err: 'phase' };
  yrs = clamp(yrs | 0, 1, maxYears(p));
  const sal = r2(Math.max(L.minSal, marketWage(L, ovrOf(p), p.age) * (1.04 + 0.025 * (yrs - 1))));
  p.sal = Math.max(sal, p.svc < L.faAt ? p.sal : 0);
  p.yrs = yrs;
  p.ext = 1;
  return { ok: true, sal: p.sal, yrs };
}
export const extendQuote = (s, p, yrs) => r2(Math.max(Lof(s).minSal, marketWage(Lof(s), ovrOf(p), p.age) * (1.04 + 0.025 * (yrs - 1))));

// ───────── 자유계약 ─────────
export function poolOf(s, src) { return src === 'foreign' ? s.market.foreign : s.market.free; }
export function signFA(s, pid, yrs, src = 'free') {
  const t = userTeam(s);
  const pool = poolOf(s, src);
  const p = pool.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (total(t) >= rosterMax(s)) return { ok: false, err: 'full' };
  if (s.money < 0) return { ok: false, err: 'money' };
  if (p.fx && foreignCount(t, p.fx) >= FOREIGN_MAX[p.fx]) return { ok: false, err: 'foreign' };
  yrs = clamp(yrs | 0, 1, maxYears(p));
  const sal = askSalary(s, p);
  pool.splice(pool.indexOf(p), 1);
  p.sal = sal; p.yrs = yrs; p.act = 0; p.lock = dayOf(s) + LOCK_DAYS;
  t.players.push(p);
  addNews(s, 'contract', `${p.name} 영입 (${yrs}년, 연봉 ${fmtMoney(s.country, sal)})`);
  fixUser(s);
  return { ok: true, sal };
}

// ───────── 트레이드 ─────────
function contractValue(L, p) {
  const sur = (marketWage(L, ovrOf(p), p.age) - p.sal) * Math.min(Math.max(1, p.yrs), 3);
  return clamp((sur / L.wage.base) * 1.2, -6, 10);
}
export const tradeValue = (L, p) => Math.max(0.5, valueOf(p) + contractValue(L, p));
function bundle(L, list) {
  const v = list.map((p) => tradeValue(L, p)).sort((a, b) => b - a);
  return v.reduce((a, x, i) => a + (i === 0 ? x : x * 0.6), 0);
}
export function tradeCheck(s, teamId, giveIds, getIds) {
  const L = Lof(s);
  const me = userTeam(s), ai = s.teams[teamId];
  if (!ai || teamId === s.userId) return { ok: false, err: 'notfound' };
  if (!tradeOpen(s)) return { ok: false, err: 'window' };
  const give = giveIds.map((id) => me.players.find((p) => p.id === id));
  const get = getIds.map((id) => ai.players.find((p) => p.id === id));
  if (give.some((x) => !x) || get.some((x) => !x)) return { ok: false, err: 'notfound' };
  if (!give.length || !get.length) return { ok: false, err: 'empty' };
  if (give.length > 3 || get.length > 3) return { ok: false, err: 'toomany' };
  if (give.some((p) => lockLeft(s, p) > 0)) return { ok: false, err: 'locked' };
  const mine = bundle(L, give), theirs = bundle(L, get);
  const ratio = mine / Math.max(0.1, theirs);
  const meAfter = total(me) - give.length + get.length, aiAfter = total(ai) - get.length + give.length;
  if (meAfter > rosterMax(s)) return { ok: false, err: 'full', mine, theirs, ratio };
  if (aiAfter > rosterMax(s) || meAfter < rosterMin(s) || aiAfter < rosterMin(s)) return { ok: false, err: 'rosterAI', mine, theirs, ratio };
  if (L.foreign) {
    for (const fx of [1, 2]) {
      const mf = foreignCount(me, fx) - give.filter((p) => p.fx === fx).length + get.filter((p) => p.fx === fx).length;
      const af = foreignCount(ai, fx) - get.filter((p) => p.fx === fx).length + give.filter((p) => p.fx === fx).length;
      if (mf > FOREIGN_MAX[fx] || af > FOREIGN_MAX[fx]) return { ok: false, err: 'foreign', mine, theirs, ratio };
    }
  }
  const aiPay = payroll(ai) - get.reduce((a, p) => a + p.sal, 0) + give.reduce((a, p) => a + p.sal, 0);
  if (aiPay > budgetOf(s, ai) * 1.25 && aiPay > payroll(ai)) return { ok: false, err: 'payAI', mine, theirs, ratio };
  if (ratio < 1.1) return { ok: false, err: 'value', mine, theirs, ratio };
  return { ok: true, mine, theirs, ratio, give, get };
}
export function trade(s, teamId, giveIds, getIds) {
  const r = tradeCheck(s, teamId, giveIds, getIds);
  if (!r.ok) return r;
  const me = userTeam(s), ai = s.teams[teamId];
  for (const p of r.give) { me.players.splice(me.players.indexOf(p), 1); p.act = 0; p.lock = dayOf(s) + 10; ai.players.push(p); }
  for (const p of r.get) { ai.players.splice(ai.players.indexOf(p), 1); p.act = 0; p.lock = dayOf(s) + 10; me.players.push(p); }
  autoRoster(ai, Lof(s));
  fixUser(s);
  addNews(s, 'trade', `트레이드: ${r.give.map((p) => p.name).join(', ')} ↔ ${r.get.map((p) => p.name).join(', ')} (${ai.short})`);
  return { ok: true };
}

// AI 구단이 먼저 제안하는 트레이드
export function genOffers(s, rng) {
  s.offers = s.offers.filter((o) => o.until > dayOf(s));
  if (s.offers.length >= 2 || !tradeOpen(s) || !rng.chance(0.3)) return;
  const L = Lof(s);
  const me = userTeam(s);
  const ai = rng.pick(s.teams.filter((t) => t.id !== s.userId));
  const cand = me.players.filter((p) => lockLeft(s, p) <= 0 && tradeValue(L, p) > 12).sort((a, b) => b.id - a.id);
  if (!cand.length) return;
  const want = rng.pick(cand);
  const target = bundle(L, [want]) / 1.18;
  const mine = ai.players.filter((p) => p.role === want.role).sort((a, b) => Math.abs(tradeValue(L, a) - target) - Math.abs(tradeValue(L, b) - target));
  const give = mine[0];
  if (!give || s.offers.some((o) => o.askId === want.id)) return;
  s.offers.push({ id: ++s.seq, teamId: ai.id, askId: want.id, giveIds: [give.id], until: dayOf(s) + 12 });
}
export function acceptOffer(s, oid) {
  const o = s.offers.find((x) => x.id === oid);
  if (!o) return { ok: false, err: 'notfound' };
  const r = tradeCheck(s, o.teamId, [o.askId], o.giveIds);
  const ok = r.ok || r.err === 'value'; // 제안은 AI가 낸 것이므로 가치 비교는 통과로 본다
  if (!ok) { s.offers = s.offers.filter((x) => x !== o); return r; }
  const L = Lof(s);
  const me = userTeam(s), ai = s.teams[o.teamId];
  const p = me.players.find((x) => x.id === o.askId);
  const g = o.giveIds.map((id) => ai.players.find((x) => x.id === id));
  if (!p || g.some((x) => !x)) { s.offers = s.offers.filter((x) => x !== o); return { ok: false, err: 'notfound' }; }
  me.players.splice(me.players.indexOf(p), 1); ai.players.push(p); p.act = 0; p.lock = dayOf(s) + 10;
  for (const q of g) { ai.players.splice(ai.players.indexOf(q), 1); me.players.push(q); q.act = 0; q.lock = dayOf(s) + 10; }
  autoRoster(ai, L); fixUser(s);
  s.offers = s.offers.filter((x) => x !== o);
  addNews(s, 'trade', `${ai.short}와 트레이드: ${p.name} ↔ ${g.map((q) => q.name).join(', ')}`);
  return { ok: true };
}

// ───────── 스카우트 / 잠재력 추정 ─────────
export function potEstimate(s, p) {
  const own = userTeam(s).players.includes(p);
  if (own) return { mid: p.pot, lo: p.pot, hi: p.pot, err: 0 };
  const err = p.age >= 28 ? 1 : Math.max(2, Math.round(12 - 1.2 * s.fac.scout));
  const mid = clamp(Math.round(p.pot + fuzz(p.id, 3) * err * 0.5), ovrOf(p), 99);
  return { mid, lo: Math.max(ovrOf(p), mid - err), hi: Math.min(99, mid + err), err };
}

// ───────── 드래프트 ─────────
export function makeDraft(s, rng) {
  const L = Lof(s);
  const ctx = ctxOf(s, rng);
  const n = L.draftN + 30;
  const pool = [];
  for (let i = 0; i < n; i++) {
    const hype = rollHype(rng, 0);
    const pos = rng.pick([...POSITIONS.filter((x) => x !== 'DH'), 'SP', 'SP', 'SP', 'RP', 'RP']);
    const age = rng.int(18, 22);
    const ovr = clamp(rng.normal(38 + hype * 3.2, 4), 28, 60);
    const p = genPlayer(ctx, { pos, ovr, age, hype, act: 0, svc: 0 });
    p.sal = L.minSal; p.yrs = 3; p.svc = 0;
    pool.push(p);
  }
  pool.sort((a, b) => b.pot - a.pot);
  const rank = s.teams.map((t) => ({ id: t.id, v: t.w / Math.max(1, t.w + t.l) + t.id * 1e-6 })).sort((a, b) => a.v - b.v).map((x) => x.id);
  const order = [];
  for (let r = 0; r < L.draftRounds; r++) order.push(...rank);
  return { pool, order, idx: 0, picks: [] };
}
export const draftCurrent = (d) => (d && d.idx < d.order.length ? d.order[d.idx] : -1);
function takePick(s, d, teamId, p) {
  d.pool.splice(d.pool.indexOf(p), 1);
  const t = s.teams[teamId];
  t.players.push(p);
  p.act = 0; p.lock = 0;
  d.picks.push({ teamId, pid: p.id, round: Math.floor(d.idx / s.teams.length) + 1 });
  d.idx++;
}
export function draftAIRun(s, rng) {
  const d = s.offseason && s.offseason.draft;
  if (!d) return;
  while (d.idx < d.order.length && d.order[d.idx] !== s.userId) {
    const pick = d.pool.map((p) => ({ p, v: valueOf(p) * (1 + rng.normal(0, 0.12)) })).sort((a, b) => b.v - a.v)[0];
    if (!pick) { d.idx = d.order.length; break; }
    takePick(s, d, d.order[d.idx], pick.p);
  }
  if (d.idx >= d.order.length && !d.done) d.done = true;
}
export function draftPickUser(s, pid, rng) {
  const d = s.offseason && s.offseason.draft;
  if (!d || draftCurrent(d) !== s.userId) return { ok: false, err: 'turn' };
  const p = d.pool.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  takePick(s, d, s.userId, p);
  addNews(s, 'draft', `드래프트 ${d.picks[d.picks.length - 1].round}라운드: ${p.name} 지명`);
  draftAIRun(s, rng);
  return { ok: true, p };
}
// 내 차례를 모두 추천 순으로 자동 진행
export function draftAuto(s, rng) {
  const d = s.offseason && s.offseason.draft;
  if (!d) return;
  let guard = 0;
  while (d.idx < d.order.length && guard++ < 1000) {
    if (d.order[d.idx] === s.userId) {
      const best = d.pool.map((p) => ({ p, v: valueOf({ ...p, pot: potEstimate(s, p).mid }) })).sort((a, b) => b.v - a.v)[0];
      if (!best) break;
      takePick(s, d, s.userId, best.p);
    } else draftAIRun(s, rng);
  }
  d.done = true;
}

// ───────── 자유계약 풀 생성 ─────────
export function genFreePool(s, rng, n = 36) {
  const L = Lof(s);
  const ctx = ctxOf(s, rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = rng.pick([...POSITIONS.filter((x) => x !== 'DH'), 'SP', 'RP', 'RP']);
    const ovr = clamp(rng.normal(43, 6), 30, 62);
    const p = genPlayer(ctx, { pos, ovr, age: rng.int(24, 35), hype: 0, act: 0 });
    p.svc = L.faAt; p.sal = L.minSal; p.yrs = 0;
    out.push(p);
  }
  return out;
}
export function genForeignPool(s, rng, n = 12) {
  const L = Lof(s);
  if (!L.foreign) return [];
  const ctx = ctxOf(s, rng);
  const out = [];
  for (let i = 0; i < n; i++) {
    const asia = i < 3;
    const pos = asia ? rng.pick(['SP', 'RP', 'SS', 'CF']) : rng.pick(['SP', 'SP', 'SP', 'RP', '1B', 'RF', 'LF', '3B']);
    const ovr = clamp(rng.normal(asia ? 54 : 60, 6), 44, 78);
    const p = genPlayer(ctx, { pos, ovr, age: rng.int(24, 35), hype: 0, act: 0, fx: asia ? 2 : 1, lang: asia ? 'jp' : 'en' });
    p.svc = L.faAt; p.yrs = 0;
    out.push(p);
  }
  return out;
}
export { teamOvr };
