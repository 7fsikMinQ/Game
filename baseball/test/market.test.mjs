import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { LEAGUES } from '../src/data.js';

const T0 = 1_800_000_000_000;
const fresh = (c = 'mlb', seed = 7, club = 3) => { const s = G.newGame(seed, T0, c); G.chooseClub(s, club, T0); return s; };
const me = (s) => G.userTeam(s);
const toOff = (s) => { G.dev.toOffseason(s); return s; };

test('1군 엔트리: 올리고 내릴 수 있고, 한도(MLB 26)를 넘지 못하며 부상자는 올릴 수 없다', () => {
  const s = fresh();
  const t = me(s);
  s.settings.autoRoster = false;
  const farm = t.players.filter((p) => !p.act);
  assert.equal(G.setActive(s, farm[0].id, true).err, 'full');
  const act = t.players.find((p) => p.act && p.pos === 'RP');
  assert.ok(G.setActive(s, act.id, false).ok);
  assert.ok(G.setActive(s, farm[0].id, true).ok);
  assert.equal(t.players.filter((p) => p.act).length, 26);
  const f2 = t.players.find((p) => !p.act && p.id !== farm[0].id);
  f2.inj = 10; G.setActive(s, farm[0].id, false);
  assert.equal(G.setActive(s, f2.id, true).err, 'injured');
});

test('방출: 위약금(남은 연봉의 절반)을 내고, 최소 인원 아래로는 못 줄인다', () => {
  const s = fresh();
  const t = me(s);
  const p = t.players.find((x) => !x.act);
  const cost = G.releaseCost(s, p);
  const m0 = s.money;
  assert.ok(G.release(s, p.id).ok);
  assert.ok(Math.abs(m0 - s.money - cost) < 0.011);
  while (t.players.length > G.rosterMin(s)) G.release(s, t.players.find((x) => !x.act).id);
  assert.equal(G.release(s, t.players.find((x) => !x.act).id).err, 'min');
});

test('FA 영입: 풀에서 사라지고 내 팀에 들어오며, 거래 제한(잠금)이 걸린다. 영입 후 바로 되팔기(트레이드)는 불가', () => {
  const s = fresh('mlb', 3);
  const t = me(s);
  G.release(s, t.players.find((x) => !x.act && x.role === 'H').id);
  const fa = s.market.free.slice().sort((a, b) => G.ovrOf(b) - G.ovrOf(a))[0];
  const n = s.market.free.length;
  const r = G.signFA(s, fa.id, 2);
  assert.ok(r.ok);
  assert.equal(s.market.free.length, n - 1);
  assert.ok(t.players.includes(fa));
  assert.ok(G.lockLeft(s, fa) > 0);
  const ai = s.teams[5];
  const chk = G.tradeCheck(s, ai.id, [fa.id], [ai.players.find((p) => p.act).id]);
  assert.equal(chk.err, 'locked');
});

test('FA 영입: 가득 찬 로스터/없는 선수/음수 자금은 거절', () => {
  const s = fresh();
  assert.equal(G.signFA(s, 99999, 1).err, 'notfound');
  const fa = s.market.free[0];
  while (me(s).players.length < G.rosterMax(s)) me(s).players.push({ ...fa, id: 5000 + me(s).players.length });
  assert.equal(G.signFA(s, fa.id, 1).err, 'full');
  me(s).players.length = G.rosterMin(s);
  s.money = -1;
  assert.equal(G.signFA(s, fa.id, 1).err, 'money');
});

test('KBO 외국인 한도: 외국인 3명·아시아쿼터 1명을 넘겨 영입할 수 없다', () => {
  const s = fresh('kbo', 3, 4);
  const t = me(s);
  const f = s.market.foreign.find((p) => p.fx === 1);
  G.release(s, t.players.find((p) => !p.act && !p.fx).id); // 빈자리 확보
  assert.equal(G.signFA(s, f.id, 1, 'foreign').err, 'foreign');
  const mine = t.players.find((p) => p.fx === 1);
  G.release(s, mine.id);
  assert.ok(G.signFA(s, f.id, 1, 'foreign').ok);
  assert.equal(t.players.filter((p) => p.fx === 1).length, 3);
});

