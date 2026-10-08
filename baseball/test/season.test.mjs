import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { makeSchedule } from '../src/league.js';
import { newGame, advance, standings, startNextSeason, intervalMs, MAX_CATCHUP, userTeam, dev, USER_ID } from '../src/game.js';

const T0 = 1_700_000_000_000;
const MIN = 60_000;
const clone = (x) => JSON.parse(JSON.stringify(x));

test('일정: 8팀 더블 라운드로빈 x3 = 팀당 42경기, 상대·홈원정이 균등', () => {
  const ids = [0, 1, 2, 3, 4, 5, 6, 7];
  const sch = makeSchedule(ids);
  assert.equal(sch.length, 42);
  const games = new Map(ids.map((i) => [i, 0]));
  const home = new Map(ids.map((i) => [i, 0]));
  const pair = new Map();
  for (const round of sch) {
    const seen = new Set();
    for (const { h, a } of round) {
      assert.notEqual(h, a);
      assert.ok(!seen.has(h) && !seen.has(a), '한 라운드에 같은 팀이 두 번');
      seen.add(h); seen.add(a);
      games.set(h, games.get(h) + 1);
      games.set(a, games.get(a) + 1);
      home.set(h, home.get(h) + 1);
      const k = [h, a].sort().join('-');
      pair.set(k, (pair.get(k) || 0) + 1);
    }
    assert.equal(seen.size, 8);
  }
  for (const i of ids) {
    assert.equal(games.get(i), 42);
    assert.equal(home.get(i), 21);
  }
  assert.equal(pair.size, 28);
  for (const v of pair.values()) assert.equal(v, 6);
});

test('새 게임: 첫 경기는 간격 후, 시작 자금과 구성', () => {
  const s = newGame(1, T0);
  assert.equal(s.phase, 'regular');
  assert.equal(s.nextGameAt, T0 + 10 * MIN);
  assert.equal(s.teams.length, 8);
  assert.equal(userTeam(s).id, USER_ID);
  assert.ok(s.money > 0);
});

test('시간이 안 지났으면 아무 일도 없다', () => {
  const s = newGame(1, T0);
  const before = JSON.stringify(s);
  const rep = advance(s, T0 + 5 * MIN);
  assert.equal(rep.games, 0);
  assert.equal(JSON.stringify({ ...s, lastSeen: 0 }), JSON.stringify({ ...JSON.parse(before), lastSeen: 0 }));
});

test('간격마다 정확히 한 경기: 10분 -> 1경기, 35분 -> 3경기', () => {
  const s = newGame(1, T0);
  assert.equal(advance(s, T0 + 10 * MIN).games, 1);
  assert.equal(advance(s, T0 + 35 * MIN).games, 2); // 20분, 30분 시점
  assert.equal(s.roundIdx, 3);
  assert.equal(s.nextGameAt, T0 + 40 * MIN);
  assert.equal(userTeam(s).w + userTeam(s).l, 3);
});

test('오프라인 몰아서 진행 = 조금씩 진행 (결정적)', () => {
  const a = newGame(555, T0);
  const b = newGame(555, T0);
  advance(a, T0 + 600 * MIN);
  for (let t = 1; t <= 600; t++) advance(b, T0 + t * MIN);
  a.lastSeen = b.lastSeen = 0;
  assert.deepEqual(a, b);
  assert.ok(a.roundIdx > 0);
});

test('아주 오래 비워도 한 번에 MAX_CATCHUP 경기까지만 반영하고 타이머를 다시 맞춘다', () => {
  const s = newGame(2, T0);
  const now = T0 + 24 * 3600 * 1000 * 30; // 30일
  const rep = advance(s, now);
  assert.ok(rep.games <= MAX_CATCHUP);
  assert.ok(rep.games > 0);
  if (s.phase !== 'offseason') {
    assert.equal(s.nextGameAt, now + intervalMs(s));
    assert.ok(rep.skipped > 0);
  }
});

test('시계가 뒤로 가면(날짜 수동 변경) 경기가 무한히 밀리지 않는다', () => {
  const s = newGame(3, T0);
  advance(s, T0 + 10 * MIN);
  const back = T0 - 24 * 3600 * 1000;
  advance(s, back);
  assert.ok(s.nextGameAt <= back + intervalMs(s) + 1);
});

