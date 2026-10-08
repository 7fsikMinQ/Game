import { HIT_STATS, PIT_STATS, FLD_W, KR_SUR, KR_A, KR_B, EN_FIRST, EN_LAST, JP_NAMES } from './data.js';
import { clamp } from './util.js';

export const isHit = (p) => p.role === 'H';
export const statKeys = (p) => (p.role === 'H' ? HIT_STATS : PIT_STATS);
const cs = (v) => clamp(Math.round(v), 20, 99);

export function ovrOf(p) {
  if (p.role === 'H') {
    const fw = FLD_W[p.pos] ?? 0;
    return Math.round((0.38 * p.con + 0.32 * p.pow + 0.2 * p.eye + 0.1 * p.spd) * (1 - fw) + p.fld * fw);
  }
  return Math.round(p.pos === 'SP' ? p.stf * 0.42 + p.ctl * 0.36 + p.sta * 0.22 : p.stf * 0.55 + p.ctl * 0.4 + p.sta * 0.05);
}
// 타자의 순수 타격 점수(타순용)
export const hitScore = (p) => 0.38 * p.con + 0.32 * p.pow + 0.2 * p.eye + 0.1 * p.spd;

// 다른 포지션을 볼 때 수비 감점
const IF = ['2B', '3B', 'SS'], OF = ['LF', 'CF', 'RF'];
export function fitPenalty(p, slot) {
  if (slot === 'DH' || p.pos === slot) return 0;
  if (slot === 'C' || p.pos === 'C') return 28;
  if (slot === '1B') return 3;
  if (p.pos === 'DH') return slot === 'LF' || slot === 'RF' ? 14 : 22;
  if (p.pos === '1B') return IF.includes(slot) ? 22 : 16;
  if (IF.includes(p.pos) && IF.includes(slot)) return slot === 'SS' ? 12 : p.pos === 'SS' ? 3 : 7;
  if (OF.includes(p.pos) && OF.includes(slot)) return slot === 'CF' ? 10 : 4;
  return 20;
}
export const slotFld = (p, slot) => p.fld - fitPenalty(p, slot);
export function slotScore(p, slot) {
  const fw = FLD_W[slot] ?? 0;
  return hitScore(p) * (1 - fw) + slotFld(p, slot) * fw;
}

// ───────── 시장 가치와 연봉 ─────────
export function marketWage(L, ovr, age) {
  const w = L.wage;
  const base = clamp(w.base * Math.exp(w.k * (ovr - 50)), L.minSal, w.max);
  const am = age >= 36 ? 0.7 : age >= 34 ? 0.85 : 1;
  return Math.max(L.minSal, Math.round(base * am * 100) / 100);
}
// 트레이드/드래프트용 가치 점수(단위 없음). 현재 능력 + 성장 여지 + 나이.
export function valueOf(p) {
  const o = ovrOf(p);
  const gap = Math.max(0, p.pot - o);
  const eff = o + (p.age <= 25 ? gap * 0.5 : p.age <= 28 ? gap * 0.2 : 0);
  const am = p.age <= 27 ? 1 : p.age <= 31 ? 0.95 : p.age <= 34 ? 0.75 : 0.45;
  const pos = p.pos === 'RP' ? 0.6 : 1;
  return 10 * Math.exp(0.1 * (eff - 50)) * am * pos * (p.age <= 23 && p.hype ? 1 + 0.08 * p.hype : 1);
}

// ───────── 유망주 등급(hype) ─────────
export const HYPE_LABEL = ['무명', '기대주', '유망주', '특급 유망주', '초특급 유망주'];
export const HYPE_STARS = (h) => '★'.repeat(h);
export const TUNE = { grow: 0.42, f: [0.33, 0.26, 0.2, 0.1], decl: 0.5 };
const HYPE_GROW = [[8, 17], [12, 22], [17, 28], [24, 36], [31, 44]];
export function rollHype(rng, boost = 0) {
  const x = rng.next() - boost;
  return x < 0.02 ? 4 : x < 0.09 ? 3 : x < 0.25 ? 2 : x < 0.55 ? 1 : 0;
}
export function potFor(rng, ovr, age, hype) {
  const g = clamp((25 - age) / 6, 0, 1.2);
  const [lo, hi] = HYPE_GROW[hype];
  const add = g > 0 ? g * TUNE.grow * (lo + rng.next() * (hi - lo)) : rng.int(0, 2);
  return clamp(Math.round(ovr + add), ovr, 99);
}

// ───────── 이름 ─────────
export function genName(rng, used, lang) {
  const make = () => (lang === 'kr' ? rng.pick(KR_SUR) + rng.pick(KR_A) + rng.pick(KR_B) : lang === 'jp' ? rng.pick(JP_NAMES) : `${rng.pick(EN_FIRST)} ${rng.pick(EN_LAST)}`);
  for (let i = 0; i < 60; i++) { const n = make(); if (!used.has(n)) { used.add(n); return n; } }
  return make();
}

