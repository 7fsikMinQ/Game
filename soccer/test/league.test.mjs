import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { LEAGUES, COUNTRIES, makeRounds, splitRounds, clubNames, windowState } from '../src/league.js';

const ids = (n) => Array.from({ length: n }, (_, i) => i);
function stats(rounds, n) {
  const games = new Array(n).fill(0), home = new Array(n).fill(0), pair = new Map();
  for (const r of rounds) {
    const seen = new Set();
    for (const { h, a } of r) { assert.ok(!seen.has(h) && !seen.has(a), '한 라운드에 같은 팀이 두 번'); seen.add(h); seen.add(a); games[h]++; games[a]++; home[h]++; const k = [h, a].sort((x, y) => x - y).join('-'); pair.set(k, (pair.get(k) || 0) + 1); }
  }
  return { games, home, pair };
}

test('EPL 20팀: 38라운드, 팀당 38경기, 홈 19경기, 모든 상대와 2번', () => {
  const r = makeRounds(ids(20), 2), s = stats(r, 20);
  assert.equal(r.length, 38);
  assert.ok(s.games.every((g) => g === 38) && s.home.every((h) => h === 19));
  assert.equal(s.pair.size, 190);
  assert.ok([...s.pair.values()].every((v) => v === 2));
  assert.ok(r.every((x) => x.length === 10));
});

test('챔피언십 24팀: 46라운드, 팀당 46경기', () => {
  const r = makeRounds(ids(24), 2), s = stats(r, 24);
  assert.equal(r.length, 46);
  assert.ok(s.games.every((g) => g === 46) && s.home.every((h) => h === 23));
});

test('분데스리가 18팀: 34라운드, 팀당 34경기 (306경기)', () => {
  const r = makeRounds(ids(18), 2), s = stats(r, 18);
  assert.equal(r.length, 34);
  assert.equal(r.reduce((a, x) => a + x.length, 0), 306);
  assert.ok(s.games.every((g) => g === 34) && s.home.every((h) => h === 17));
});

test('K리그2 17팀(홀수): 34라운드, 팀당 32경기, 라운드마다 한 팀 부전, 홈 16경기', () => {
  const r = makeRounds(ids(17), 2), s = stats(r, 17);
  assert.equal(r.length, 34);
  assert.ok(r.every((x) => x.length === 8));
  assert.ok(s.games.every((g) => g === 32), `${s.games}`);
  assert.ok(s.home.every((h) => h === 16), `${s.home}`);
  assert.equal(r.reduce((a, x) => a + x.length, 0), 272); // 공식 272경기
});

test('K리그1 12팀: 정규 33라운드(팀당 33경기) + 파이널 5라운드 = 38', () => {
  const r = makeRounds(ids(12), 3), s = stats(r, 12);
  assert.equal(r.length, 33);
  assert.ok(s.games.every((g) => g === 33));
  assert.equal(r.reduce((a, x) => a + x.length, 0), 198); // 공식 198경기
  const fin = splitRounds([0, 1, 2, 3, 4, 5], [6, 7, 8, 9, 10, 11]);
  assert.equal(fin.length, 5);
  assert.ok(fin.every((x) => x.length === 6));
  const fs = stats(fin, 12);
  assert.ok(fs.games.every((g) => g === 5));
  for (const f of fin.flat()) assert.ok((f.h < 6) === (f.a < 6), '그룹 밖 팀과 경기');
});

test('규칙 설정이 공식 구조와 같다 (팀 수/강등/승격)', () => {
  const e = LEAGUES.epl, b = LEAGUES.bl, k = LEAGUES.kl;
  assert.deepEqual(e.divs.map((d) => d.n), [20, 24]);
  assert.deepEqual(b.divs.map((d) => d.n), [18, 18]);
  assert.deepEqual(k.divs.map((d) => d.n), [12, 17]);
  assert.equal(e.rules.relegate, 3); assert.equal(b.rules.relegate, 2); assert.equal(k.rules.relegate, 1);
  assert.equal(e.rules.loanInMax, 2); assert.ok(e.rules.loanInVerified);
  assert.equal(e.rules.scr.green, 0.85); assert.ok(e.rules.scr.enforce);
  assert.equal(b.rules.scr.green, 0.7);
  assert.equal(e.rules.playoff, 'six'); assert.equal(b.rules.playoff, 'bl'); assert.equal(k.rules.playoff, 'kl');
  for (const c of COUNTRIES) for (const d of LEAGUES[c].divs) assert.ok(d.rev > 0 && d.rep[0] < d.rep[1]);
});

test('구단 이름: 필요한 수만큼 서로 다르게 만든다', () => {
  for (const [pool, n] of [['en', 44], ['de', 36], ['kr', 29]]) {
    const names = clubNames(pool, n, createRng(1));
    assert.equal(names.length, n);
    assert.equal(new Set(names).size, n);
  }
});

test('이적시장 기간: 오프시즌/초반/겨울에 열리고 그 밖에는 닫힌다', () => {
  const r = LEAGUES.epl.rules;
  assert.ok(windowState(r, 'offseason', 0, 38).open);
  assert.ok(windowState(r, 'regular', 0, 38).open);
  assert.ok(windowState(r, 'regular', 4, 38).open);
  assert.ok(!windowState(r, 'regular', 5, 38).open);
  assert.ok(!windowState(r, 'regular', 18, 38).open);
  assert.ok(windowState(r, 'regular', 19, 38).open);
  assert.ok(windowState(r, 'regular', 23, 38).open);
  assert.ok(!windowState(r, 'regular', 24, 38).open);
  assert.equal(windowState(r, 'regular', 2, 38).left, 3);
});
