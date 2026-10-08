import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createLeague, ovrOf, teamOvr } from '../src/league.js';
import { simulateGame } from '../src/sim.js';

const league = (seed = 7) => createLeague(createRng(seed)).teams;
const clone = (x) => JSON.parse(JSON.stringify(x));

test('팀 구성: 타자 9 + 선발 5 + 구원 3, 포지션이 겹치지 않는다', () => {
  for (const t of league()) {
    assert.equal(t.players.length, 17);
    assert.equal(t.players.filter((p) => p.role === 'H').length, 9);
    assert.equal(t.players.filter((p) => p.role === 'SP').length, 5);
    assert.equal(t.players.filter((p) => p.role === 'RP').length, 3);
    const pos = t.players.filter((p) => p.role === 'H').map((p) => p.pos);
    assert.equal(new Set(pos).size, 9);
  }
});

test('선수 능력치는 25~99 범위이고 모든 능력치가 잠재력 이하', () => {
  for (const t of league(3)) {
    for (const p of t.players) {
      const keys = p.role === 'H' ? ['con', 'pow', 'eye', 'spd', 'def'] : ['stf', 'ctl', 'sta'];
      for (const k of keys) {
        assert.ok(p[k] >= 25 && p[k] <= 99, `${p.name} ${k}=${p[k]}`);
        assert.ok(p[k] <= p.pot, `${p.name} ${k} > pot`);
      }
      assert.ok(ovrOf(p) >= 25 && ovrOf(p) <= 99);
    }
  }
});

test('같은 시드 -> 같은 경기 결과', () => {
  const [a, b] = league();
  const r1 = simulateGame(clone(a), clone(b), createRng(11), { log: true });
  const r2 = simulateGame(clone(a), clone(b), createRng(11), { log: true });
  assert.deepEqual(r1, r2);
});

test('경기 불변식: 무승부 없음, 이닝 합 = 점수, 승자 = 더 많이 득점', () => {
  const [a, b] = league();
  const rng = createRng(2024);
  for (let i = 0; i < 500; i++) {
    const [home, away] = i % 2 ? [a, b] : [b, a];
    const r = simulateGame(home, away, rng, { stats: false, log: true });
    assert.notEqual(r.hs, r.as);
    const sum = (arr) => arr.reduce((x, y) => x + (y || 0), 0);
    assert.equal(sum(r.line.home), r.hs);
    assert.equal(sum(r.line.away), r.as);
    assert.equal(r.winnerId, r.hs > r.as ? home.id : away.id);
    assert.ok(r.innings >= 9 && r.innings <= 15);
    assert.equal(r.line.away.length, r.innings);
    assert.equal(r.line.home.length, r.innings);
    // 9회초 후 홈이 앞서면 말 공격 생략(null)
    if (r.line.home[r.innings - 1] === null) assert.ok(r.hs > r.as && r.innings >= 9);
    assert.ok(r.hits.home >= 0 && r.hits.away >= 0);
    // 플레이 로그의 마지막 점수 = 최종 점수 (연장 15회 강제 종료 제외)
    const last = r.plays[r.plays.length - 1];
    if (r.innings < 15) assert.deepEqual(last.score, [r.as, r.hs]);
  }
});

test('끝내기: 홈이 앞선 순간 경기가 끝난다', () => {
  const [a, b] = league();
  const rng = createRng(77);
  let found = 0;
  for (let i = 0; i < 1500 && found < 3; i++) {
    const r = simulateGame(a, b, rng, { stats: false, log: true });
    if (r.walkoff) {
      found++;
      assert.ok(r.hs > r.as);
      const last = r.plays[r.plays.length - 1];
      assert.equal(last.half, 1);
      assert.ok(last.runs > 0);
    }
  }
  assert.ok(found > 0, '1500경기에서 끝내기가 한 번도 안 나옴');
});

