import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';

const T0 = 1_700_000_000_000;
function setup(country = 'epl', seed = 5) {
  const s = G.newGame(seed, T0, country); G.chooseClub(s, 2, T0);
  s.money = 1e9; 
  return s;
}
const openWindow = (s) => { for (let i = 0; i < 60 && !G.windowInfo(s).open; i++) G.playNow(s, 1, T0 + i); };
const pick = (s) => G.marketPlayers(s)[0];

test('협상 입찰: 호가 이상은 수락, 최저선 이상도 수락, 크게 낮으면 거절', () => {
  const s = setup(); openWindow(s);
  const { p } = pick(s); const q = G.quoteOf(s, p.id);
  assert.ok(q.reserve < q.ask && q.reserve > q.ask * 0.8);
  const low = G.bidPlayer(s, p.id, q.ask * 0.5);
  assert.equal(low.status, 'rejected');
  const ok = G.bidPlayer(s, p.id, q.reserve);
  assert.equal(ok.status, 'accepted');
  assert.equal(ok.price, q.reserve);
  assert.ok(G.userTeam(s).players.some((x) => x.id === p.id));
});

test('최저선 근처는 역제안, 역제안 금액은 반드시 수락된다', () => {
  const s = setup(); openWindow(s);
  const { p } = pick(s); const q = G.quoteOf(s, p.id);
  const r = G.bidPlayer(s, p.id, q.reserve * 0.9);
  assert.equal(r.status, 'counter');
  assert.ok(r.counter >= q.reserve && r.counter <= q.ask);
  const m0 = s.money;
  const r2 = G.bidPlayer(s, p.id, r.counter);
  assert.equal(r2.status, 'accepted');
  assert.equal(m0 - s.money, r.counter);
});

test('무리한 제안을 반복하면 협상이 결렬되고 몇 라운드 뒤 다시 열린다', () => {
  const s = setup(); openWindow(s);
  const { p } = pick(s); const q = G.quoteOf(s, p.id);
  const lows = [1, 2, 3].map(() => G.bidPlayer(s, p.id, q.ask * 0.3).status);
  assert.deepEqual(lows, ['rejected', 'rejected', 'broken']);
  assert.equal(G.bidPlayer(s, p.id, q.ask * 2).status, 'broken'); // 결렬 중에는 좋은 금액도 받지 않는다
  s.tick += G.BREAK_ROUNDS;
  assert.equal(G.bidPlayer(s, p.id, q.ask).status, 'accepted');
});

test('즉시 구매는 호가 그대로, 협상으로 더 싸게 살 수 있다', () => {
  const s = setup(); openWindow(s);
  const [a, b] = G.marketPlayers(s);
  const qa = G.quoteOf(s, a.p.id), qb = G.quoteOf(s, b.p.id);
  const m = s.money;
  assert.equal(G.buyPlayer(s, a.p.id).price, qa.ask);
  G.bidPlayer(s, b.p.id, qb.reserve);
  assert.ok(m - s.money < qa.ask + qb.ask);
  assert.ok(qb.reserve < qb.ask);
});

test('시즌 활약이 좋으면 비싸지고 부진하면 싸진다, 부상·계약 1년은 할인', () => {
  const base = { id: 1, pos: 'ST', age: 25, cond: 100, ctr: 4, out: 0, a: {}, pa: 100 };
  const hot = { ...base, s: { app: 10, rt: 75, g: 8, a: 2, min: 900 } };
  const cold = { ...base, s: { app: 10, rt: 55, g: 0, a: 0, min: 900 } };
  assert.ok(G.factorsOf(hot).some((f) => f.mul > 1));
  assert.ok(G.factorsOf(cold).some((f) => f.mul < 1));
  assert.ok(G.factorsOf({ ...base, out: 5 }).some((f) => f.k === 'inj'));
  assert.ok(G.factorsOf({ ...base, ctr: 1 }).some((f) => f.k === 'ctr' && f.mul < 1));
  assert.equal(G.factorsOf(base).length, 0);
});

