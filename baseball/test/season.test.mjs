import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { LEAGUES, COUNTRIES } from '../src/data.js';

const T0 = 1_800_000_000_000, MIN = 60_000;
const fresh = (c = 'mlb', seed = 7, club = 3) => { const s = G.newGame(seed, T0, c); G.chooseClub(s, club, T0); return s; };

test('구단 선택 전에는 시간이 흘러도 진행되지 않는다', () => {
  const s = G.newGame(1, T0, 'mlb');
  assert.equal(G.advance(s, T0 + 999 * MIN).games, 0);
  assert.equal(s.phase, 'setup');
});

test('한 시즌 (MLB/KBO): 팀당 경기 수, 전체 승패 합, 포스트시즌 우승팀, 오프시즌 진입', () => {
  for (const c of COUNTRIES) {
    const L = LEAGUES[c];
    const s = fresh(c);
    const rep = G.playNow(s, 9999, T0);
    assert.equal(s.phase, 'offseason', c);
    assert.ok(rep.games >= L.games);
    for (const t of s.teams) assert.equal(t.w + t.l + (t.d || 0), L.games, `${t.name} ${t.w}-${t.l}-${t.d}`);
    assert.equal(s.teams.reduce((a, t) => a + t.w, 0), s.teams.reduce((a, t) => a + t.l, 0));
    const h = s.history.seasons[0];
    assert.ok(h.champion && h.championId >= 0);
    assert.equal(s.offseason.draft.pool.length >= L.draftN, true);
    assert.ok(s.nextGameAt === null);
  }
});

test('포스트시즌 형식: MLB 12팀(WC 3전2선승/DS 5전/CS 7전/WS 7전), KBO 5팀(와일드카드 어드밴티지/준PO 5전/PO 5전/KS 7전)', () => {
  let s = fresh('mlb', 3, 25);
  G.dev.boost(s, 15);
  while (s.phase === 'regular') G.playNow(s, 1, T0);
  assert.equal(s.phase, 'playoffs');
  const po = s.playoff;
  assert.equal(po.rounds[0].length, 4);
  assert.deepEqual(po.rounds[0].map((x) => x.bestOf), [3, 3, 3, 3]);
  assert.equal(po.seeds.AL.length, 6); assert.equal(po.seeds.NL.length, 6);
  const divWinners = [0, 1, 2].map((d) => s.teams.filter((t) => t.div === d).sort((a, b) => b.w - a.w)[0].id);
  for (const id of divWinners) assert.ok(po.seeds.AL.slice(0, 3).includes(id), '지구 우승팀은 1~3번 시드');
  const sizes = [];
  let lastR = -1;
  while (s.phase === 'playoffs') { if (po.round !== lastR) { lastR = po.round; sizes.push(po.rounds[po.round].map((x) => x.bestOf).join(',')); } G.playNow(s, 1, T0); }
  assert.deepEqual(sizes, ['3,3,3,3', '5,5,5,5', '7,7', '7']);
  const ws = po.rounds[3][0];
  assert.ok(ws.a < 15 !== ws.b < 15, '월드시리즈는 AL 대 NL');

  s = fresh('kbo', 3, 0);
  G.dev.boost(s, 15);
  while (s.phase === 'regular') G.playNow(s, 1, T0);
  assert.equal(s.phase, 'playoffs');
  const k = s.playoff;
  assert.equal(k.rounds[0].length, 1);
  assert.deepEqual(k.rounds[0][0].w, [1, 0], '4위 1승 어드밴티지');
  const seq = [];
  let lastK = -1;
  while (s.phase === 'playoffs') { if (k.round !== lastK) { lastK = k.round; seq.push(k.rounds[k.round][0].bestOf); } G.playNow(s, 1, T0); }
  assert.deepEqual(k.rounds.map((r) => r[0].bestOf), [3, 5, 5, 7]);
  assert.ok(seq.length >= 1 && seq[seq.length - 1] === 7, '1위 팀은 한국시리즈 직행');
});

test('시리즈 규칙: 선승 수를 넘기지 않고 홈 경기 순서가 2-3-2 / 2-2-1', () => {
  const s = fresh('mlb', 9);
  while (s.phase !== 'offseason') G.playNow(s, 50, T0);
  const all = s.playoff.rounds.flat();
  assert.deepEqual(s.playoff.rounds.map((r) => r.length), [4, 4, 2, 1]);
  for (const sr of all) {
    assert.ok(sr.w[0] <= sr.need && sr.w[1] <= sr.need);
    assert.ok(sr.win === sr.a || sr.win === sr.b);
    assert.ok(sr.g <= sr.bestOf);
    assert.equal(Math.max(...sr.w), sr.need);
  }
  assert.deepEqual(all.find((x) => x.bestOf === 7).pat, ['a', 'a', 'b', 'b', 'b', 'a', 'a']);
});

test('같은 시드·같은 행동 → 같은 결과 (결정적)', () => {
  const a = fresh('mlb', 5), b = fresh('mlb', 5);
  G.playNow(a, 9999, T0); G.playNow(b, 9999, T0);
  assert.deepEqual(a, b);
});

