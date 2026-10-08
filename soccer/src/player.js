import { ALL_ATTRS, ATTRS, ROLE_W, FAM, SURNAMES, GIVEN_A, GIVEN_B } from './data.js';
import { clamp } from './util.js';

// ───────── 포지션 평점 / CA ─────────
const wsum = {};
for (const r of Object.keys(ROLE_W)) wsum[r] = Object.values(ROLE_W[r]).reduce((a, b) => a + b, 0);

const cache = new WeakMap(); // 선수 객체 -> { 역할: 평점 }. 능력치가 바뀌면 touch()로 비운다(직렬화되지 않음).
export const touch = (p) => cache.delete(p);

// 1~20 스케일 평점
export function ratingAt(p, role) {
  let c = cache.get(p);
  if (!c) cache.set(p, (c = {}));
  let v = c[role];
  if (v === undefined) {
    const w = ROLE_W[role];
    let s = 0;
    for (const k in w) s += w[k] * p.a[k];
    v = c[role] = s / wsum[role];
  }
  return v;
}
export const toCA = (s) => Math.round(1 + ((s - 1) / 19) * 199);
export const fromCA = (ca) => 1 + ((ca - 1) * 19) / 199;
export const caAt = (p, role) => toCA(ratingAt(p, role));
export const caOf = (p) => caAt(p, p.pos);
export const famOf = (p, role) => (p.alt && p.alt.includes(role) && role !== p.pos ? 0.97 : FAM[p.pos][role]);
// 해당 슬롯에서의 실효 능력 (CA 스케일, 숙련도 반영)
export const effAt = (p, role) => caAt(p, role) * famOf(p, role);

// ───────── 유망주 이슈(hype)와 잠재능력 ─────────
// hype = "시장/언론의 기대 등급". 잠재능력(PA)은 등급이 높을수록 높게 뽑히지만, 같은 등급 안에서도 편차가 크다.
// 근거: FM에서 PA>160이면 5대 리그 주전급, >180이면 세계적 선수(커뮤니티 가이드). 유스 중 최상위 1부 도달은 약 4%(연구 보도).
export const HYPE_LABEL = ['', '기대주', '유망주', '특급 유망주', '세계적 재능'];
export const HYPE_STARS = (h) => (h > 0 ? '★'.repeat(h) : '');
const PA_RANGE = [[55, 115], [95, 135], [120, 155], [145, 176], [168, 197]]; // 등급별 PA 범위
const HYPE_P_YOUTH = [0.7, 0.19, 0.08, 0.025, 0.005]; // 21세 이하 기본 확률
const HYPE_P_MID = [0.85, 0.12, 0.03, 0, 0]; // 22~25세

export function rollHype(rng, age, boost = 0) {
  if (age >= 26) return 0;
  const base = age <= 21 ? HYPE_P_YOUTH : HYPE_P_MID;
  const k = 1 + boost * 0.12; // 유스 시설/스카우트 보정: 상위 등급 확률을 키운다
  const w = base.map((x, i) => (i === 0 ? x : x * k));
  const t = w.reduce((a, c) => a + c, 0);
  let r = rng.next() * t;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
  return 0;
}
// 등급 → PA. 삼각분포에 가까운 모양으로 범위 안에서 뽑고, 현재능력보다 낮을 수 없다.
export function paFromHype(rng, hype, ca, shift = 0) {
  const [lo, hi] = PA_RANGE[hype];
  const u = (rng.next() + rng.next()) / 2;
  return clamp(Math.round(lo + (hi - lo) * u + shift), ca, 200);
}

// ───────── 생성 ─────────
export function genName(rng, used) {
  for (let i = 0; i < 60; i++) {
    const n = rng.pick(SURNAMES) + rng.pick(GIVEN_A) + rng.pick(GIVEN_B);
    if (!used.has(n)) { used.add(n); return n; }
  }
  return rng.pick(SURNAMES) + rng.pick(GIVEN_A) + rng.pick(GIVEN_B);
}

// ctx = { rng, nextId(), used:Set }
export function genPlayer(ctx, { pos, ca, age, pa, paBoost = 0, hype, paShift = 0, name }) {
  const { rng } = ctx;
  age = age ?? rng.int(18, 34);
  const p = { id: ctx.nextId(), name: name || genName(rng, ctx.used), age, pos, alt: [], a: {}, pa: 0, pr: rng.int(4, 18), inj: rng.int(3, 17), cond: 100, mor: 70, out: 0, s: null, w: 0, ctr: rng.int(1, 4), fee: 0, cy: 0, loan: null };
  const target = fromCA(ca);
  const w = ROLE_W[pos];
  const key = Object.keys(w).filter((k) => w[k] >= 1.5);
  for (const k of ALL_ATTRS) {
    let v;
    if (pos === 'GK' ? ATTRS.gk.includes(k) : false) v = target + 0.6 + rng.normal(0, 1.2);
    else if (pos !== 'GK' && ATTRS.gk.includes(k)) v = rng.int(1, 4);
    else if (key.includes(k)) v = target + rng.normal(0, 1.6);
    else if (pos === 'GK') v = w[k] ? target - 2 + rng.normal(0, 2) : 1 + rng.next() * 5;
    else if (w[k]) v = target - 1.5 + rng.normal(0, 2);
    else v = target - 6 + rng.normal(0, 2.5);
    p.a[k] = clamp(Math.round(v), 1, 20);
  }
  // 목표 CA에 맞게 미세 조정
  for (let i = 0; i < 80; i++) {
    const cur = caOf(p);
    if (Math.abs(cur - ca) <= 1) break;
    const k = rng.pick(key);
    const d = cur < ca ? 1 : -1;
    p.a[k] = clamp(p.a[k] + d, 1, 20);
    touch(p);
  }
  touch(p);
  const cur = caOf(p);
  if (pa !== undefined) p.pa = pa;
  else if (age <= 25) {
    p.hype = hype ?? rollHype(rng, age, paBoost / 4);
    // 낮은 등급(0)은 "현재 수준 + 약간"의 평범한 성장, 높은 등급은 범위에서 뽑는다
    p.pa = p.hype === 0 ? cur + Math.round(Math.pow(rng.next(), 1.6) * (age <= 21 ? 30 : 15)) : paFromHype(rng, p.hype, cur, paShift);
  } else if (age <= 28) p.pa = cur + rng.int(0, 6);
  else p.pa = cur;
  if (pa !== undefined && hype !== undefined) p.hype = hype;
  p.pa = clamp(Math.round(p.pa), cur, 200);
  if (!p.hype) delete p.hype;
  // 약간의 다재다능: 인접 포지션 숙련
  if (rng.chance(0.3)) {
    const near = Object.keys(FAM[pos]).filter((r) => FAM[pos][r] >= 0.9 && r !== pos && r !== 'GK');
    if (near.length) p.alt.push(rng.pick(near));
  }
  p.w = wageOf(p);
  return p;
}

