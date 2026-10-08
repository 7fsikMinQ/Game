import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { createStore, pack, unpack, exportText, importText } from '../src/storage.js';

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const norm = (x) => JSON.parse(JSON.stringify(x));
const mk = (c = 'mlb') => { const s = G.newGame(3, 1e12, c); G.chooseClub(s, 3, 1e12); G.playNow(s, 30, 1e12); return s; };

test('저장 → 불러오기가 상태를 그대로 복원한다 (MLB/KBO, 시즌 중/오프시즌)', () => {
  for (const c of ['mlb', 'kbo']) {
    const s = mk(c);
    assert.deepEqual(unpack(pack(s, 1)).state, norm(s));
    G.dev.toOffseason(s);
    assert.deepEqual(unpack(pack(s, 2)).state, norm(s));
  }
});

test('불러온 상태에서 이어서 해도 원본과 똑같이 진행된다', () => {
  const a = mk('mlb');
  const b = unpack(pack(a, 1)).state;
  G.playNow(a, 200, 2e12); G.playNow(b, 200, 2e12);
  assert.deepEqual(norm(a), norm(b));
});

test('두 칸 번갈아 저장, 한 칸이 깨지면 직전 칸으로 복구', () => {
  const mm = mem(); const st = createStore(mm);
  const s = mk('kbo');
  st.save(s); G.playNow(s, 5, 1e12); st.save(s);
  const good = norm(s);
  G.playNow(s, 5, 1e12); st.save(s);
  const keys = [...mm.m.keys()].sort();
  assert.deepEqual(keys, ['bb.save.a', 'bb.save.b']);
  const newest = JSON.parse(mm.m.get('bb.save.b') || '{}').seq > JSON.parse(mm.m.get('bb.save.a') || '{}').seq ? 'bb.save.b' : 'bb.save.a';
  mm.m.set(newest, mm.m.get(newest).slice(0, -30));
  const loaded = createStore(mm).load();
  assert.ok(loaded);
  assert.notDeepEqual(norm(loaded), norm(s));
  assert.ok(loaded.teams.length === 10);
  assert.deepEqual(norm(loaded).season, good.season);
});

test('체크섬이 틀리거나 다른 게임/옛 버전 데이터는 거절', () => {
  const s = mk('mlb');
  const t = JSON.parse(pack(s, 1));
  t.data = t.data.replace('"season":1', '"season":9');
  assert.equal(unpack(JSON.stringify(t)), null);
  assert.equal(unpack('hello'), null);
  assert.equal(unpack(JSON.stringify({ f: 'soccer-save' })), null);
  const old = JSON.parse(pack(s, 1)); const raw = JSON.parse(old.data); raw.v = 1; old.data = JSON.stringify(raw);
  assert.equal(unpack(JSON.stringify(old)), null);
});

test('백업 텍스트 내보내기/가져오기, 손으로 고치면 복원 불가', () => {
  const s = mk('mlb');
  const text = exportText(s);
  assert.deepEqual(importText(text), norm(s));
  assert.equal(importText(text.replace('"sum":"', '"sum":"0')), null);
  assert.equal(importText('  '), null);
});

test('용량: 시즌 도중 MLB 저장은 600KB 이하, 10시즌 뒤에도 800KB 이하 (KBO는 절반 수준)', () => {
  const s = mk('mlb');
  assert.ok(pack(s, 1).length < 600 * 1024, `${pack(s, 1).length}`);
  for (let i = 0; i < 10; i++) { G.dev.toOffseason(s); G.startNextSeason(s, 1e12, { auto: true }); }
  assert.ok(pack(s, 2).length < 800 * 1024, `${pack(s, 2).length}`);
  const k = mk('kbo');
  assert.ok(pack(k, 1).length < 400 * 1024);
});

test('저장 공간이 없거나 막혀 있어도 게임은 계속된다', () => {
  const st = createStore({ getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('x'); } });
  assert.equal(st.load(), null);
  assert.equal(st.save(mk('mlb')), false);
  st.clear();
});