test('방치 따라잡기: 한 번에 몰아서 해도, 나눠서 해도 결과가 같다', () => {
  const a = fresh('kbo', 6, 2), b = fresh('kbo', 6, 2);
  const iv = G.intervalMs(a);
  G.advance(a, T0 + 40 * iv + 5);
  for (let i = 1; i <= 40; i++) G.advance(b, T0 + i * iv + 5);
  assert.equal(a.sched.idx, b.sched.idx);
  assert.deepEqual(a.teams.map((t) => [t.w, t.l, t.d]), b.teams.map((t) => [t.w, t.l, t.d]));
  assert.equal(a.money, b.money);
});

test('방치: 오래 닫아 두면 한 번에 최대 MAX_CATCHUP 틱만 반영하고 나머지는 건너뛴다', () => {
  const s = fresh('mlb', 4);
  s.settings.autopilot = true;
  const rep = G.advance(s, T0 + 100000 * MIN);
  assert.ok(rep.skipped > 0);
  assert.ok(rep.games <= G.MAX_CATCHUP);
  assert.ok(s.nextGameAt > T0 + 100000 * MIN);
});

test('자동 진행(오토파일럿): 시즌이 끝나면 오프시즌을 어시스턴트가 처리하고 다음 시즌으로', () => {
  const s = fresh('kbo', 8, 4);
  s.settings.autopilot = true;
  const iv = G.intervalMs(s);
  const rep = G.advance(s, T0 + 190 * iv + 1);
  assert.ok(s.season >= 2 || rep.seasons >= 1, `season ${s.season}`);
  assert.ok(['regular', 'playoffs'].includes(s.phase));
});

test('오토파일럿 아님: 오프시즌에서 멈추고 사용자가 시작을 눌러야 한다', () => {
  const s = fresh('kbo', 8, 4);
  s.settings.autopilot = false;
  G.advance(s, T0 + 300 * G.intervalMs(s));
  assert.equal(s.phase, 'offseason');
  assert.equal(s.nextGameAt, null);
  assert.ok(G.startNextSeason(s, T0 + 999, {}));
  assert.equal(s.season, 2);
  assert.equal(s.teams[0].w + s.teams[0].l, 0);
});

test('장기 시뮬레이션 (MLB·KBO 각 8시즌): 로스터 구성·선수 수·능력치 범위가 계속 유효하다', () => {
  for (const c of COUNTRIES) {
    const L = LEAGUES[c];
    const s = fresh(c, 12, 5);
    for (let y = 0; y < 8; y++) {
      G.dev.toOffseason(s);
      assert.equal(s.phase, 'offseason');
      G.startNextSeason(s, T0, { auto: true });
      for (const t of s.teams) {
        assert.ok(t.players.length <= L.active + L.farmMax, `${t.name} ${t.players.length}`);
        assert.equal(t.players.filter((p) => p.act).length <= L.active, true);
        assert.ok(t.players.filter((p) => p.act).length >= L.active - 1, `${t.name} act ${t.players.filter((p) => p.act).length}`);
        assert.ok(t.players.filter((p) => p.pos === 'C').length >= 1);
        assert.ok(t.players.filter((p) => p.pos === 'SP').length >= 5);
        for (const p of t.players) { assert.ok(p.age >= 18 && p.age <= 43, `${p.name} ${p.age}`); assert.ok(p.sal >= L.minSal - 1e-9 && p.sal < 100); assert.ok(p.pot >= G.ovrOf(p)); }
        if (c === 'kbo') { assert.ok(t.players.filter((p) => p.fx === 1).length <= 3); assert.ok(t.players.filter((p) => p.fx === 2).length <= 1); }
      }
    }
    const ovr = s.teams.flatMap((t) => t.players.filter((p) => p.act)).map(G.ovrOf);
    const m = ovr.reduce((a, b) => a + b) / ovr.length;
    assert.ok(m > 46 && m < 64, `${c} 평균 능력 ${m}`);
    const age = s.teams.flatMap((t) => t.players.filter((p) => p.act)).reduce((a, p) => a + p.age, 0) / ovr.length;
    assert.ok(age > 25 && age < 31, `${c} 평균 나이 ${age}`);
  }
});

test('재정: 연봉 총액이 수입을 크게 넘으면 돈이 줄고, 사치세/경쟁균형세가 부과된다', () => {
  let s = fresh('mlb', 5);
  for (const p of G.userTeam(s).players) p.sal = 12;
  assert.ok(G.payroll(G.userTeam(s)) > LEAGUES.mlb.cbt);
  const m0 = s.money;
  G.dev.toOffseason(s);
  assert.ok(s.history.seasons[0].penalty > 0);
  assert.ok(s.money < m0);
  s = fresh('kbo', 5);
  for (const p of G.userTeam(s).players) { p.sal = 5; p.fx = 0; p.svc = 5; }
  assert.ok(G.capPayroll(G.userTeam(s)) > LEAGUES.kbo.cap);
  G.dev.toOffseason(s);
  assert.ok(s.history.seasons[0].penalty > 0);
  assert.equal(G.userTeam(s).over, 1);
});