// ───────── 가치와 연봉 (단위: 만) ─────────
// 가치: CA(+젊을 때는 잠재력 일부)에 지수로 비례. 연봉은 가치보다 완만하게 늘어난다.
export function valueOf(p) {
  const ca = caOf(p);
  const e = ca + (p.age <= 24 ? 0.4 : p.age <= 27 ? 0.15 : 0) * Math.max(0, p.pa - ca);
  const ageMul = p.age <= 21 ? 1.25 : p.age <= 26 ? 1 : p.age <= 29 ? 0.85 : p.age <= 32 ? 0.55 : 0.3;
  return Math.max(200, Math.round((400 * Math.exp(0.055 * e) * ageMul) / 100) * 100);
}
// 이 선수의 시장 연봉(연간)
export function wageOf(p) {
  const ca = caOf(p);
  const e = ca + (p.age <= 24 ? 0.15 * Math.max(0, p.pa - ca) : 0);
  return Math.max(400, Math.round(12100 * Math.exp(0.055 * (e - 100)) * (p.age >= 31 ? 0.85 : 1)));
}

// ───────── 성장과 노화 ─────────
const AGE_RATE = (age) => (age <= 19 ? 1.3 : age <= 21 ? 1.1 : age <= 24 ? 0.8 : age <= 27 ? 0.4 : age <= 30 ? 0.15 : 0);

// 한 라운드 훈련. 경기 출전 시간이 많으면 약간 더 빨리 큰다.
export function trainStep(p, rng, { level = 0, focus = 'bal', played = false }) {
  const ca = caOf(p);
  if (ca >= p.pa) return 0;
  const gap = clamp((p.pa - ca) / 30, 0, 1.2);
  const rate = 0.2 * AGE_RATE(p.age) * gap * (1 + 0.1 * level) * (0.7 + (p.pr / 20) * 0.6) * (played ? 1.1 : 1);
  p.xp = Math.round(((p.xp || 0) + rate) * 1e4) / 1e4;
  let gained = 0;
  while (p.xp >= 1) {
    p.xp -= 1;
    // 역할 핵심 능력치 중에서 선택 (포커스 그룹이면 가중)
    const w = ROLE_W[p.pos];
    const keys = Object.keys(w).filter((k) => p.a[k] < 20);
    if (!keys.length) break;
    const weights = keys.map((k) => w[k] * (focus !== 'bal' && ATTRS[focus].includes(k) ? 2 : 1));
    let r = rng.next() * weights.reduce((x, y) => x + y, 0);
    let pick = keys[0];
    for (let i = 0; i < keys.length; i++) { r -= weights[i]; if (r <= 0) { pick = keys[i]; break; } }
    p.a[pick]++;
    touch(p);
    if (caOf(p) > p.pa) { p.a[pick]--; touch(p); p.xp = 0; break; } // PA 상한: 넘는 성장은 취소
    gained++;
  }
  return gained;
}

// 시즌이 끝날 때 나이를 먹고, 30대부터 피지컬이 떨어진다.
export function ageUp(p, rng) {
  p.age++;
  if (p.age >= 19 && p.age <= 22) {
    const x = rng.next();
    if (x < 0.1) p.pa = clamp(p.pa + rng.int(5, 20), caOf(p), 200); // 대기만성
    else if (x < 0.2) p.pa = clamp(p.pa - rng.int(5, 20), caOf(p), 200); // 기대 이하
  }
  if (p.age >= 31) {
    const chance = Math.min(0.9, (p.age - 30) * 0.14);
    for (const k of ['pac', 'agi', 'sta', 'jmp']) if (rng.chance(chance) && p.a[k] > 1) p.a[k]--;
    if (p.age >= 33) for (const k of ['str', 'dri', 'fst']) if (rng.chance((p.age - 32) * 0.1) && p.a[k] > 1) p.a[k]--;
    touch(p);
  }
  p.s = null;
  p.xp = 0;
}
export const retireChance = (age) => (age < 34 ? 0 : Math.min(1, 0.15 + (age - 34) * 0.25));
