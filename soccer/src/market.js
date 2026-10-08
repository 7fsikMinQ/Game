// 이적시장: 영입·매각·임대·제안·자유계약·유스. 이적 가능 기간(윈도우)을 지켜야 한다.
import { SQUAD_PLAN, SQUAD_MIN, SQUAD_MAX } from './data.js';
import { windowState } from './league.js';
import { genPlayer, caOf, valueOf, wageOf } from './player.js';
import { clamp, fmtMoney } from './util.js';
import { userTeam, userDiv, rulesOf, withRng, ctxOf, addNews } from './core.js';

export const windowInfo = (s) => { const d = userDiv(s); return windowState(rulesOf(s), s.phase, d.roundIdx, d.rounds.length); };
const r100 = (x) => Math.round(x / 100) * 100;
export const askPrice = (p) => r100(valueOf(p) * 1.2);
export const freePrice = (p) => r100(wageOf(p) * 0.2); // 자유계약: 계약 보너스만
// 이적료 없이 공짜로 데려온 선수(자유계약)는 팔 때도 가치의 25%만 쳐준다 (공짜로 데려와 비싸게 파는 차익 방지)
export const freeSigned = (p) => p.acq != null && !p.fee && !p.loan;
export const tradeValue = (p) => valueOf(p) * (freeSigned(p) ? 0.25 : 1);
export const sellPrice = (p) => r100(tradeValue(p) * 0.85);
export const loanFee = (p) => r100(valueOf(p) * 0.06);
export const optionPrice = (p) => r100(valueOf(p) * 1.1);
// 영입한 선수는 19라운드 동안 팔 수 없다(영입→즉시 매각으로 돈 버는 것을 막는다)
export const LOCK_ROUNDS = 19;
export const absRound = (s) => (s.season - 1) * 60 + (s.tick || 0);
export const lockLeft = (s, p) => (p.acq == null ? 0 : Math.max(0, LOCK_ROUNDS - (absRound(s) - p.acq)));
export const releaseCost = (p) => (p.ctr > 0 ? r100(p.w * Math.min(p.ctr, 3) * 0.4) : 0);

export const loansIn = (s) => userTeam(s).players.filter((p) => p.loan && p.loan.from !== s.userId);
export const loansOut = (s) => s.teams.flatMap((t) => (t.id === s.userId ? [] : t.players.filter((p) => p.loan && p.loan.from === s.userId).map((p) => ({ p, t }))));

// ───────── 목록 갱신 ─────────
export function refreshMarket(s, rng) {
  const ctx = ctxOf(s, rng);
  const ai = s.teams.filter((t) => t.id !== s.userId);
  const pool = ai.flatMap((t) => t.players.filter((p) => !p.loan).map((p) => ({ p, t })));
  const top = pool.slice().sort((a, b) => caOf(b.p) - caOf(a.p)).slice(0, 3).map((x) => x.p.id);
  const rand = rng.shuffle(pool).slice(0, 24).map((x) => x.p.id);
  const lendable = ai.flatMap((t) => { const rank = t.players.slice().sort((a, b) => caOf(b) - caOf(a)); return rank.slice(13).filter((p) => !p.loan && p.age <= 28).map((p) => ({ p, t })); });
  const loan = rng.shuffle(lendable).slice(0, 14).map((x) => x.p.id);
  const keepFree = (s.market.free || []).filter((p) => p.keep);
  const free = [...keepFree];
  for (let i = 0; i < 10; i++) {
    // 자유계약 시장에는 '남는 선수'만 있다: 능력이 낮은 고령 선수 또는 아직 덜 큰 어린 선수 (좋은 선수는 시장에 안 나온다)
    const old = rng.chance(0.7);
    const p = genPlayer(ctx, { pos: rng.pick(SQUAD_PLAN), ca: clamp(Math.round(rng.normal(old ? 78 : 52, old ? 12 : 10)), 30, 115), age: old ? rng.int(29, 36) : rng.int(18, 21), hype: 0 });
    p.ctr = 0;
    free.push(p);
  }
  s.market = { list: [...new Set([...top, ...rand])], loan, free, at: s.tick || 0 };
}
const lookup = (s, ids) => ids.map((id) => { for (const t of s.teams) { if (t.id === s.userId) continue; const p = t.players.find((x) => x.id === id); if (p) return { p, t }; } return null; }).filter(Boolean);
export const marketPlayers = (s) => lookup(s, s.market.list);
export const loanCandidates = (s) => lookup(s, s.market.loan).filter((x) => !x.p.loan);

