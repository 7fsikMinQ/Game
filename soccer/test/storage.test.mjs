import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportText, importText, pack, unpack, compact, inflate } from '../src/storage.js';
import * as G from '../src/game.js';

const T0 = 1_800_000_000_000;
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), _m: m }; };
const game = (c = 'bl', seed = 1) => { const s = G.newGame(seed, T0, c); G.chooseClub(s, 2, T0); return s; };

test('접기/펴기는 상태를 정확히 복원한다 (진행 중, 임대, 부상 포함)', () => {
  const s = game('epl', 3);
  G.dev.skip(s, 12, T0);
  const { p } = G.loanCandidates(s)[0] || {}; if (p) { s.money = 1e9; G.loanIn(s, p.id); }
  G.userTeam(s).players[0].out = 3;
  assert.deepEqual(inflate(JSON.parse(JSON.stringify(compact(s)))), s);
  assert.deepEqual(unpack(pack(s, 1)).state, s);
});

test('접어서 저장하면 원본 JSON보다 작다', () => {
  const s = game('epl', 4);
  G.dev.skip(s, 10, T0);
  assert.ok(pack(s, 1).length < JSON.stringify(s).length * 0.8);
});

test('저장 크기: 세 리그 모두 한 칸이 400KB 미만 (EPL 1·2부 포함)', () => {
  for (const c of ['epl', 'bl', 'kl']) {
    const s = game(c, 5);
    G.dev.skip(s, 30, T0);
    const n = pack(s, 1).length;
    assert.ok(n < 400_000, `${c}: ${n}`);
  }
});

test('불러오면 같은 상태, 없으면 null, A/B 교대 저장, 최신 칸 우선', () => {
  const st = mem(), store = createStore(st);
  assert.equal(store.load(), null);
  const s = game();
  store.save(s); s.money = 111; store.save(s); s.money = 222; store.save(s);
  assert.equal(st._m.size, 2);
  assert.equal(createStore(st).load().money, 222);
});

test('최신 칸이 깨져도 이전 칸으로 복구, 체크섬 변조/다른 게임 세이브/잘못된 입력은 거부', () => {
  const st = mem(), store = createStore(st);
  const s = game();
  s.money = 100; store.save(s); s.money = 200; store.save(s);
  const newest = [...st._m.entries()].map(([k, v]) => ({ k, seq: JSON.parse(v).seq })).sort((a, b) => b.seq - a.seq)[0].k;
  st.setItem(newest, st.getItem(newest).slice(0, -30));
  assert.equal(createStore(st).load().money, 100);
  const o = JSON.parse(pack(s, 1)); o.data = o.data.replace('"money":200', '"money":9999999');
  assert.equal(unpack(JSON.stringify(o)), null);
  const other = JSON.parse(pack(s, 1)); const raw = JSON.parse(other.data); raw.game = 'baseball'; other.data = JSON.stringify(raw);
  other.sum = (() => { let h = 2166136261; for (let i = 0; i < other.data.length; i++) { h ^= other.data.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); })();
  assert.equal(unpack(JSON.stringify(other)), null, '다른 게임 세이브는 받지 않는다');
  for (const bad of ['', 'x', '{}', '[]', 'null']) assert.equal(unpack(bad), null);
});

test('저장 공간 초과/접근 거부에도 앱이 죽지 않는다', () => {
  const full = createStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem() {} });
  assert.equal(full.save(game()), false);
  const denied = createStore({ getItem: () => { throw new Error('denied'); }, setItem() {}, removeItem() {} });
  assert.equal(denied.load(), null);
});

test('백업 내보내기/가져오기 왕복, 공백 허용, 잘못된 텍스트는 null', () => {
  const s = game('kl', 2);
  G.dev.skip(s, 6, T0);
  assert.deepEqual(importText(`\n ${exportText(s)} \n`), s);
  assert.equal(importText('hello'), null);
});

test('clear는 두 칸 모두 지운다', () => {
  const st = mem(), store = createStore(st);
  store.save(game()); store.save(game());
  store.clear();
  assert.equal(st._m.size, 0);
});
