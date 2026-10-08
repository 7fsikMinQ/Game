// 상태 공용 도우미 (game.js / market.js 가 같이 쓴다)
import { createRng } from './rng.js';
import { LEAGUES } from './data.js';
import { ovrOf, marketWage } from './player.js';
import { clamp, r2 } from './util.js';

export const Lof = (s) => LEAGUES[s.country];
export const userTeam = (s) => s.teams[s.userId];
export const findPlayer = (s, id) => { for (const t of s.teams) { const p = t.players.find((x) => x.id === id); if (p) return { p, t }; } return null; };
export const seasonYear = (s, k = s.season) => 2026 + k - 1;
export const seasonLabel = (s, k = s.season) => `${seasonYear(s, k)} 시즌`;

export function withRng(s, fn) {
  const rng = createRng(s.rng);
  const out = fn(rng);
  s.rng = rng.state();
  return out;
}
export const ctxOf = (s, rng) => ({ rng, nextId: () => s.nextPid++, used: new Set(s.teams.flatMap((t) => t.players.map((p) => p.name))), L: Lof(s), lang: s.country === 'kbo' ? 'kr' : 'en' });

export function addNews(s, kind, text) {
  s.news.unshift({ season: s.season, day: s.sched ? s.sched.idx : 0, kind, text });
  if (s.news.length > 40) s.news.length = 40;
}

// ───────── 재정 ─────────
export const payroll = (t) => r2(t.players.reduce((a, p) => a + p.sal, 0));
// KBO 경쟁균형세 기준: 연봉 상위 40명 합계(외국인·신인 제외)
export function capPayroll(t) {
  const v = t.players.filter((p) => !p.fx && p.svc > 1).map((p) => p.sal).sort((a, b) => b - a).slice(0, 40);
  return r2(v.reduce((a, b) => a + b, 0));
}
export function annualRevenue(s, t, fac = null) {
  const L = Lof(s);
  const f = fac || (t.id === s.userId ? s.fac : null);
  const stadium = f ? 1 + 0.04 * f.stadium : 1;
  return r2(L.rev0 * t.mkt * (0.8 + 0.4 * (t.fan / 100)) * stadium);
}
export const budgetOf = (s, t) => r2(annualRevenue(s, t, { stadium: 0 }) * Lof(s).budgetShare * 1.0);
export function annualOpex(s, t) {
  const L = Lof(s);
  const rev = annualRevenue(s, t, { stadium: 0 });
  const fac = t.id === s.userId ? s.fac.stadium + s.fac.camp + s.fac.scout + s.fac.medical : 0;
  return r2(rev * (1 - L.budgetShare - 0.07) + rev * 0.005 * fac);
}
export const teamOvr = (t) => {
  const act = t.players.filter((p) => p.act);
  const h = act.filter((p) => p.role === 'H').map(ovrOf).sort((a, b) => b - a).slice(0, 9);
  const sp = act.filter((p) => p.pos === 'SP').map(ovrOf).sort((a, b) => b - a).slice(0, 5);
  const rp = act.filter((p) => p.pos === 'RP').map(ovrOf).sort((a, b) => b - a).slice(0, 6);
  const m = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 40);
  const bat = m(h), st = m(sp), pen = m(rp);
  return { bat, sp: st, rp: pen, total: bat * 0.5 + st * 0.35 + pen * 0.15 };
};
export const winPct = (t) => (t.w + t.l ? t.w / (t.w + t.l) : 0);
export { marketWage, clamp };
