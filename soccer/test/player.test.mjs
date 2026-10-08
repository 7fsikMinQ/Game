import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { genPlayer, caOf, caAt, ratingAt, valueOf, wageOf, trainStep, ageUp, touch, rollHype, paFromHype, famOf, effAt } from '../src/player.js';
import { ALL_ATTRS, ATTRS, ROLES, FORMATIONS } from '../src/data.js';

const mk = (seed = 1) => { let id = 1; return { rng: createRng(seed), nextId: () => id++, used: new Set() }; };

test('능력치는 1~20, CA/PA는 1~200 범위이고 PA >= CA', () => {
  const ctx = mk(2);
  for (let i = 0; i < 600; i++) {
    const pos = ctx.rng.pick(ROLES);
    const p = genPlayer(ctx, { pos, ca: ctx.rng.int(20, 180), age: ctx.rng.int(16, 36) });
    for (const k of ALL_ATTRS) assert.ok(p.a[k] >= 1 && p.a[k] <= 20, `${k}=${p.a[k]}`);
    const ca = caOf(p);
    assert.ok(ca >= 1 && ca <= 200);
    assert.ok(p.pa >= ca && p.pa <= 200, `pa ${p.pa} ca ${ca}`);
  }
});

test('생성한 선수의 CA가 목표 CA에 가깝다 (±3)', () => {
  const ctx = mk(3);
  let worst = 0;
  for (const ca of [40, 70, 100, 130, 160]) for (let i = 0; i < 60; i++) {
    const p = genPlayer(ctx, { pos: ctx.rng.pick(ROLES), ca, age: 26 });
    worst = Math.max(worst, Math.abs(caOf(p) - ca));
  }
  assert.ok(worst <= 4, `최대 오차 ${worst}`);
});

test('포지션 적합도: 스트라이커는 센터백 자리에서 능력이 크게 낮다, 골키퍼는 필드에서 매우 낮다', () => {
  const ctx = mk(4);
  const st = genPlayer(ctx, { pos: 'ST', ca: 130, age: 25 });
  assert.ok(caAt(st, 'DC') < caAt(st, 'ST') - 20);
  const gk = genPlayer(ctx, { pos: 'GK', ca: 130, age: 25 });
  assert.ok(caAt(gk, 'ST') < caAt(gk, 'GK') - 50);
  assert.equal(famOf(st, 'ST'), 1);
  assert.ok(famOf(st, 'DC') < 1);
  assert.ok(effAt(st, 'DC') < caAt(st, 'DC'));
});

test('능력치를 바꾸고 touch 하면 캐시된 평점이 갱신된다', () => {
  const ctx = mk(5);
  const p = genPlayer(ctx, { pos: 'ST', ca: 100, age: 25 });
  const before = ratingAt(p, 'ST');
  p.a.fin = Math.min(20, p.a.fin + 4);
  assert.equal(ratingAt(p, 'ST'), before); // 캐시
  touch(p);
  assert.ok(ratingAt(p, 'ST') > before);
});

test('유망주 등급: 높을수록 PA가 높고, 상위 등급은 드물다', () => {
  const ctx = mk(6);
  const N = 8000, cnt = [0, 0, 0, 0, 0], sum = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) {
    const p = genPlayer(ctx, { pos: 'MC', ca: 40 + ctx.rng.int(0, 30), age: 18 });
    const h = p.hype || 0;
    cnt[h]++; sum[h] += p.pa;
  }
  const mean = sum.map((s, i) => s / Math.max(1, cnt[i]));
  for (let h = 1; h < 5; h++) assert.ok(mean[h] > mean[h - 1] + 8, `등급 ${h} 평균 PA ${mean[h]} <= 등급 ${h - 1} ${mean[h - 1]}`);
  assert.ok(cnt[0] / N > 0.6 && cnt[0] / N < 0.8);
  assert.ok(cnt[4] / N < 0.012, `최상위 등급이 너무 흔함 ${cnt[4] / N}`);
  assert.ok(cnt[3] + cnt[4] > 0);
});

test('PA>=160 은 18세 중 소수(1~4%), PA>=180 은 극소수(<1%)', () => {
  const ctx = mk(7);
  let a = 0, b = 0;
  const N = 8000;
  for (let i = 0; i < N; i++) { const p = genPlayer(ctx, { pos: 'ST', ca: 45, age: 18 }); if (p.pa >= 160) a++; if (p.pa >= 180) b++; }
  assert.ok(a / N > 0.008 && a / N < 0.05, `PA160+ ${a / N}`);
  assert.ok(b / N < 0.01, `PA180+ ${b / N}`);
});