test('개인 기록 합계가 팀 기록과 일치한다 (안타, 삼진, 타점<=득점)', () => {
  const [a, b] = league();
  const A = clone(a), B = clone(b);
  const rng = createRng(31);
  let hits = 0, runs = 0;
  for (let i = 0; i < 40; i++) {
    const r = simulateGame(A, B, rng);
    hits += r.hits.home + r.hits.away;
    runs += r.hs + r.as;
    A.rot++; B.rot++;
  }
  const bats = [...A.players, ...B.players].filter((p) => p.role === 'H' && p.s);
  const pits = [...A.players, ...B.players].filter((p) => p.role !== 'H' && p.s);
  assert.equal(bats.reduce((x, p) => x + p.s.h, 0), hits);
  assert.equal(bats.reduce((x, p) => x + p.s.k, 0), pits.reduce((x, p) => x + p.s.k, 0));
  assert.equal(bats.reduce((x, p) => x + p.s.r, 0), runs);
  assert.ok(bats.reduce((x, p) => x + p.s.rbi, 0) <= runs);
  assert.equal(pits.reduce((x, p) => x + p.s.er, 0), runs);
  // 모든 경기에서 승 1, 패 1
  assert.equal(pits.reduce((x, p) => x + p.s.w, 0), 40);
  assert.equal(pits.reduce((x, p) => x + p.s.l, 0), 40);
  for (const p of bats) assert.ok(p.s.ab <= p.s.pa && p.s.h <= p.s.ab && p.s.hr <= p.s.h);
});

test('선발은 5인 로테이션으로 돌고, 구원이 등판한다', () => {
  const [a, b] = league();
  const A = clone(a), B = clone(b);
  const rng = createRng(5);
  const starters = new Set();
  let usedRelief = 0;
  for (let i = 0; i < 20; i++) {
    const r = simulateGame(A, B, rng, { stats: false });
    starters.add(r.sp.home);
    A.rot++; B.rot++;
  }
  assert.equal(starters.size, 5);
  for (let i = 0; i < 20; i++) {
    simulateGame(A, B, rng);
    A.rot++; B.rot++;
  }
  usedRelief = A.players.filter((p) => p.role === 'RP' && p.s && p.s.g > 0).length;
  assert.ok(usedRelief >= 1);
});

test('밸런스: 비슷한 두 팀의 팀당 득점은 현실 범위, 홈 어드밴티지는 없음', () => {
  const rng = createRng(99);
  const teams = createLeague(rng).teams;
  const [a, b] = [teams[1], teams[2]];
  let runs = 0, games = 0, aWins = 0;
  for (let i = 0; i < 3000; i++) {
    const r = simulateGame(a, b, rng, { stats: false });
    runs += r.hs + r.as;
    games += 2;
    if (r.winnerId === a.id) aWins++;
  }
  const rpg = runs / games;
  assert.ok(rpg > 3.6 && rpg < 5.6, `팀당 득점 ${rpg.toFixed(2)}`);
  assert.ok(aWins > 600 && aWins < 2400);
});

test('밸런스: 더 강한 팀이 더 자주 이기지만 약팀도 이길 수 있다', () => {
  const rng = createRng(4);
  const teams = createLeague(rng).teams;
  const base = JSON.parse(JSON.stringify(teams[1]));
  const strong = JSON.parse(JSON.stringify(base));
  strong.id = 99;
  for (const p of strong.players) for (const k of p.role === 'H' ? ['con', 'pow', 'eye', 'spd', 'def'] : ['stf', 'ctl', 'sta']) p[k] = Math.min(99, p[k] + 10);
  assert.ok(teamOvr(strong).total > teamOvr(base).total + 8);
  let wins = 0;
  const n = 2000;
  for (let i = 0; i < n; i++) {
    const r = i % 2 ? simulateGame(strong, base, rng, { stats: false }) : simulateGame(base, strong, rng, { stats: false });
    if (r.winnerId === 99) wins++;
  }
  const rate = wins / n;
  assert.ok(rate > 0.6 && rate < 0.85, `+10 팀 승률 ${rate.toFixed(3)}`);
});
