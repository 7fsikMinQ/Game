import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportText, importText, pack, unpack } from '../src/storage.js';
import { newGame, advance } from '../src/game.js';

const mem = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m };
};
const T0 = 1_700_000_000_000;

test('저장했다가 불러오면 같은 상태', () => {
  const st = mem();
  const store = createStore(st);
  const s = newGame(1, T0);
  advance(s, T0 + 3_600_000);
  assert.ok(store.save(s));
  const loaded = createStore(st).load();
  assert.deepEqual(loaded, JSON.parse(JSON.stringify(s)));
});

test('저장 내용이 없으면 null', () => {
  assert.equal(createStore(mem()).load(), null);
});

test('A/B 칸에 번갈아 쓰고, 항상 최신 칸을 불러온다', () => {
  const st = mem();
  const store = createStore(st);
  const s = newGame(1, T0);
  store.save(s); // 1 -> b
  s.money = 111;
  store.save(s); // 2 -> a
  s.money = 222;
  store.save(s); // 3 -> b
  assert.equal(st._m.size, 2);
  assert.equal(createStore(st).load().money, 222);
});

test('가장 최근 칸이 깨져도 이전 칸으로 복구한다', () => {
  const st = mem();
  const store = createStore(st);
  const s = newGame(1, T0);
  s.money = 100;
  store.save(s);
  s.money = 200;
  store.save(s);
  const newest = [...st._m.entries()].map(([k, v]) => ({ k, seq: JSON.parse(v).seq })).sort((a, b) => b.seq - a.seq)[0].k;
  st.setItem(newest, st.getItem(newest).slice(0, -20)); // 쓰다가 끊긴 상황
  assert.equal(createStore(st).load().money, 100);
});

test('체크섬이 틀린(변조/손상) 데이터는 거부', () => {
  const s = newGame(1, T0);
  const text = pack(s, 1);
  assert.ok(unpack(text));
  const o = JSON.parse(text);
  o.data = o.data.replace('"money":1500', '"money":9999999');
  assert.equal(unpack(JSON.stringify(o)), null);
  assert.equal(unpack('not json'), null);
  assert.equal(unpack('{}'), null);
  assert.equal(unpack(JSON.stringify({ f: 'other', seq: 1, sum: 'x', data: '{}' })), null);
});

test('저장 공간이 가득 차 setItem이 예외를 던져도 앱이 죽지 않는다', () => {
  const store = createStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} });
  assert.equal(store.save(newGame(1, T0)), false);
});

test('getItem이 예외를 던져도(사생활 보호 모드) load는 null', () => {
  const store = createStore({ getItem: () => { throw new Error('denied'); }, setItem() {}, removeItem() {} });
  assert.equal(store.load(), null);
});

test('백업 내보내기/가져오기 왕복, 앞뒤 공백 허용, 잘못된 텍스트는 null', () => {
  const s = newGame(9, T0);
  advance(s, T0 + 3_600_000);
  const text = exportText(s);
  assert.deepEqual(importText(`\n  ${text}  \n`), JSON.parse(JSON.stringify(s)));
  assert.equal(importText('hello'), null);
  assert.equal(importText(''), null);
});

test('clear는 두 칸 모두 지운다', () => {
  const st = mem();
  const store = createStore(st);
  store.save(newGame(1, T0));
  store.save(newGame(1, T0));
  store.clear();
  assert.equal(st._m.size, 0);
  assert.equal(createStore(st).load(), null);
});

test('세이브 크기가 localStorage 한도(약 5MB)에 한참 못 미친다', () => {
  const s = newGame(1, T0);
  for (let i = 0; i < 5; i++) {
    advance(s, T0 + (i + 1) * 3_600_000 * 10);
  }
  assert.ok(pack(s, 1).length < 400_000, `${pack(s, 1).length} bytes`);
});