test('26세 이상은 유망주 등급이 없고 PA는 CA와 거의 같다', () => {
  const ctx = mk(8);
  for (let i = 0; i < 200; i++) {
    const p = genPlayer(ctx, { pos: 'DC', ca: 100, age: 27 + (i % 8) });
    assert.ok(!p.hype);
    assert.ok(p.pa - caOf(p) <= 6);
  }
  assert.equal(rollHype(createRng(1), 30), 0);
});

test('rollHype: 유스 시설 보정이 높을수록 상위 등급이 늘어난다', () => {
  const r1 = createRng(10), r2 = createRng(10);
  let lo = 0, hi = 0;
  for (let i = 0; i < 20000; i++) { if (rollHype(r1, 17, 0) >= 2) lo++; if (rollHype(r2, 17, 10) >= 2) hi++; }
  assert.ok(hi > lo * 1.5, `${lo} vs ${hi}`);
});

test('paFromHype: 현재 능력보다 낮을 수 없고 200을 넘지 않는다', () => {
  const rng = createRng(11);
  for (let h = 0; h <= 4; h++) for (let i = 0; i < 300; i++) { const v = paFromHype(rng, h, 90); assert.ok(v >= 90 && v <= 200); }
});

test('훈련은 PA를 넘겨 성장시키지 못한다', () => {
  const ctx = mk(12);
  const p = genPlayer(ctx, { pos: 'ST', ca: 60, age: 17, pa: 75 });
  for (let i = 0; i < 400; i++) trainStep(p, ctx.rng, { level: 10, focus: 'bal', played: true });
  assert.ok(caOf(p) <= 75, `CA ${caOf(p)} > PA 75`);
  assert.ok(caOf(p) >= 70, '충분히 훈련했는데 거의 안 컸다');
});

test('젊은 유망주가 나이든 선수보다 훨씬 빨리 큰다', () => {
  const ctx = mk(13);
  const young = genPlayer(ctx, { pos: 'MC', ca: 60, age: 18, pa: 150 });
  const old = genPlayer(ctx, { pos: 'MC', ca: 60, age: 31, pa: 150 });
  const y0 = caOf(young), o0 = caOf(old);
  for (let i = 0; i < 80; i++) { trainStep(young, ctx.rng, { level: 0, played: true }); trainStep(old, ctx.rng, { level: 0, played: true }); }
  assert.ok(caOf(young) - y0 > 12, `young +${caOf(young) - y0}`);
  assert.ok(caOf(old) - o0 <= 2, `old +${caOf(old) - o0}`);
});

test('나이: 31세부터 피지컬이 떨어진다, 대기만성/기대 이하로 PA가 바뀔 수 있다', () => {
  const ctx = mk(14);
  const p = genPlayer(ctx, { pos: 'ST', ca: 120, age: 30 });
  const pac0 = p.a.pac;
  let drops = 0;
  for (let i = 0; i < 6; i++) { ageUp(p, ctx.rng); }
  assert.ok(p.a.pac < pac0 || p.a.agi < 20);
  let up = 0, down = 0;
  for (let i = 0; i < 500; i++) {
    const q = genPlayer(ctx, { pos: 'MC', ca: 70, age: 19, pa: 120 });
    const pa0 = q.pa; ageUp(q, ctx.rng);
    if (q.pa > pa0) up++; else if (q.pa < pa0) down++;
  }
  assert.ok(up > 20 && down > 20, `up ${up} down ${down}`);
  void drops;
});

test('가치와 연봉은 능력에 따라 증가하고, 나이든 선수는 싸다', () => {
  const ctx = mk(15);
  const a = genPlayer(ctx, { pos: 'ST', ca: 80, age: 26 });
  const b = genPlayer(ctx, { pos: 'ST', ca: 120, age: 26 });
  assert.ok(valueOf(b) > valueOf(a) * 5);
  assert.ok(wageOf(b) > wageOf(a) * 3);
  const old = genPlayer(ctx, { pos: 'ST', ca: 120, age: 34 });
  assert.ok(valueOf(old) < valueOf(b) * 0.5);
  const kid = genPlayer(ctx, { pos: 'ST', ca: 70, age: 18, pa: 160 });
  const kid2 = genPlayer(ctx, { pos: 'ST', ca: 70, age: 18, pa: 80 });
  assert.ok(valueOf(kid) > valueOf(kid2) * 2, '잠재력 높은 어린 선수가 더 비싸야 한다');
});

test('포메이션: 모든 포메이션이 11명이고 골키퍼 1명', () => {
  for (const f of FORMATIONS) {
    assert.equal(f.slots.length, 11, f.name);
    assert.equal(f.slots.filter((s) => s.r === 'GK').length, 1);
    for (const s of f.slots) assert.ok(s.x > 0 && s.x < 100 && s.y >= 0 && s.y <= 100);
  }
  assert.ok(Object.keys(ATTRS).length === 4);
});