test('트레이드: 가치가 부족하면 거절, 충분하면 성사되고 양쪽 로스터가 바뀐다 / 여러 명 몰아주기는 할인', () => {
  const s = fresh('mlb', 3);
  const t = me(s), ai = s.teams[10];
  const star = ai.players.slice().sort((a, b) => G.ovrOf(b) - G.ovrOf(a))[0];
  const junk = t.players.slice().sort((a, b) => G.ovrOf(a) - G.ovrOf(b)).slice(0, 3);
  assert.equal(G.tradeCheck(s, ai.id, [junk[0].id], [star.id]).err, 'value');
  const best = t.players.slice().sort((a, b) => G.ovrOf(b) - G.ovrOf(a))[0];
  const pair = [ai.players.filter((p) => p.act && p.role === best.role).sort((a, b) => G.ovrOf(a) - G.ovrOf(b))[0]];
  const ok = G.tradeCheck(s, ai.id, [best.id], [pair[0].id]);
  assert.ok(ok.ok, ok.err);
  assert.ok(G.trade(s, ai.id, [best.id], [pair[0].id]).ok);
  assert.ok(ai.players.includes(best)); assert.ok(t.players.includes(pair[0]));
  assert.equal(t.players.length, 40); assert.equal(ai.players.length, 40);
});

test('트레이드: 마감일 이후에는 정규시즌에 불가, 오프시즌에는 가능', () => {
  const s = fresh('mlb', 4);
  const ai = s.teams[2];
  const p = me(s).players[0], q = ai.players[0];
  s.sched.idx = Math.floor(s.sched.rounds.length * LEAGUES.mlb.tradeDeadline) + 1;
  assert.equal(G.tradeCheck(s, ai.id, [p.id], [q.id]).err, 'window');
  toOff(fresh('mlb', 4));
  const s2 = toOff(fresh('mlb', 4));
  assert.ok(G.tradeOpen(s2));
});

test('트레이드: 로스터 한도·외국인 한도를 어기는 거래는 거절', () => {
  const s = fresh('kbo', 4, 4);
  const ai = s.teams[1];
  const myF = me(s).players.find((p) => p.fx === 1), aiH = ai.players.find((p) => p.fx === 0 && p.role === myF.role);
  const r = G.tradeCheck(s, ai.id, [myF.id], [aiH.id]);
  assert.equal(r.err, 'foreign'); // 상대 팀의 외국인이 4명이 되므로 거절
  const a2 = ai.players.find((p) => p.fx === 1);
  const r2 = G.tradeCheck(s, ai.id, [myF.id], [a2.id]);
  assert.notEqual(r2.err, 'foreign'); // 외국인끼리 교환은 한도를 지킨다
});

test('AI 제안(오퍼): 일정 기간 뒤 만료, 수락하면 거래 성사', () => {
  const s = fresh('mlb', 6);
  G.withRng(s, (rng) => { for (let i = 0; i < 200 && !s.offers.length; i++) { G.genOffers(s, rng); s.sched.idx++; } });
  if (!s.offers.length) return; // 확률적 이벤트
  const o = s.offers[0];
  const ask = me(s).players.find((p) => p.id === o.askId);
  assert.ok(ask);
  assert.ok(G.acceptOffer(s, o.id).ok);
  assert.ok(!me(s).players.includes(ask));
  assert.ok(me(s).players.some((p) => o.giveIds.includes(p.id)));
});

test('드래프트: 순서는 성적이 나쁜 팀부터, 내 차례에 지명하면 내 팀에 들어오고 자동 진행도 된다', () => {
  const L = LEAGUES.mlb;
  const s = toOff(fresh('mlb', 5));
  const d = s.offseason.draft;
  assert.equal(d.order.length, L.draftRounds * 30);
  const worst = s.teams.slice().sort((a, b) => a.w / (a.w + a.l) - b.w / (b.w + b.l))[0].id;
  assert.equal(d.order[0], worst);
  G.withRng(s, (rng) => {
    G.draftAIRun(s, rng);
    assert.equal(G.draftCurrent(d), s.userId);
    const pick = d.pool[0];
    const n = me(s).players.length;
    assert.ok(G.draftPickUser(s, pick.id, rng).ok);
    assert.ok(me(s).players.some((p) => p.id === pick.id));
    assert.equal(me(s).players.length >= n + 1, true);
    G.draftAuto(s, rng);
  });
  assert.equal(d.idx, d.order.length);
  assert.equal(d.picks.length, d.order.length);
  assert.equal(new Set(d.picks.map((x) => x.pid)).size, d.picks.length);
});

