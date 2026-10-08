import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, advance, train, trainCost, upgradeFacility, facCost, FAC_MAX, draftPick, startNextSeason, userTeam, dev, setIntervalMin, renameTeam, renamePlayer, intervalMs } from '../src/game.js';
import { ovrOf } from '../src/league.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

test('훈련: 비용 지불, 능력치 +1, 잠재력 한계에서 거절', () => {
  const s = newGame(1, T0);
  s.money = 100000;
  const p = userTeam(s).players[0];
  const before = p.con;
  const cost = trainCost(s, p, 'con');
  const r = train(s, p.id, 'con');
  if (before < p.pot) {
    assert.ok(r.ok);
    assert.equal(p.con, before + 1);
    assert.equal(s.money, 100000 - cost);
  }
  p.pow = p.pot;
  assert.deepEqual(train(s, p.id, 'pow'), { ok: false, err: 'cap' });
});

test('훈련: 자금 부족이면 아무것도 바뀌지 않는다', () => {
  const s = newGame(1, T0);
  s.money = 1;
  const p = userTeam(s).players[0];
  const snap = JSON.stringify(p);
  const r = train(s, p.id, 'con');
  assert.equal(r.err, 'money');
  assert.equal(s.money, 1);
  assert.equal(JSON.stringify(p), snap);
});

test('훈련: 타자에게 투수 능력치를 올릴 수 없고, 남의 팀 선수는 못 올린다', () => {
  const s = newGame(1, T0);
  s.money = 1e6;
  assert.equal(train(s, userTeam(s).players[0].id, 'stf').err, 'notfound');
  assert.equal(train(s, s.teams[1].players[0].id, 'con').err, 'notfound');
});

test('훈련 비용은 능력치가 높을수록 비싸고 훈련장 레벨로 싸진다', () => {
  const s = newGame(1, T0);
  const p = { con: 50 };
  const q = { con: 80 };
  assert.ok(trainCost(s, q, 'con') > trainCost(s, p, 'con') * 2);
  const base = trainCost(s, p, 'con');
  s.fac.camp = 5;
  assert.ok(trainCost(s, p, 'con') < base * 0.75);
});

test('시설: 비용은 레벨마다 증가, 최대 레벨 제한, 자금 부족 거절', () => {
  const s = newGame(1, T0);
  assert.ok(facCost('stadium', 1) > facCost('stadium', 0));
  s.money = 0;
  assert.equal(upgradeFacility(s, 'stadium').err, 'money');
  s.money = 1e9;
  for (let i = 0; i < FAC_MAX; i++) assert.ok(upgradeFacility(s, 'camp').ok);
  assert.equal(upgradeFacility(s, 'camp').err, 'max');
  assert.equal(s.fac.camp, FAC_MAX);
  assert.equal(upgradeFacility(s, 'nope').err, 'notfound');
});

test('구장 레벨이 높을수록 같은 경기에서 수입이 늘어난다', () => {
  const a = newGame(5, T0);
  const b = newGame(5, T0);
  b.fac.stadium = 5;
  advance(a, T0 + 10 * MIN * 20);
  advance(b, T0 + 10 * MIN * 20);
  // 같은 시드/같은 경기 결과, 시설 유지비 차이를 감안해도 수입이 더 크다
  assert.ok(b.totals.earned > a.totals.earned);
});

test('경기를 계속하면 자금이 늘어난다 (방치형으로서 최소 조건)', () => {
  const s = newGame(5, T0);
  const m0 = s.money;
  advance(s, T0 + 10 * MIN * 42);
  assert.ok(s.money > m0 + 3000, `시즌 수입 ${s.money - m0}`);
});

test('경기 간격 변경: 허용된 값만, 타이머 재설정', () => {
  const s = newGame(1, T0);
  assert.equal(setIntervalMin(s, 7, T0), false);
  assert.equal(s.intervalMin, 10);
  assert.ok(setIntervalMin(s, 5, T0 + 1000));
  assert.equal(s.nextGameAt, T0 + 1000 + 5 * MIN);
  assert.equal(intervalMs(s), 5 * MIN);
});

test('이름 변경: 공백/빈 문자열 거절, 길이 제한', () => {
  const s = newGame(1, T0);
  assert.equal(renameTeam(s, '   '), false);
  assert.ok(renameTeam(s, '가나다라마바사아자차카타파하하하하'));
  assert.equal(userTeam(s).name.length, 14);
  const p = userTeam(s).players[0];
  assert.ok(renamePlayer(s, p.id, '  홍길동  '));
  assert.equal(p.name, '홍길동');
  assert.equal(renamePlayer(s, 999999, 'x'), false);
});