// ───────── 선수 생성 ─────────
// ctx = { rng, nextId(), used:Set, L, lang }
export function genPlayer(ctx, o) {
  const { rng } = ctx;
  const role = o.role || (o.pos === 'SP' || o.pos === 'RP' ? 'P' : 'H');
  const age = o.age ?? rng.int(20, 36);
  const p = { id: ctx.nextId(), name: o.name || genName(rng, ctx.used, o.lang || ctx.lang), role, pos: o.pos, age, act: o.act ?? 1, inj: 0, fat: 0, rest: 5, fx: o.fx || 0, hype: 0, s: null, lock: 0, ext: 0 };
  const ovr = o.ovr;
  if (role === 'H') {
    const tilt = rng.int(0, 3);
    const t = [{ pow: 8, spd: -8 }, { con: 7, pow: -5 }, { spd: 9, pow: -7 }, { eye: 7, spd: -3 }][tilt];
    const fw = FLD_W[o.pos] ?? 0;
    for (const k of HIT_STATS) p[k] = cs(ovr + rng.normal(0, 7) + (t[k] || 0) + (k === 'fld' ? (fw ? 0 : -6) : 0));
    if (o.pos === 'DH' || o.pos === '1B') p.fld = cs(p.fld - 6);
  } else {
    for (const k of PIT_STATS) p[k] = cs(ovr + rng.normal(0, 7) + (k === 'sta' ? (o.pos === 'RP' ? -22 : 4) : 0));
  }
  if (o.exact) fitOvr(p, ovr);
  p.hype = o.hype ?? (age <= 23 ? rollHype(rng, o.hypeBoost || 0) : 0);
  p.pot = o.pot ?? potFor(rng, ovrOf(p), age, p.hype);
  setContract(ctx, p, o);
  return p;
}

export function fitOvr(p, target) {
  for (let i = 0; i < 6; i++) {
    const d = target - ovrOf(p);
    if (d === 0) return;
    for (const k of statKeys(p)) p[k] = cs(p[k] + d);
  }
}
// 서비스 타임(MLB 풀타임 연차 / KBO 등록 일수 환산 연차)과 연봉
export function setContract(ctx, p, o = {}) {
  const { rng, L } = ctx;
  const o2 = ovrOf(p);
  p.svc = o.svc ?? clamp(p.age - 22 + rng.int(-1, 1), 0, 16);
  const mw = marketWage(L, o2, p.age);
  if (p.svc < L.arbAt) {
    p.sal = Math.min(mw, Math.round((L.minSal * (1 + Math.min(3, Math.max(0, o2 - 45) / 12)) * 100)) / 100);
    p.yrs = 1;
  } else if (p.svc < L.faAt) {
    p.sal = Math.max(L.minSal, Math.round(mw * (0.5 + rng.next() * 0.2) * 100) / 100);
    p.yrs = 1;
  } else {
    p.sal = Math.max(L.minSal, Math.round(mw * (0.85 + rng.next() * 0.3) * 100) / 100);
    p.yrs = rng.int(1, 5);
  }
  if (p.fx) { p.sal = Math.max(p.sal, Math.round(marketWage(L, o2, 28) * 0.9 * 100) / 100); if (p.fx === 2) p.sal = Math.min(p.sal, 3.0); p.yrs = rng.int(1, 3); }
}

// ───────── 성장 / 노화 (시즌 사이) ─────────
export function ageUp(p, rng, bonus = 0) {
  p.age++;
  const o = ovrOf(p);
  let d;
  if (p.age <= 29) {
    const f = p.age <= 22 ? TUNE.f[0] : p.age <= 24 ? TUNE.f[1] : p.age <= 26 ? TUNE.f[2] : TUNE.f[3];
    d = (p.pot - o) * f + rng.normal(0, 1.6) + bonus;
  } else d = -(p.age <= 31 ? 0.3 * (p.age - 29) : 0.6 + (p.age - 31) * 0.6) * TUNE.decl * 2 - rng.next() * 0.8 + rng.normal(0, 1) + (bonus > 0 ? bonus * 0.5 : 0);
  if (p.age <= 25 && p.pot > o) {
    if (rng.chance(0.07)) p.pot = Math.max(o, p.pot - rng.int(5, 12)); // 정체/부진
    else if (rng.chance(0.07)) p.pot = Math.min(99, p.pot + rng.int(4, 9)); // 늦게 터짐
  }
  for (const k of statKeys(p)) p[k] = cs(p[k] + d + rng.normal(0, 1.4));
  if (p.age >= 27) p.pot = Math.max(ovrOf(p), Math.round(ovrOf(p) + (p.pot - ovrOf(p)) * 0.5));
  p.pot = Math.max(p.pot, ovrOf(p));
  if (p.hype && p.age > 23) p.hype = 0;
}
export const retireAge = (p) => (p.role === 'P' ? 41 : 42);