function canLeave(s, p) {
  const me = userTeam(s);
  if (me.players.length <= SQUAD_MIN) return 'min';
  if (p.pos === 'GK' && me.players.filter((x) => x.pos === 'GK').length <= 2) return 'gk';
  return null;
}
const needWindow = (s) => (windowInfo(s).open ? null : 'window');

// ───────── 영입 / 매각 ─────────
export function buyPlayer(s, pid) {
  const e = needWindow(s);
  if (e) return { ok: false, err: e };
  const hit = marketPlayers(s).find((x) => x.p.id === pid);
  if (!hit) return { ok: false, err: 'notfound' };
  const me = userTeam(s);
  const price = askPrice(hit.p);
  if (me.players.length >= SQUAD_MAX) return { ok: false, err: 'full' };
  if (s.money < price) return { ok: false, err: 'money', price };
  withRng(s, (rng) => {
    const ctx = ctxOf(s, rng);
    hit.t.players.splice(hit.t.players.indexOf(hit.p), 1);
    hit.t.players.push(genPlayer(ctx, { pos: hit.p.pos, ca: clamp(caOf(hit.p) - rng.int(4, 14), 25, 160), age: rng.int(21, 29) }));
  });
  s.money -= price;
  Object.assign(hit.p, { fee: price, cy: 4, ctr: 4, mor: 75, loan: null, w: wageOf(hit.p), acq: absRound(s) });
  me.players.push(hit.p);
  s.market.list = s.market.list.filter((id) => id !== pid);
  addNews(s, 'transfer', `${hit.p.name} 영입 (${hit.t.name}, 이적료 ${fmtMoney(price)})`);
  return { ok: true, price, p: hit.p };
}

export function signFree(s, pid) {
  const i = s.market.free.findIndex((p) => p.id === pid);
  if (i < 0) return { ok: false, err: 'notfound' };
  const p = s.market.free[i];
  const me = userTeam(s);
  const price = freePrice(p);
  if (me.players.length >= SQUAD_MAX) return { ok: false, err: 'full' };
  if (s.money < price) return { ok: false, err: 'money', price };
  s.money -= price;
  s.market.free.splice(i, 1);
  Object.assign(p, { ctr: 3, cy: 3, fee: 0, w: wageOf(p), mor: 75, keep: false, acq: absRound(s) });
  me.players.push(p);
  addNews(s, 'transfer', `${p.name} 자유계약 영입`);
  return { ok: true, price, p };
}

function sendToAI(s, p, rng, destTeam) {
  const dest = destTeam || rng.pick(s.teams.filter((t) => t.id !== s.userId));
  if (dest.players.length >= 26) {
    const worst = dest.players.filter((x) => (x.pos === 'GK') === (p.pos === 'GK') && !x.loan).sort((a, b) => caOf(a) - caOf(b))[0];
    if (worst) dest.players.splice(dest.players.indexOf(worst), 1);
  }
  dest.players.push(p);
  return dest;
}
const clearTrade = (s, pid) => { s.listings = s.listings.filter((l) => l.pid !== pid); s.offers = s.offers.filter((o) => o.pid !== pid); };

export function sellPlayer(s, pid) {
  const e = needWindow(s);
  if (e) return { ok: false, err: e };
  const me = userTeam(s);
  const p = me.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (p.loan && p.loan.from !== s.userId) return { ok: false, err: 'loaned' };
  if (lockLeft(s, p) > 0) return { ok: false, err: 'locked', left: lockLeft(s, p) };
  const le = canLeave(s, p);
  if (le) return { ok: false, err: le };
  const price = sellPrice(p);
  me.players.splice(me.players.indexOf(p), 1);
  me.manual = null;
  s.money += price;
  clearTrade(s, pid);
  const dest = withRng(s, (rng) => sendToAI(s, p, rng));
  p.fee = 0; p.cy = 0;
  addNews(s, 'transfer', `${p.name} 매각 (${dest.name}, ${fmtMoney(price)})`);
  return { ok: true, price };
}

export function releasePlayer(s, pid) {
  const me = userTeam(s);
  const p = me.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (p.loan && p.loan.from !== s.userId) return { ok: false, err: 'loaned' };
  const le = canLeave(s, p);
  if (le) return { ok: false, err: le };
  const cost = releaseCost(p);
  if (s.money < cost) return { ok: false, err: 'money', cost };
  s.money -= cost;
  me.players.splice(me.players.indexOf(p), 1);
  me.manual = null;
  clearTrade(s, pid);
  Object.assign(p, { ctr: 0, loan: null, keep: true });
  s.market.free.push(p);
  return { ok: true, cost };
}

