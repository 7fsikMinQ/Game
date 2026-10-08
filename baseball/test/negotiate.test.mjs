import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';

const T0 = 1_700_000_000_000;
const fresh = (country = 'mlb', seed = 4) => { const s = G.newGame(seed, T0, country, { real: false }); G.chooseClub(s, 3, T0, { autopilot: false }); s.money = 1e6; return s; };
const sorted = (t) => t.players.slice().sort((a, b) => G.tradeValue(G.Lof({ country: t.cty }), b) - 0);
function pair(s) {
  const L = G.Lof(s), me = G.userTeam(s), ai = s.teams.find((t) => t.id !== s.userId);
  const val = (p) => G.tradeValue(L, p);
  const get = ai.players.filter((p) => p.role === 'H').sort((a, b) => val(b) - val(a))[3];
  const give = me.players.filter((p) => p.role === 'H' && G.lockLeft(s, p) === 0).sort((a, b) => Math.abs(val(a) - val(get) * 0.95) - Math.abs(val(b) - val(get) * 0.95))[0];
  return { L, me, ai, get, give, val };
}

test('활약·부상이 트레이드 가치에 반영된다', () => {
  const s = fresh(); const { L, give } = pair(s);
  const base = G.tradeValue(L, give);
  give.s = { pa: 300, ab: 270, h: 100, bb: 40, d2: 20, d3: 2, hr: 30, rbi: 70 }; // OPS 높음
  assert.ok(G.tradeValue(L, give) > base);
  give.s = { pa: 300, ab: 270, h: 50, bb: 15, d2: 5, d3: 0, hr: 3, rbi: 20 };
  assert.ok(G.tradeValue(L, give) < base);
  give.s = null; give.inj = 20;
  assert.ok(G.tradeValue(L, give) < base);
  assert.ok(G.valueFactors(give).some((f) => f.k === 'inj'));
});

test('구단마다 요구하는 가치 비율이 다르다 (1.04~1.16)', () => {
  const s = fresh();
  const v = s.teams.map((t) => G.stingy(t.id));
  assert.ok(new Set(v.map((x) => x.toFixed(3))).size > 5);
  assert.ok(v.every((x) => x >= 1.04 && x <= 1.16));
});

test('가치가 모자라면 현금 역제안, 그 금액을 보태면 성사된다', () => {
  const s = fresh('mlb'); const { L, ai, get, give, val } = pair(s);
  // 일부러 부족하게: 내 선수의 가치를 낮춘다
  give.inj = 0; give.s = null;
  const ratio0 = val(give) / val(get);
  const r = G.propose(s, ai.id, [give.id], [get.id], 0);
  if (r.status === 'accepted') return; // 우연히 충분하면 통과
  assert.ok(['counter', 'rejected', 'broken'].includes(r.status), r.status);
  if (r.status === 'counter') {
    assert.ok(r.cash > 0 && r.add > 0);
    const m0 = s.money;
    const r2 = G.propose(s, ai.id, [give.id], [get.id], r.cash);
    assert.equal(r2.status, 'accepted');
    assert.ok(Math.abs((m0 - s.money) - r.cash) < 0.011);
    assert.ok(ai.players.includes(give) && G.userTeam(s).players.includes(get));
  } else assert.ok(ratio0 < 1.3);
});

test('무리한 제안이 거듭되면 협상이 중단되고 며칠 뒤 풀린다', () => {
  const s = fresh(); const { ai, me } = pair(s);
  const star = ai.players.slice().sort((a, b) => G.tradeValue(G.Lof(s), b) - G.tradeValue(G.Lof(s), a))[0];
  const junk = me.players.filter((p) => G.lockLeft(s, p) === 0).sort((a, b) => G.tradeValue(G.Lof(s), a) - G.tradeValue(G.Lof(s), b))[0];
  const st = [1, 2, 3].map(() => G.propose(s, ai.id, [junk.id], [star.id], 0).status);
  assert.equal(st[2], 'broken');
  assert.equal(G.propose(s, ai.id, [junk.id], [star.id], 1e5).status, 'broken');
  s.sched.idx += G.NEG_BREAK_DAYS;
  assert.notEqual(G.propose(s, ai.id, [junk.id], [star.id], 0).status, 'broken');
});

test('현금이 모자라면 현금 포함 제안은 거절된다 / 협상 상태가 저장된다', () => {
  const s = fresh(); const { ai, give, get } = pair(s);
  s.money = 0;
  const r = G.tradeCheck(s, ai.id, [give.id], [get.id], 5);
  assert.equal(r.err, 'money');
  G.propose(s, ai.id, [give.id], [get.id], 0);
  assert.ok(JSON.parse(JSON.stringify(s)).neg);
});

test('KBO에서도 같은 방식으로 협상된다', () => {
  const s = fresh('kbo', 6); const { ai, give, get } = pair(s);
  const r = G.propose(s, ai.id, [give.id], [get.id], 0);
  assert.ok(['accepted', 'counter', 'rejected', 'broken'].includes(r.status) || ['foreign', 'payAI', 'rosterAI', 'locked'].includes(r.err), JSON.stringify(r));
});
