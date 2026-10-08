import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { caOf } from '../src/player.js';

const T0 = 1_800_000_000_000;
const fresh = (c = 'epl', seed = 7, club = 3) => { const s = G.newGame(seed, T0, c); G.chooseClub(s, club, T0); s.money = 1e9; return s; };
const stub = { chance: () => true, next: () => 0.5, pick: (a) => a[0] };

test('이적: 이적시장이 열려 있으면 영입되고, 상대 구단은 선수를 보충한다', () => {
  const s = fresh();
  assert.ok(G.windowInfo(s).open);
  const { p, t } = G.marketPlayers(s)[0];
  const before = { me: G.userTeam(s).players.length, other: t.players.length, money: s.money };
  const ask = G.quoteOf(s, p.id).ask;
  const r = G.buyPlayer(s, p.id);
  assert.ok(r.ok);
  assert.equal(G.userTeam(s).players.length, before.me + 1);
  assert.equal(t.players.length, before.other);
  assert.equal(s.money, before.money - ask);
  assert.equal(p.ctr, 4); assert.ok(p.fee > 0); assert.ok(G.userTeam(s).players.includes(p));
  assert.ok(!t.players.includes(p));
  assert.ok(s.news.some((n) => n.kind === 'transfer'));
});

test('이적시장이 닫히면 영입/매각/임대/제안 수락이 막히고, 자유계약/방출은 가능', () => {
  const s = fresh();
  G.dev.skip(s, 8, T0);
  assert.ok(!G.windowInfo(s).open);
  const mk = G.marketPlayers(s)[0].p;
  assert.equal(G.buyPlayer(s, mk.id).err, 'window');
  const mine = G.userTeam(s).players.find((p) => p.pos !== 'GK');
  assert.equal(G.sellPlayer(s, mine.id).err, 'window');
  assert.equal(G.loanOut(s, mine.id).err, 'window');
  assert.equal(G.loanIn(s, G.loanCandidates(s)[0].p.id).err, 'window');
  const f = s.market.free[0];
  assert.ok(G.signFree(s, f.id).ok, '자유계약은 기간과 무관');
  assert.ok(G.releasePlayer(s, mine.id).ok);
});

test('선수단 한도: 30명이면 영입 불가, 18명 이하로는 매각/방출 불가, 골키퍼는 최소 2명', () => {
  const s = fresh();
  const me = G.userTeam(s);
  while (me.players.length < 30) G.signFree(s, s.market.free.length ? s.market.free[0].id : (G.refreshMarket(s, { next: Math.random, int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), chance: () => true, pick: (x) => x[0], normal: () => 0 }), s.market.free[0].id));
  assert.equal(me.players.length, 30);
  assert.equal(G.buyPlayer(s, G.marketPlayers(s)[0].p.id).err, 'full');
  const s2 = fresh();
  const m2 = G.userTeam(s2);
  const gks = m2.players.filter((p) => p.pos === 'GK');
  assert.ok(G.sellPlayer(s2, gks[0].id).ok); // GK 3 -> 2
  assert.equal(G.sellPlayer(s2, gks[1].id).err, 'gk');
  while (m2.players.length > 18) G.releasePlayer(s2, m2.players.find((p) => p.pos !== 'GK').id);
  assert.equal(G.sellPlayer(s2, m2.players.find((p) => p.pos !== 'GK').id).err, 'min');
});

test('매각: 가치의 85%, 선수는 다른 구단으로 간다', () => {
  const s = fresh();
  const p = G.userTeam(s).players.find((x) => x.pos === 'MC');
  const price = G.sellPrice(p), m0 = s.money;
  const r = G.sellPlayer(s, p.id);
  assert.ok(r.ok);
  assert.equal(s.money, m0 + price);
  assert.ok(s.teams.some((t) => t.id !== s.userId && t.players.includes(p)));
});

test('임대 영입: EPL은 동시에 2명까지(공식), 임대료를 내고 시즌 끝에 원소속팀으로 복귀', () => {
  const s = fresh('epl', 9);
  const c = G.loanCandidates(s);
  const [a, b, third] = c;
  const r1 = G.loanIn(s, a.p.id), r2 = G.loanIn(s, b.p.id);
  assert.ok(r1.ok && r2.ok);
  assert.equal(G.loansIn(s).length, 2);
  const r3 = G.loanIn(s, third.p.id);
  assert.equal(r3.err, 'limit');
  assert.equal(r3.max, 2);
  assert.ok(a.p.loan && a.p.loan.from === a.t.id && a.p.loan.opt > 0);
  assert.ok(!a.t.players.includes(a.p));
  G.dev.toOffseason(s, T0);
  assert.ok(a.t.players.includes(a.p), '원소속팀으로 복귀');
  assert.ok(!G.userTeam(s).players.includes(a.p));
  assert.equal(a.p.loan, null);
  assert.equal(G.loansIn(s).length, 0);
});