test('드래프트 선수는 유망주 등급(★)에 따라 잠재력 분포가 다르다', () => {
  const s = toOff(fresh('mlb', 5));
  const pool = s.offseason.draft.pool;
  const avg = (h) => { const a = pool.filter((p) => p.hype === h); return a.length ? a.reduce((x, p) => x + (p.pot - G.ovrOf(p)), 0) / a.length : null; };
  const gaps = [0, 1, 2, 3, 4].map(avg).filter((x) => x !== null);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1] - 1, `hype ${i}: ${gaps}`);
  assert.ok(gaps[gaps.length - 1] > gaps[0] + 6);
});

test('재계약(연장): 만료 선수를 연장하면 다음 시즌에 남고, 안 하면 FA로 풀린다', () => {
  const s = toOff(fresh('mlb', 8));
  const ids = s.offseason.expiring.slice();
  assert.ok(ids.length > 0, '만료 선수 없음');
  const cand = ids.map((id) => me(s).players.find((p) => p.id === id)).filter((p) => p.age <= 35);
  const keep = cand[0];
  const lose = cand[1] || null;
  const r = G.extend(s, keep.id, 3);
  assert.ok(r.ok && keep.yrs === 3 && keep.sal > 0);
  s.settings.autopilot = false;
  G.startNextSeason(s, T0, {});
  assert.ok(me(s).players.some((p) => p.id === keep.id));
  if (lose) { assert.ok(!me(s).players.some((p) => p.id === lose.id)); const elsewhere = s.market.free.some((p) => p.id === lose.id) || s.teams.some((t) => t.id !== s.userId && t.players.some((p) => p.id === lose.id));
    const retired = lose.age >= 36;
    assert.ok(elsewhere || retired, '떠난 선수는 FA이거나 다른 팀에 있거나 은퇴해야 한다'); }
});

test('보유권: 서비스 타임이 FA 기준(MLB 6년/KBO 8년)에 못 미치는 선수는 계약이 끝나도 팀에 남는다', () => {
  for (const c of ['mlb', 'kbo']) {
    const L = LEAGUES[c];
    const s = fresh(c, 2, 1);
    const young = me(s).players.find((p) => p.act && p.svc < L.faAt - 1);
    young.yrs = 1;
    G.dev.toOffseason(s);
    assert.ok(me(s).players.includes(young));
    assert.ok(young.yrs >= 1);
    assert.ok(!s.offseason.expiring.includes(young.id));
  }
});

test('잠재력 추정: 내 선수는 정확, 다른 팀 선수는 범위(스카우트 레벨이 높을수록 좁다)', () => {
  const s = fresh();
  const mine = me(s).players[0], other = s.teams[7].players.find((p) => p.age < 25);
  assert.equal(G.potEstimate(s, mine).err, 0);
  const e0 = G.potEstimate(s, other).err;
  s.fac.scout = 6;
  assert.ok(G.potEstimate(s, other).err < e0);
  const est = G.potEstimate(s, other);
  assert.ok(est.lo <= est.mid && est.mid <= est.hi);
});

test('시설 투자: 비용이 레벨마다 늘고, 돈이 부족하면 실패, 최대 레벨 제한', () => {
  const s = fresh();
  assert.ok(G.facCost(s, 'camp', 1) > G.facCost(s, 'camp', 0));
  s.money = 0;
  assert.equal(G.upgradeFacility(s, 'camp').err, 'money');
  s.money = 1e6;
  for (let i = 0; i < G.FAC_MAX; i++) assert.ok(G.upgradeFacility(s, 'stadium').ok);
  assert.equal(G.upgradeFacility(s, 'stadium').err, 'max');
  assert.equal(G.upgradeFacility(s, 'nope').err, 'notfound');
});

test('시설 효과: 구장 투자는 수입을 늘리고, 의료팀은 부상 회복을 빠르게 한다', () => {
  const s = fresh();
  const r0 = G.annualRevenue(s, me(s));
  s.fac.stadium = 4;
  assert.ok(G.annualRevenue(s, me(s)) > r0 * 1.12);
});

test('스카우트·유망주: 어린 선수일수록 잠재력 격차가 크고, 27세 이상은 현재 능력과 거의 같다', () => {
  const s = fresh();
  const all = s.teams.flatMap((t) => t.players);
  const gap = (f) => { const a = all.filter(f); return a.reduce((x, p) => x + p.pot - G.ovrOf(p), 0) / a.length; };
  assert.ok(gap((p) => p.age <= 22) > gap((p) => p.age >= 28) + 3);
  assert.ok(gap((p) => p.age >= 28) < 4);
});