test('재정: 기본 상태에서 연봉 총액이 예산 범위이고, 한 시즌 손익이 극단적이지 않다', () => {
  for (const c of COUNTRIES) {
    const s = fresh(c, 14, 4);
    const m0 = s.money;
    const t = G.userTeam(s);
    assert.ok(G.payroll(t) > 0.4 * G.budgetOf(s, t) && G.payroll(t) < 1.6 * G.budgetOf(s, t), `${c} payroll ${G.payroll(t)} budget ${G.budgetOf(s, t)}`);
    G.dev.toOffseason(s);
    const rev = G.annualRevenue(s, t);
    assert.ok(Math.abs(s.money - m0) < rev * 0.35, `${c} Δ${s.money - m0} rev ${rev}`);
  }
});

test('방치형 보상: 건너뛰기는 시계를 리셋하고 돈을 반영한다', () => {
  const s = fresh('mlb', 3);
  const rep = G.playNow(s, 10, T0 + 5);
  assert.ok(rep.games >= 9 && rep.games <= 10);
  assert.equal(s.nextGameAt, T0 + 5 + G.intervalMs(s));
  assert.notEqual(rep.money, 0);
});

test('MLB 사치세: 초과 구간별 세율(20/32/62.5/80%)과 연속 초과 가중이 공식 구조와 같다', () => {
  const L = LEAGUES.mlb;
  assert.equal(G.cbtTax(L, 244, 0), 0);
  assert.equal(G.cbtTax(L, 254, 0), 2);            // 10M × 20%
  assert.equal(G.cbtTax(L, 264, 0), 4);            // 20M × 20%
  assert.equal(G.cbtTax(L, 274, 0), 4 + 3.2);      // + 10M × 32%
  assert.equal(G.cbtTax(L, 314, 0), 4 + 6.4 + 12.5 + 0.8 * 10); // 70M over
  assert.ok(G.cbtTax(L, 264, 1) > G.cbtTax(L, 264, 0));
  assert.ok(G.cbtTax(L, 264, 2) > G.cbtTax(L, 264, 1));
  assert.equal(G.cbtTax(L, 264, 5), G.cbtTax(L, 264, 2));
});

test('KBO: 아시아쿼터 선수 연봉은 한도(약 20만 달러) 이내, 드래프트는 11라운드', () => {
  const s = fresh('kbo', 3, 4);
  for (const t of s.teams) for (const p of t.players) if (p.fx === 2) assert.ok(p.sal <= 3.0 + 1e-9, `${p.name} ${p.sal}`);
  for (const p of s.market.foreign.filter((x) => x.fx === 2)) assert.ok(G.askSalary(s, p) <= 3.0 + 1e-9);
  G.dev.toOffseason(s);
  assert.equal(s.offseason.draft.order.length, 11 * 10);
});

test('여러 시드 × 여러 시즌 퍼징: 선수단 불변식이 한 번도 깨지지 않는다', () => {
  for (const c of COUNTRIES) {
    const L = LEAGUES[c];
    for (const seed of [101, 202, 303, 404]) {
      const s = fresh(c, seed, seed % L.teams.length);
      for (let y = 0; y < 5; y++) {
        G.dev.toOffseason(s);
        G.startNextSeason(s, T0, { auto: y % 2 === 0 });
        const ids = new Set();
        for (const t of s.teams) {
          const where = `${c} seed ${seed} y${y} ${t.name}`;
          assert.ok(t.players.length <= G.rosterMax(s) && t.players.length >= G.rosterMin(s), `${where} size ${t.players.length}`);
          assert.ok(t.players.filter((p) => p.act).length >= L.active - 1 && t.players.filter((p) => p.act).length <= L.active, `${where} act`);
          assert.ok(t.players.filter((p) => p.pos === 'C').length >= 1, `${where} 포수`);
          assert.ok(t.players.filter((p) => p.pos === 'SP').length >= 5, `${where} 선발`);
          assert.ok(t.players.filter((p) => p.act && p.pos === 'SP').length >= 4, `${where} 1군 선발`);
          if (c === 'kbo') { assert.ok(t.players.filter((p) => p.fx === 1).length <= 3); assert.ok(t.players.filter((p) => p.fx === 2).length <= 1); }
          for (const p of t.players) { assert.ok(!ids.has(p.id), `${where} 중복 id ${p.id}`); ids.add(p.id); assert.ok(Number.isFinite(p.sal) && Number.isFinite(p.pot) && p.pot >= G.ovrOf(p)); }
        }
        for (const p of [...s.market.free, ...s.market.foreign]) assert.ok(!ids.has(p.id), 'FA 풀의 선수가 팀에도 있음');
        assert.ok(Number.isFinite(s.money));
      }
    }
  }
});