test('임대 한도는 리그별 설정(분데스/K리그 3명)', () => {
  const s = fresh('bl', 9, 0);
  const c = G.loanCandidates(s);
  assert.ok(G.loanIn(s, c[0].p.id).ok && G.loanIn(s, c[1].p.id).ok && G.loanIn(s, c[2].p.id).ok);
  assert.equal(G.loanIn(s, c[3].p.id).err, 'limit');
});

test('임대 후 완전 영입 옵션', () => {
  const s = fresh();
  const { p } = G.loanCandidates(s)[0];
  G.loanIn(s, p.id);
  const price = p.loan.opt, m0 = s.money;
  assert.ok(G.buyOption(s, p.id).ok);
  assert.equal(s.money, m0 - price);
  assert.equal(p.loan, null); assert.equal(p.ctr, 4);
  G.dev.toOffseason(s, T0);
  assert.ok(G.userTeam(s).players.includes(p), '완전 영입했으면 복귀하지 않는다');
});

test('임대 보내기: 임대료를 받고, 시즌 끝에 돌아오며, 중간에 복귀 요청도 된다', () => {
  const s = fresh();
  const me = G.userTeam(s);
  const p = me.players.find((x) => x.pos === 'ST'), q = me.players.find((x) => x.pos === 'DC');
  const m0 = s.money;
  const r = G.loanOut(s, p.id);
  assert.ok(r.ok);
  assert.equal(s.money, m0 + r.fee);
  assert.ok(!me.players.includes(p));
  assert.equal(G.loansOut(s).length, 1);
  assert.equal(p.loan.from, s.userId);
  assert.ok(G.recallLoan(s, p.id).ok);
  assert.ok(me.players.includes(p));
  assert.ok(G.loanOut(s, q.id).ok);
  G.dev.toOffseason(s, T0);
  assert.ok(G.userTeam(s).players.includes(q), '임대 보낸 선수가 시즌 종료 시 복귀');
});

test('임대 보내기 한도(EPL 4명)', () => {
  const s = fresh();
  const ps = G.userTeam(s).players.filter((p) => p.pos !== 'GK').slice(0, 5);
  for (let i = 0; i < 4; i++) assert.ok(G.loanOut(s, ps[i].id).ok);
  assert.equal(G.loanOut(s, ps[4].id).err, 'limit');
});

test('이적 제안: 등록하면 제안이 오고, 수락하면 거래가 되며, 거절/만료하면 사라진다', () => {
  const s = fresh();
  const p = G.userTeam(s).players.find((x) => x.pos === 'MC');
  G.listPlayer(s, p.id, Math.round(G.valueOf(p) * 1.1));
  G.processOffers(s, stub);
  assert.equal(s.offers.length >= 1, true);
  const o = s.offers[0];
  assert.equal(o.pid, p.id);
  assert.ok(o.fee > 0);
  const m0 = s.money;
  assert.ok(G.acceptOffer(s, o.id).ok);
  assert.equal(s.money, m0 + o.fee);
  assert.ok(!G.userTeam(s).players.includes(p));
  assert.equal(s.listings.length, 0);
  // 거절
  const q = G.userTeam(s).players.find((x) => x.pos === 'DC');
  G.listPlayer(s, q.id); G.processOffers(s, stub);
  const o2 = s.offers[0];
  G.rejectOffer(s, o2.id);
  assert.ok(!s.offers.some((x) => x.id === o2.id));
  // 만료
  G.processOffers(s, stub);
  s.tick += 10;
  G.processOffers(s, { ...stub, chance: () => false });
  assert.equal(s.offers.length, 0);
});