test('구단마다 성향(호가·흥정 폭)이 다르다', () => {
  const s = setup();
  const st = new Set(s.teams.map((t) => G.stanceOf(t).toFixed(3)));
  const fl = new Set(s.teams.map((t) => G.flexOf(t).toFixed(3)));
  assert.ok(st.size > 5 && fl.size > 5);
  for (const t of s.teams) { assert.ok(G.stanceOf(t) >= 0.95 && G.stanceOf(t) <= 1.1); assert.ok(G.flexOf(t) >= 0.06 && G.flexOf(t) <= 0.16); }
});

test('매각 협상: 상한 이하는 수락, 조금 넘으면 역제안, 너무 높으면 거절', () => {
  const s = setup(); openWindow(s);
  const me = G.userTeam(s);
  const p = me.players.slice().sort((a, b) => G.caOf(a) - G.caOf(b))[5];
  assert.ok(!G.lockLeft(s, p));
  const band = G.sellBand(s, p);
  assert.equal(G.askForPlayer(s, p.id, band.ceiling * 3).status, 'rejected');
  const c = G.askForPlayer(s, p.id, band.ceiling * 1.1);
  assert.equal(c.status, 'counter');
  const m = s.money;
  const r = G.askForPlayer(s, p.id, c.counter);
  assert.equal(r.status, 'accepted');
  assert.equal(s.money - m, c.counter);
  assert.ok(!G.userTeam(s).players.some((x) => x.id === p.id));
});

test('협상 상태는 저장·복원되고 시즌이 바뀌면 초기화된다', () => {
  const s = setup(); openWindow(s);
  const { p } = pick(s); const q = G.quoteOf(s, p.id);
  G.bidPlayer(s, p.id, q.ask * 0.3);
  assert.equal(JSON.parse(JSON.stringify(s)).neg[p.id].pat, 2);
});

test('이적시장이 닫혀 있으면 협상할 수 없다', () => {
  const s = setup('epl'); s.phase = 'regular';
  if (G.windowInfo(s).open) return;
  const { p } = pick(s);
  assert.equal(G.bidPlayer(s, p.id, 100).err, 'window');
});

test('매입가와 매각 상한 사이에 큰 차익이 없다 (되팔이 방지)', () => {
  const s = setup(); openWindow(s);
  for (const { p, t } of G.marketPlayers(s)) {
    const q = G.quoteOf(s, p.id);
    const sell = G.sellBand(s, p).ceiling;
    assert.ok(q.reserve >= sell * 0.8, `${p.name}: 매입 ${q.reserve} / 매각상한 ${sell}`);
  }
});

import * as V from '../src/views.js';
test('협상 시트가 그려지고 결렬/역제안 상태를 보여 준다', () => {
  const s = setup(); openWindow(s);
  const { p } = pick(s); const q = G.quoteOf(s, p.id);
  const ui = { neg: { pid: p.id, mode: 'buy', log: [{ text: '테스트' }], counter: 0, input: null } };
  let h = V.negSheet(s, ui);
  assert.ok(h.includes('영입 협상') && h.includes('data-act="neg-bid"') && h.includes('호가'));
  ui.neg.counter = q.ask; assert.ok(V.negSheet(s, ui).includes('neg-take'));
  for (let i = 0; i < 3; i++) G.bidPlayer(s, p.id, q.ask * 0.3);
  h = V.negSheet(s, ui);
  assert.ok(h.includes('협상이 결렬') && !h.includes('neg-bid'));
  const own = G.userTeam(s).players[6];
  ui.neg = { pid: own.id, mode: 'sell', log: [], counter: 0, input: null };
  assert.ok(V.negSheet(s, ui).includes('매각 협상'));
  const sheet = V.playerSheet(s, p.id, 'market');
  assert.ok(sheet.includes('협상하기') && sheet.includes('즉시 구매'));
});
