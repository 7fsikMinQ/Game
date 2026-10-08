import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';

test('같은 시드는 같은 수열', () => {
  const a = createRng(123);
  const b = createRng(123);
  for (let i = 0; i < 100; i++) assert.equal(a.next(), b.next());
});

test('상태를 저장했다가 이어서 쓰면 수열이 이어진다', () => {
  const a = createRng(9);
  for (let i = 0; i < 10; i++) a.next();
  const b = createRng(a.state());
  for (let i = 0; i < 50; i++) assert.equal(a.next(), b.next());
});

test('int는 경계를 포함하고 범위를 벗어나지 않는다', () => {
  const r = createRng(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = r.int(3, 6);
    assert.ok(v >= 3 && v <= 6);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
});

test('normal의 평균/표준편차가 대체로 맞다', () => {
  const r = createRng(5);
  const xs = Array.from({ length: 20000 }, () => r.normal(50, 10));
  const m = xs.reduce((a, b) => a + b) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  assert.ok(Math.abs(m - 50) < 0.5, `mean ${m}`);
  assert.ok(Math.abs(sd - 10) < 0.5, `sd ${sd}`);
});