test('계약: 만료 선수는 오프시즌에 재계약하거나 팀을 떠난다', () => {
  const s = fresh('epl', 5, 2); s.settings.autoRenew = false;
  const me = G.userTeam(s);
  me.players.forEach((p, i) => { p.ctr = i < 4 ? 1 : 3; });
  const expiring = me.players.filter((p) => p.ctr === 1);
  G.dev.toOffseason(s, T0);
  assert.deepEqual(s.offseason.expiring.slice().sort(), expiring.map((p) => p.id).sort());
  const keep = expiring[0];
  const bonus = G.renewBonus(keep), m0 = s.money;
  const r = G.renewPlayer(s, keep.id, 3);
  assert.ok(r.ok);
  assert.equal(s.money, m0 - bonus);
  assert.equal(keep.ctr, 3);
  assert.ok(!s.offseason.expiring.includes(keep.id));
  G.startNextSeason(s, T0 + 3600e3, {});
  assert.ok(G.userTeam(s).players.includes(keep));
  for (const p of expiring.slice(1)) assert.ok(!G.userTeam(s).players.includes(p), '재계약 안 한 선수는 떠난다');
  assert.ok(s.market.free.some((p) => p.id === expiring[1].id));
});

test('자동 재계약: 필요한 선수는 잡고, 재정 한도를 넘으면 포기한다', () => {
  const s = fresh('epl', 5, 2); s.settings.autoRenew = true;
  const me = G.userTeam(s);
  me.players.forEach((p) => { p.ctr = 3; });
  const star = [...me.players].sort((a, b) => caOf(b) - caOf(a))[0];
  star.ctr = 1;
  G.dev.toOffseason(s, T0);
  G.startNextSeason(s, T0 + 3600e3, {});
  assert.ok(G.userTeam(s).players.includes(star), '핵심 선수는 자동 재계약');
  // 재정 한도: 인건비 비율이 한도를 크게 넘으면 비주전은 놓아준다
  const t = fresh('epl', 6, 2); t.settings.autoRenew = true;
  for (const p of G.userTeam(t).players) { p.ctr = 3; p.w *= 6; }
  const weak = [...G.userTeam(t).players].sort((a, b) => caOf(a) - caOf(b)).find((p) => p.pos !== 'GK');
  weak.ctr = 1; weak.age = 25; weak.pa = caOf(weak);
  G.dev.toOffseason(t, T0);
  G.startNextSeason(t, T0 + 3600e3, {});
  assert.ok(!G.userTeam(t).players.includes(weak), '재정이 한도를 넘으면 자동 재계약하지 않는다');
});

test('재정 규정: EPL은 선수단 비용 비율이 높으면 승점 삭감/부담금, 분데스·K리그는 경고만', () => {
  const s = fresh('epl', 5, 2);
  for (const p of G.userTeam(s).players) p.w *= 8;
  assert.ok(G.scrInfo(s).ratio > 1.15);
  G.dev.skip(s, 32, T0);
  assert.equal(G.userTeam(s).deduct, 6);
  assert.ok(s.news.some((n) => n.kind === 'finance' && n.text.includes('승점')));
  const mid = fresh('epl', 5, 2);
  const info = G.scrInfo(mid);
  const target = (0.85 + 1.15) / 2;
  const k = (target * info.revenue - info.amort) / info.wages;
  for (const p of G.userTeam(mid).players) p.w = Math.round(p.w * k);
  const m0 = mid.money;
  G.dev.skip(mid, 32, T0);
  assert.equal(G.userTeam(mid).deduct, 0);
  assert.ok(mid.news.some((n) => n.kind === 'finance' && n.text.includes('부담금')));
  assert.ok(mid.money < m0 + 5e9);
  const bl = fresh('bl', 5, 0);
  for (const p of G.userTeam(bl).players) p.w *= 8;
  G.dev.skip(bl, 28, T0);
  assert.equal(G.userTeam(bl).deduct, 0);
  assert.ok(bl.news.some((n) => n.kind === 'finance' && n.text.includes('경고만')));
});

test('유스: 오프시즌에 후보가 생기고, 시설 레벨이 높을수록 인원과 잠재력이 늘어난다', () => {
  const s = fresh();
  G.dev.toOffseason(s, T0);
  assert.equal(s.offseason.youth.length, 3);
  for (const p of s.offseason.youth) { assert.ok(p.age >= 16 && p.age <= 18); assert.ok(p.pa >= caOf(p)); assert.equal(p.ctr, 3); }
  const y = s.offseason.youth[0];
  assert.ok(G.acceptYouth(s, y.id).ok);
  assert.ok(G.userTeam(s).players.includes(y));
  G.rejectYouth(s, s.offseason.youth[0].id);
  assert.equal(s.offseason.youth.length, 1);
  const hi = fresh(); hi.fac.youth = 9;
  G.dev.toOffseason(hi, T0);
  assert.equal(hi.offseason.youth.length, 6); // 3 + floor(9/3)
});

