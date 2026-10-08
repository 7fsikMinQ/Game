// 상태 공용 도우미. game.js / market.js 가 같이 쓴다.
import { createRng } from './rng.js';
import { LEAGUES } from './league.js';

export const userTeam = (s) => s.teams[s.userId];
export const userDiv = (s) => s.divs[s.teams[s.userId].div];
export const divCfg = (s, di) => LEAGUES[s.country].divs[di];
export const rulesOf = (s) => LEAGUES[s.country].rules;
export const findPlayer = (s, id) => { for (const t of s.teams) { const p = t.players.find((x) => x.id === id); if (p) return p; } return null; };
export const seasonLabel = (s, k = s.season) => `${2026 + k - 1}-${String((2027 + k - 1) % 100).padStart(2, '0')}`;

export function withRng(s, fn) {
  const rng = createRng(s.rng);
  const out = fn(rng);
  s.rng = rng.state();
  return out;
}
export const ctxOf = (s, rng) => ({ rng, nextId: () => s.nextPid++, used: new Set(s.teams.flatMap((t) => t.players.map((p) => p.name))) });

export function addNews(s, kind, text) {
  s.news.unshift({ season: s.season, round: userDiv(s).roundIdx, kind, text });
  if (s.news.length > 40) s.news.length = 40;
}

// 수입: 평판에 지수로 비례(임금도 능력에 지수로 비례하므로 균형을 맞춘다). 값은 리그/부 별 기준치(rev)에서 시작.
export function annualRevenue(s, t) {
  const dc = divCfg(s, t.div);
  const mid = (dc.rep[0] + dc.rep[1]) / 2;
  return dc.rev * Math.exp(0.055 * dc.caSlope * (t.rep - mid));
}
export const roundsOf = (s, di = s.teams[s.userId].div) => s.divs[di].rounds.length;
