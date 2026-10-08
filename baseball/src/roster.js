// 라인업/로테이션 자동 구성과 1군 엔트리 관리
import { POSITIONS } from './data.js';
import { ovrOf, hitScore, slotScore, slotFld, isHit } from './player.js';

const order = ['C', 'SS', 'CF', '2B', '3B', 'RF', 'LF', '1B'];
export const healthy = (p) => p.inj <= 0;

// 건강한 1군 타자 중 수비 8자리 + DH. 모자라면 2군에서 빌린다(경기에만 사용, 엔트리는 그대로).
export function buildLineup(team, user = false) {
  let pool = team.players.filter((p) => isHit(p) && p.act && healthy(p));
  if (pool.length < 9) pool = pool.concat(team.players.filter((p) => isHit(p) && !p.act && healthy(p)).sort((a, b) => ovrOf(b) - ovrOf(a)).slice(0, 9 - pool.length));
  if (pool.length < 9) pool = pool.concat(team.players.filter((p) => isHit(p) && !healthy(p)).slice(0, 9 - pool.length));
  const used = new Set();
  const slots = [];
  // 사용자가 정한 라인업이 있으면 우선
  const lock = user && team.lineup && !team.auto ? team.lineup : null;
  for (const pos of order) {
    let best = null, bv = -1e9;
    const lp = lock && lock[pos] != null ? pool.find((p) => p.id === lock[pos] && !used.has(p.id)) : null;
    if (lp) best = lp;
    else for (const p of pool) { if (used.has(p.id)) continue; const v = slotScore(p, pos) + (p.pos === pos ? 1.5 : 0); if (v > bv) { bv = v; best = p; } }
    if (best) { used.add(best.id); slots.push({ p: best, pos }); }
  }
  let dh = lock && lock.DH != null ? pool.find((p) => p.id === lock.DH && !used.has(p.id)) : null;
  if (!dh) dh = pool.filter((p) => !used.has(p.id)).sort((a, b) => hitScore(b) - hitScore(a))[0] || pool[0];
  if (dh) slots.push({ p: dh, pos: 'DH' });
  return slots;
}
// 타순: 컨택/선구가 좋은 선수를 앞에, 가장 강한 타자를 3번에
export function battingOrder(slots) {
  const sorted = slots.slice().sort((a, b) => hitScore(b.p) - hitScore(a.p));
  const idx = [1, 3, 0, 2, 4, 5, 6, 7, 8];
  return idx.map((i) => sorted[i % sorted.length]);
}
export const fieldPos = (slots) => Object.fromEntries(slots.map((x) => [x.pos, x.p]));
export function teamDefense(slots) {
  const v = slots.filter((x) => x.pos !== 'DH').map((x) => slotFld(x.p, x.pos));
  return v.reduce((a, b) => a + b, 0) / (v.length || 1);
}

export const rotationOf = (team) => team.players.filter((p) => p.pos === 'SP' && p.act).sort((a, b) => a.id - b.id);
export function nextStarter(team) {
  const sp = rotationOf(team);
  const ok = sp.filter((p) => healthy(p));
  if (!ok.length) {
    const alt = team.players.filter((p) => p.role === 'P' && healthy(p)).sort((a, b) => b.sta - a.sta)[0];
    return alt || sp[0] || team.players.find((p) => p.role === 'P');
  }
  // 가장 오래 쉰 선발
  return ok.slice().sort((a, b) => b.rest - a.rest || a.id - b.id)[0];
}
export const bullpenOf = (team, starter) => team.players.filter((p) => p.role === 'P' && p !== starter && p.act && healthy(p) && p.fat < 55).sort((a, b) => ovrOf(b) - ovrOf(a));

// ───────── 1군 엔트리 ─────────
export function counts(team) {
  const a = team.players.filter((p) => p.act);
  return { total: a.length, H: a.filter(isHit).length, SP: a.filter((p) => p.pos === 'SP').length, RP: a.filter((p) => p.pos === 'RP').length, C: a.filter((p) => p.pos === 'C').length };
}
// 최적 엔트리를 자동으로 고른다. 부상자는 제외.
export function autoRoster(team, L) {
  const ok = team.players.filter(healthy);
  const hit = ok.filter(isHit).sort((a, b) => ovrOf(b) - ovrOf(a));
  const sp = ok.filter((p) => p.pos === 'SP').sort((a, b) => ovrOf(b) - ovrOf(a));
  const rp = ok.filter((p) => p.pos === 'RP').sort((a, b) => ovrOf(b) - ovrOf(a));
  const nP = L.active - L.nH;
  const pick = new Set();
  const take = (arr, n) => { for (const p of arr) { if (n <= 0) break; if (!pick.has(p.id)) { pick.add(p.id); n--; } } };
  // 포수 2명, 선발 5명은 우선
  take(hit.filter((p) => p.pos === 'C'), 2);
  take(sp, L.nSP);
  take(hit, L.nH - [...pick].filter((id) => hit.some((h) => h.id === id)).length);
  const havePitch = () => ok.filter((p) => p.role === 'P' && pick.has(p.id)).length;
  take(rp, nP - havePitch());
  take(sp.slice(L.nSP), nP - havePitch());
  // 한 역할이 모자라면 남은 건강한 선수 중 가장 좋은 선수로 채운다
  if (pick.size < L.active) take([...hit, ...sp, ...rp].sort((a, b) => ovrOf(b) - ovrOf(a)), L.active - pick.size);
  // 부상자는 자동으로 2군(IL) 처리
  for (const p of team.players) p.act = pick.has(p.id) ? 1 : 0;
}
// 엔트리가 올바른지(타자 수, 선발, 포수, 총원)
export function validateRoster(team, L) {
  const c = counts(team);
  const bad = [];
  if (c.total > L.active) bad.push(`1군 엔트리는 ${L.active}명까지입니다 (현재 ${c.total}명)`);
  if (c.total < L.active - 3) bad.push(`1군이 ${c.total}명뿐입니다`);
  if (c.SP < 4) bad.push('선발 투수가 4명 이상 필요합니다');
  if (c.C < 1) bad.push('1군에 포수가 필요합니다');
  if (c.H < 10) bad.push('1군 타자가 10명 이상 필요합니다');
  return bad;
}
export { POSITIONS };