test('시설: 비용은 레벨마다 커지고 최대 레벨/자금 부족을 거절한다', () => {
  const s = fresh();
  assert.ok(G.facCost(s, 'stadium', 3) > G.facCost(s, 'stadium', 2) * 1.5);
  s.money = 0;
  assert.equal(G.upgradeFacility(s, 'training').err, 'money');
  s.money = 1e12;
  for (let i = 0; i < G.FAC_MAX; i++) assert.ok(G.upgradeFacility(s, 'medical').ok);
  assert.equal(G.upgradeFacility(s, 'medical').err, 'max');
  assert.equal(G.upgradeFacility(s, 'x').err, 'notfound');
});

test('스카우트 추정: 내 선수는 정확, 남의 선수는 범위(스카우트가 높을수록 좁음), 항상 같은 값', () => {
  const s = fresh();
  const mine = G.userTeam(s).players[0];
  assert.deepEqual([G.paEstimate(s, mine).lo, G.paEstimate(s, mine).hi], [mine.pa, mine.pa]);
  const other = G.marketPlayers(s)[0].p;
  const a = G.paEstimate(s, other), b = G.paEstimate(s, other);
  assert.deepEqual(a, b);
  assert.ok(a.lo <= a.hi && a.lo >= caOf(other));
  s.fac.scout = 10;
  const c = G.paEstimate(s, other);
  assert.equal(c.lo, c.hi);
  assert.ok(c.hi - c.lo <= a.hi - a.lo);
});

test('방치 5시즌: 기본 자동 진행으로 파산하지 않고 선수단이 유지된다', () => {
  for (const c of ['epl', 'bl', 'kl']) {
    const s = G.newGame(41, T0, c); G.chooseClub(s, 5, T0);
    G.advance(s, T0 + 15 * 60_000 * 5 * 60);
    assert.ok(s.season >= 3, `${c} 시즌 ${s.season}`);
    const rev = G.annualRevenue(s, G.userTeam(s));
    assert.ok(s.money > -0.8 * rev, `${c}: 자금 ${s.money} (연 수입 ${rev})`);
    assert.ok(G.userTeam(s).players.length >= 18);
  }
});

// ───── 악용(자금 복사) 방지: 검토 라운드에서 찾은 허점들의 회귀 테스트 ─────
test('임대 보내기 → 복귀 → 재임대를 반복해도 돈이 늘지 않는다', () => {
  const s = fresh();
  const p = G.userTeam(s).players.find((x) => x.pos === 'MC');
  const m0 = s.money;
  for (let i = 0; i < 6; i++) { assert.ok(G.loanOut(s, p.id).ok); assert.ok(G.recallLoan(s, p.id).ok); }
  assert.equal(s.money, m0, '임대료 반환으로 순손익 0');
});

test('영입하거나 자유계약한 선수는 19라운드 동안 팔 수 없다', () => {
  const s = fresh();
  const hit = G.marketPlayers(s)[0];
  G.buyPlayer(s, hit.p.id);
  const r = G.sellPlayer(s, hit.p.id);
  assert.equal(r.err, 'locked');
  assert.ok(r.left > 0 && r.left <= G.LOCK_ROUNDS);
  G.listPlayer(s, hit.p.id); G.processOffers(s, stub);
  assert.ok(!s.offers.some((o) => o.pid === hit.p.id), '잠긴 선수에게는 제안이 오지 않는다');
  const f = s.market.free[0];
  G.signFree(s, f.id);
  assert.equal(G.sellPlayer(s, f.id).err, 'locked');
  // 시간이 지나 겨울 이적시장이 열리면 팔 수 있다
  G.dev.skip(s, 19, T0);
  assert.ok(G.windowInfo(s).open);
  assert.equal(G.lockLeft(s, f), 0);
  assert.ok(G.sellPlayer(s, f.id).ok);
});