// ───────── 임대 ─────────
export function loanIn(s, pid) {
  const e = needWindow(s);
  if (e) return { ok: false, err: e };
  const rules = rulesOf(s);
  if (loansIn(s).length >= rules.loanInMax) return { ok: false, err: 'limit', max: rules.loanInMax };
  const hit = loanCandidates(s).find((x) => x.p.id === pid);
  if (!hit) return { ok: false, err: 'notfound' };
  const me = userTeam(s);
  const fee = loanFee(hit.p);
  if (me.players.length >= SQUAD_MAX) return { ok: false, err: 'full' };
  if (s.money < fee) return { ok: false, err: 'money', price: fee };
  s.money -= fee;
  hit.t.players.splice(hit.t.players.indexOf(hit.p), 1);
  hit.p.loan = { from: hit.t.id, until: s.season, opt: optionPrice(hit.p), fee };
  hit.p.mor = 75;
  me.players.push(hit.p);
  s.market.loan = s.market.loan.filter((id) => id !== pid);
  addNews(s, 'loan', `${hit.p.name} 임대 영입 (${hit.t.name}, 임대료 ${fmtMoney(fee)} + 연봉 부담)`);
  return { ok: true, fee, p: hit.p };
}
export function buyOption(s, pid) {
  const p = userTeam(s).players.find((x) => x.id === pid);
  if (!p || !p.loan || p.loan.from === s.userId) return { ok: false, err: 'notfound' };
  const price = p.loan.opt;
  if (s.money < price) return { ok: false, err: 'money', price };
  s.money -= price;
  Object.assign(p, { fee: price, cy: 4, ctr: 4, loan: null });
  addNews(s, 'transfer', `${p.name} 완전 영입 (옵션 ${fmtMoney(price)})`);
  return { ok: true, price };
}
export function loanOut(s, pid) {
  const e = needWindow(s);
  if (e) return { ok: false, err: e };
  const rules = rulesOf(s);
  if (loansOut(s).length >= rules.loanOutMax) return { ok: false, err: 'limit', max: rules.loanOutMax };
  const me = userTeam(s);
  const p = me.players.find((x) => x.id === pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (p.loan) return { ok: false, err: 'loaned' };
  const le = canLeave(s, p);
  if (le) return { ok: false, err: le };
  const fee = r100(valueOf(p) * 0.04);
  me.players.splice(me.players.indexOf(p), 1);
  me.manual = null;
  clearTrade(s, pid);
  const dest = withRng(s, (rng) => sendToAI(s, p, rng));
  p.loan = { from: s.userId, to: dest.id, until: s.season, fee };
  s.money += fee;
  addNews(s, 'loan', `${p.name} 임대 보냄 (${dest.name}, 임대료 ${fmtMoney(fee)} 수령, 연봉은 상대 부담)`);
  return { ok: true, fee, dest };
}
export function recallLoan(s, pid) {
  const hit = loansOut(s).find((x) => x.p.id === pid);
  if (!hit) return { ok: false, err: 'notfound' };
  const me = userTeam(s);
  const refund = hit.p.loan.fee || 0; // 받은 임대료를 돌려준다(복귀 → 재임대로 임대료를 반복해서 받는 것을 막는다)
  s.money -= refund;
  hit.t.players.splice(hit.t.players.indexOf(hit.p), 1);
  hit.p.loan = null;
  me.players.push(hit.p);
  me.manual = null;
  addNews(s, 'loan', `${hit.p.name} 임대 복귀 (임대료 ${fmtMoney(refund)} 반환)`);
  return { ok: true };
}

// ───────── 제안(오퍼) ─────────
export function listPlayer(s, pid, ask) {
  const p = userTeam(s).players.find((x) => x.id === pid);
  if (!p || (p.loan && p.loan.from !== s.userId)) return { ok: false, err: 'notfound' };
  s.listings = s.listings.filter((l) => l.pid !== pid);
  const cap = r100(tradeValue(p) * 1.15); // 영입가(1.2배)보다 높게 팔 수 없게 상한을 둔다
  s.listings.push({ pid, ask: Math.min(ask ?? r100(tradeValue(p) * 1.1), cap) });
  return { ok: true };
}
export const unlistPlayer = (s, pid) => { s.listings = s.listings.filter((l) => l.pid !== pid); };

export function processOffers(s, rng) {
  s.offers = s.offers.filter((o) => o.expires >= s.tick && userTeam(s).players.some((p) => p.id === o.pid));
  if (!windowInfo(s).open || s.phase !== 'regular') return;
  const me = userTeam(s);
  const mk = (p, fee) => {
    const t = rng.pick(s.teams.filter((x) => x.id !== s.userId));
    s.offers.push({ id: (s.offerSeq = (s.offerSeq || 0) + 1), pid: p.id, teamId: t.id, fee: r100(fee), expires: s.tick + 3 });
    addNews(s, 'offer', `${t.name}이(가) ${p.name}에게 ${fmtMoney(r100(fee))} 제안`);
  };
  for (const l of s.listings) {
    const p = me.players.find((x) => x.id === l.pid);
    if (!p || s.offers.length >= 4 || s.offers.some((o) => o.pid === p.id)) continue;
    if (lockLeft(s, p) === 0 && rng.chance(0.3)) mk(p, l.ask * (0.85 + rng.next() * 0.15)); // 호가를 넘는 제안은 오지 않는다
  }
  const sorted = me.players.map(caOf).sort((a, b) => b - a);
  const cut = sorted[Math.min(4, sorted.length - 1)];
  for (const p of me.players) {
    if (p.loan || s.offers.length >= 4 || s.offers.some((o) => o.pid === p.id) || caOf(p) < cut || lockLeft(s, p) > 0) continue;
    if (rng.chance(0.012)) mk(p, tradeValue(p) * (1.0 + rng.next() * 0.12));
  }
}
export function acceptOffer(s, oid) {
  const e = needWindow(s);
  if (e) return { ok: false, err: e };
  const o = s.offers.find((x) => x.id === oid);
  if (!o) return { ok: false, err: 'notfound' };
  const me = userTeam(s);
  const p = me.players.find((x) => x.id === o.pid);
  if (!p) return { ok: false, err: 'notfound' };
  if (lockLeft(s, p) > 0) return { ok: false, err: 'locked', left: lockLeft(s, p) };
  const le = canLeave(s, p);
  if (le) return { ok: false, err: le };
  me.players.splice(me.players.indexOf(p), 1);
  me.manual = null;
  s.money += o.fee;
  clearTrade(s, p.id);
  sendToAI(s, p, null, s.teams[o.teamId]);
  p.fee = 0; p.cy = 0;
  addNews(s, 'transfer', `${p.name} 매각 (${s.teams[o.teamId].name}, ${fmtMoney(o.fee)})`);
  return { ok: true, fee: o.fee };
}
export const rejectOffer = (s, oid) => { s.offers = s.offers.filter((o) => o.id !== oid); };

// ───────── 유스 ─────────
export function acceptYouth(s, pid) {
  const o = s.offseason;
  if (!o) return { ok: false, err: 'state' };
  const i = o.youth.findIndex((p) => p.id === pid);
  if (i < 0) return { ok: false, err: 'notfound' };
  const me = userTeam(s);
  if (me.players.length >= SQUAD_MAX) return { ok: false, err: 'full' };
  me.players.push(o.youth.splice(i, 1)[0]);
  return { ok: true };
}
export function rejectYouth(s, pid) { if (s.offseason) s.offseason.youth = s.offseason.youth.filter((p) => p.id !== pid); return true; }
export function acceptBestYouth(s, minPA = 95) {
  const o = s.offseason;
  if (!o) return 0;
  let n = 0;
  for (const p of o.youth.slice().sort((a, b) => b.pa - a.pa)) {
    if (p.pa < minPA || userTeam(s).players.length >= SQUAD_MAX - 2) break;
    if (acceptYouth(s, p.id).ok) n++;
  }
  o.youth = [];
  return n;
}

// 스카우트 수준에 따른 PA 추정 (내 선수는 정확)
export function paEstimate(s, p) {
  if (userTeam(s).players.includes(p)) return { lo: p.pa, hi: p.pa, mid: p.pa, err: 0 };
  const err = Math.round((10 - s.fac.scout) * 3);
  const off = Math.round(((((p.id * 2654435761) >>> 0) % 2001) / 1000 - 1) * err * 0.6);
  const mid = clamp(p.pa + off, caOf(p), 200);
  return { lo: clamp(mid - err, caOf(p), 200), hi: clamp(mid + err, caOf(p), 200), mid, err };
}