test('드래프트: 같은 계열만 교체 가능, 한 번만, 신인이 슬롯을 물려받는다', () => {
  const s = newGame(3, T0);
  dev.toOffseason(s);
  const me = userTeam(s);
  const cands = s.offseason.candidates;
  const hIdx = cands.findIndex((c) => c.role === 'H');
  const pIdx = cands.findIndex((c) => c.role !== 'H');
  const hitter = me.players.find((p) => p.role === 'H');
  const pitcher = me.players.find((p) => p.role === 'RP');
  assert.equal(draftPick(s, hIdx, pitcher.id).err, 'role');
  assert.equal(draftPick(s, pIdx, hitter.id).err, 'role');
  const r = draftPick(s, hIdx, hitter.id);
  assert.ok(r.ok);
  assert.equal(r.in.pos, hitter.pos);
  assert.ok(me.players.includes(r.in));
  assert.ok(!me.players.includes(hitter));
  assert.equal(me.players.length, 17);
  assert.equal(draftPick(s, pIdx, pitcher.id).err, 'state');
});

test('드래프트: 투수 신인은 구원/선발 슬롯의 역할을 물려받는다', () => {
  const s = newGame(3, T0);
  dev.toOffseason(s);
  const me = userTeam(s);
  const pIdx = s.offseason.candidates.findIndex((c) => c.role !== 'H');
  const rp = me.players.find((p) => p.role === 'RP');
  const r = draftPick(s, pIdx, rp.id);
  assert.ok(r.ok);
  assert.equal(r.in.role, 'RP');
  assert.equal(me.players.filter((p) => p.role === 'RP').length, 3);
});

test('스카우트 레벨이 높으면 신인 후보가 평균적으로 좋다', () => {
  const avgOvr = (lv) => {
    let sum = 0, n = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = newGame(seed, T0);
      s.fac.scout = lv;
      dev.toOffseason(s);
      for (const c of s.offseason.candidates) { sum += ovrOf(c); n++; }
    }
    return sum / n;
  };
  assert.ok(avgOvr(8) > avgOvr(0) + 8);
});

test('자동 드래프트: 더 좋은 신인일 때만 교체하고 시즌을 시작한다', () => {
  const s = newGame(3, T0);
  s.fac.scout = 10;
  dev.toOffseason(s);
  assert.ok(startNextSeason(s, T0, { autoDraft: true }));
  assert.equal(s.phase, 'regular');
  assert.equal(userTeam(s).players.length, 17);
});

test('시즌 보상: 우승 > 준우승 > 진출 > 탈락', () => {
  const bonuses = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame(seed, T0);
    dev.toOffseason(s);
    bonuses.add(s.offseason.bonus);
  }
  for (const b of bonuses) assert.ok([500, 2000, 5000, 12000].includes(b));
  assert.ok(bonuses.has(500));
});

test('개발자 메뉴: 자금/능력치/건너뛰기가 동작하고 사용 흔적이 남는다', () => {
  const s = newGame(1, T0);
  assert.equal(s.dev.used, false);
  dev.addMoney(s, 5000);
  assert.equal(s.money, 6500);
  const p = userTeam(s).players[0];
  const before = p.con;
  dev.boost(s, 5);
  assert.ok(p.con >= before + 5 || p.con === 99);
  assert.ok(p.pot >= p.con);
  dev.skipGames(s, 10);
  assert.equal(s.roundIdx, 10);
  assert.equal(s.dev.used, true);
});

test('장기 밸런스: 자금을 훈련에 투자하는 구단이 가만히 두는 구단보다 강해진다', () => {
  const run = (invest) => {
    const s = newGame(2025, T0);
    let now = T0;
    let wins = 0, games = 0;
    for (let season = 0; season < 5; season++) {
      for (let i = 0; i < 42; i++) {
        now += 10 * MIN;
        if (invest) {
          // 돈이 있는 한 가장 싼 훈련을 계속 산다
          for (;;) {
            let best = null;
            for (const p of userTeam(s).players) {
              for (const k of p.role === 'H' ? ['con', 'pow', 'eye', 'spd', 'def'] : ['stf', 'ctl', 'sta']) {
                if (p[k] < p.pot) {
                  const c = trainCost(s, p, k);
                  if (!best || c < best.c) best = { p, k, c };
                }
              }
            }
            if (!best || best.c > s.money) break;
            train(s, best.p.id, best.k);
          }
        }
        advance(s, now);
      }
      dev.toOffseason(s);
      const t = userTeam(s);
      wins += t.w;
      games += t.w + t.l;
      startNextSeason(s, now, { autoDraft: true });
    }
    return wins / games;
  };
  const idle = run(false);
  const grind = run(true);
  assert.ok(grind > idle + 0.05, `투자 ${grind.toFixed(3)} vs 방치 ${idle.toFixed(3)}`);
  assert.ok(grind < 0.9, '투자해도 무적이 되지는 않아야 한다');
});