test('영입가보다 비싸게 팔 수 없다: 이적 등록 호가 상한, 제안 금액 상한 (되팔이 차익 없음)', () => {
  const s = fresh();
  const p = G.userTeam(s).players.find((x) => x.pos === 'ST');
  G.listPlayer(s, p.id, G.valueOf(p) * 5);
  assert.ok(s.listings[0].ask <= Math.round(G.valueOf(p) * G.factorMul(p) * 1.15 / 100) * 100);
  let max = 0;
  for (let i = 0; i < 40; i++) { s.offers = []; G.processOffers(s, { chance: () => true, next: () => Math.random(), pick: (a) => a[0] }); for (const o of s.offers) if (o.pid === p.id) max = Math.max(max, o.fee / (G.valueOf(p) * G.factorMul(p))); }
  assert.ok(max > 0 && max <= 1.16, `최대 제안 ${max.toFixed(3)}배`);
  assert.ok(G.askPrice(p) / (G.valueOf(p) * G.factorMul(p)) >= 1.19, '영입 기준 호가는 (활약 보정된) 가치의 1.2배');
});

test('자유계약으로 데려온 선수는 되팔아도 차익이 거의 없다 (가치의 25%만 인정)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const s = fresh('epl', seed);
    for (const p of s.market.free.slice(0, 5)) {
      assert.ok(caOf(p) <= 120, `자유계약 CA ${caOf(p)}`);
      const cost = G.freePrice(p);
      assert.ok(G.signFree(s, p.id).ok);
      assert.ok(G.freeSigned(p));
      assert.ok(G.sellPrice(p) <= G.valueOf(p) * 0.25 + 100);
      G.listPlayer(s, p.id, G.valueOf(p) * 9);
      assert.ok(s.listings.find((l) => l.pid === p.id).ask <= Math.round(G.valueOf(p) * 0.25 * 1.15 / 100) * 100 + 100);
      void cost;
    }
  }
});

test('이적이 전력에 반영된다: 더 좋은 선수를 영입하면 그 선수가 선발에 들어가고 팀 전력과 예상 승리 확률이 오른다', () => {
  const s = fresh('epl', 12, 8);
  const me = G.userTeam(s);
  const before = { ca: G.teamCA(me), win: G.preview(s) };
  const cands = G.marketPlayers(s).filter(({ p }) => caOf(p) >= 128).sort((a, b) => caOf(b.p) - caOf(a.p));
  assert.ok(cands.length > 0);
  const { p } = cands[0];
  const worstSame = me.players.filter((x) => x.pos === p.pos).sort((a, b) => caOf(a) - caOf(b))[0];
  assert.ok(G.buyPlayer(s, p.id).ok);
  const sq = G.squadFor(s, me);
  assert.ok(sq.xi.some((x) => x.p === p) || caOf(p) <= caOf(worstSame), '영입한 선수가 선발에 들어가야 한다');
  assert.ok(G.teamCA(me) >= before.ca, `전력 ${before.ca} → ${G.teamCA(me)}`);
  const afterWin = G.preview(s);
  if (before.win && afterWin) assert.ok(afterWin.w + afterWin.d * 0.5 >= before.win.w + before.win.d * 0.5 - 1e-9);
});

test('이적 상대 팀은 전력이 약해지고 비슷한 선수를 보충한다 (AI 구단의 선수단 유지)', () => {
  const s = fresh('epl', 13, 8);
  const { p, t } = G.marketPlayers(s).find(({ p }) => caOf(p) >= 125);
  const n = t.players.length;
  G.buyPlayer(s, p.id);
  assert.equal(t.players.length, n);
  assert.ok(t.players.some((x) => x.pos === p.pos && x !== p));
});

test('나이: 한 시즌 뒤 어린 선수는 평균적으로 늘고 33세 이상은 평균적으로 줄어든다 (3개 리그)', () => {
  for (const c of ['epl', 'bl', 'kl']) {
    const s = fresh(c, 31, 2);
    const before = new Map(s.teams.flatMap((t) => t.players).map((p) => [p.id, { age: p.age, ca: caOf(p) }]));
    G.dev.toOffseason(s, T0);
    G.startNextSeason(s, T0, {});
    const d = { young: [], old: [] };
    for (const p of s.teams.flatMap((t) => t.players)) {
      const b = before.get(p.id);
      if (!b) continue;
      assert.equal(p.age, b.age + 1);
      if (b.age <= 23) d.young.push(caOf(p) - b.ca); else if (b.age >= 33) d.old.push(caOf(p) - b.ca);
    }
    const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    assert.ok(d.young.length > 5 && mean(d.young) > 2, `${c} 23세 이하 ${mean(d.young)}`);
    assert.ok(d.old.length === 0 || mean(d.old) < -1.5, `${c} 33세 이상 ${mean(d.old)}`);
  }
});