test('한 시즌 전체: 42경기, 승패 합 일치, 포스트시즌 후 오프시즌', () => {
  const s = newGame(10, T0);
  advance(s, T0 + 10 * MIN * 42);
  assert.ok(['playoffs', 'offseason'].includes(s.phase));
  for (const t of s.teams) assert.equal(t.w + t.l, 42);
  const W = s.teams.reduce((x, t) => x + t.w, 0);
  const L = s.teams.reduce((x, t) => x + t.l, 0);
  assert.equal(W, L);
  assert.equal(W, 8 * 42 / 2);
  advance(s, T0 + 10 * MIN * 60);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.nextGameAt, null);
  assert.equal(s.history.champions.length, 1);
  assert.ok(s.history.champions[0].name);
  assert.equal(s.offseason.candidates.length, 3);
  // 오프시즌에는 시간이 흘러도 경기가 진행되지 않는다
  const snap = JSON.stringify(s.teams);
  advance(s, T0 + 10 * MIN * 500);
  assert.equal(JSON.stringify(s.teams), snap);
});

test('내 경기가 하루치 기록에 남고 최근 30경기로 제한된다', () => {
  const s = newGame(10, T0);
  advance(s, T0 + 10 * MIN * 100);
  assert.ok(s.history.games.length <= 30);
  assert.ok(s.history.games.length > 0);
  const g = s.history.games[0];
  assert.ok(g.line && g.key !== undefined && typeof g.won === 'boolean');
  assert.ok(s.latest.plays.length > 20);
});

test('다음 시즌: 나이+1, 기록 초기화, 새 일정, 간격 타이머 재설정', () => {
  const s = newGame(21, T0);
  dev.toOffseason(s);
  const ages = userTeam(s).players.map((p) => p.age);
  assert.equal(s.phase, 'offseason');
  const now = T0 + 5 * 3600 * 1000;
  assert.ok(startNextSeason(s, now));
  assert.equal(s.season, 2);
  assert.equal(s.phase, 'regular');
  assert.equal(s.roundIdx, 0);
  assert.equal(s.nextGameAt, now + 10 * MIN);
  for (const t of s.teams) assert.deepEqual([t.w, t.l, t.rs, t.ra], [0, 0, 0, 0]);
  userTeam(s).players.forEach((p, i) => {
    assert.ok(p.age === ages[i] + 1 || p.age <= 22, '은퇴 교체 선수는 신인');
    assert.equal(p.s, null);
  });
  assert.equal(userTeam(s).players.length, 17);
  // 시즌 중에는 다시 호출해도 아무 일 없음
  assert.equal(startNextSeason(s, now), false);
});

test('여러 시즌을 돌려도 상태가 망가지지 않는다 (10시즌)', () => {
  const s = newGame(8, T0);
  let now = T0;
  for (let i = 0; i < 10; i++) {
    dev.toOffseason(s);
    assert.equal(s.history.champions[0].season, i + 1);
    now += 3600_000;
    startNextSeason(s, now, { autoDraft: true });
    for (const t of s.teams) {
      assert.equal(t.players.length, 17);
      assert.equal(t.players.filter((p) => p.role === 'H').length, 9);
      for (const p of t.players) assert.ok(p.age >= 18 && p.age <= 38, `${p.age}`);
    }
  }
  assert.equal(s.season, 11);
  const names = s.teams.flatMap((t) => t.players.map((p) => p.id));
  assert.equal(new Set(names).size, names.length, '선수 id 중복');
});

test('순위: 승 -> 득실차 순으로 정렬, 게임차 계산', () => {
  const s = newGame(1, T0);
  s.teams.forEach((t, i) => { t.w = i; t.l = 10 - i; t.rs = 10; t.ra = 10; });
  const st = standings(s);
  assert.equal(st[0].id, 7);
  assert.equal(st[0].gb, 0);
  assert.equal(st[1].gb, 1);
  s.teams[3].w = s.teams[4].w = 5;
  s.teams[3].l = s.teams[4].l = 5;
  s.teams[4].rs = 30;
  const st2 = standings(s);
  assert.ok(st2.findIndex((r) => r.id === 4) < st2.findIndex((r) => r.id === 3));
});

test('포스트시즌: 내 팀이 못 올라가도 같은 틱에 끝까지 진행된다', () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = newGame(seed, T0);
    advance(s, T0 + 10 * MIN * 42);
    if (s.phase === 'offseason') {
      assert.ok(!s.playoff.seeds.includes(USER_ID));
      return;
    }
  }
  assert.fail('시드 40개 중 내 팀이 탈락한 경우가 없음');
});

test('경기 간격 배속(개발자 메뉴)이 적용된다', () => {
  const s = newGame(1, T0);
  dev.setScale(s, 600, T0);
  assert.equal(intervalMs(s), 1000);
  const rep = advance(s, T0 + 10_000);
  assert.equal(rep.games, 10);
  assert.ok(s.dev.used);
});

test('입력 상태를 JSON으로 직렬화했다가 복원해도 같은 결과', () => {
  const s = newGame(77, T0);
  advance(s, T0 + 30 * MIN);
  const restored = clone(s);
  advance(s, T0 + 200 * MIN);
  advance(restored, T0 + 200 * MIN);
  assert.deepEqual(s, restored);
});
