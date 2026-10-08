import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createLeague, makeSchedule } from '../src/league.js';
import { LEAGUES, COUNTRIES } from '../src/data.js';
import { counts } from '../src/roster.js';
import { ovrOf, isHit } from '../src/player.js';

test('리그 구조: MLB 30팀(6개 지구×5팀), KBO 10팀, 이름 중복 없음', () => {
  assert.equal(LEAGUES.mlb.teams.length, 30);
  assert.equal(LEAGUES.kbo.teams.length, 10);
  for (let d = 0; d < 6; d++) assert.equal(LEAGUES.mlb.teams.filter((t) => t.div === d).length, 5);
  for (const c of COUNTRIES) assert.equal(new Set(LEAGUES[c].teams.map((t) => t.name)).size, LEAGUES[c].teams.length);
});

test('로스터: 1군 엔트리 수(MLB 26 / KBO 29), 2군, 포수·선발 구성', () => {
  for (const c of COUNTRIES) {
    const L = LEAGUES[c];
    const { teams } = createLeague(createRng(3), c);
    for (const t of teams) {
      assert.equal(t.players.length, L.active + L.farmMax);
      const act = t.players.filter((p) => p.act);
      assert.equal(act.length, L.active, `${t.name} 1군 ${act.length}`);
      const k = counts({ players: t.players.map((p) => ({ ...p, act: 1 })) });
      assert.ok(t.players.filter((p) => p.pos === 'C').length >= 2);
      assert.ok(act.filter((p) => p.pos === 'SP').length >= 5 || t.players.filter((p) => p.pos === 'SP').length >= 5);
      assert.ok(k.H >= L.nH);
      assert.equal(new Set(t.players.map((p) => p.id)).size, t.players.length);
    }
    assert.equal(new Set(teams.flatMap((t) => t.players.map((p) => p.id))).size, teams.reduce((a, t) => a + t.players.length, 0));
  }
});

test('KBO: 외국인 선수 3명 + 아시아쿼터 1명 구성', () => {
  const { teams } = createLeague(createRng(4), 'kbo');
  for (const t of teams) {
    assert.equal(t.players.filter((p) => p.fx === 1).length, 3, t.name);
    assert.equal(t.players.filter((p) => p.fx === 2).length, 1, t.name);
  }
  const mlb = createLeague(createRng(4), 'mlb');
  assert.ok(mlb.teams.every((t) => t.players.every((p) => !p.fx)));
});

test('선수 값: 능력치 범위, 포텐셜 ≥ 현재, 나이 범위, 연봉 ≥ 최저연봉', () => {
  for (const c of COUNTRIES) {
    const L = LEAGUES[c];
    const { teams } = createLeague(createRng(8), c);
    for (const p of teams.flatMap((t) => t.players)) {
      for (const k of isHit(p) ? ['con', 'pow', 'eye', 'spd', 'fld'] : ['stf', 'ctl', 'sta']) assert.ok(p[k] >= 20 && p[k] <= 99);
      assert.ok(p.pot >= ovrOf(p) && p.pot <= 99);
      assert.ok(p.age >= 18 && p.age <= 41);
      assert.ok(p.sal >= L.minSal - 1e-9, `${p.name} ${p.sal}`);
      assert.ok(p.yrs >= 1);
    }
  }
});

test('일정: 팀당 MLB 162경기/KBO 144경기, 상대별 경기 수 규칙, 하루 한 경기 이하', () => {
  for (const c of COUNTRIES) {
    const L = LEAGUES[c];
    const rounds = makeSchedule(L, createRng(5));
    const g = new Array(L.teams.length).fill(0);
    const vs = L.teams.map(() => new Array(L.teams.length).fill(0));
    const home = new Array(L.teams.length).fill(0);
    for (const r of rounds) {
      const seen = new Set();
      for (const [h, a] of r) { assert.ok(!seen.has(h) && !seen.has(a), '같은 날 두 경기'); seen.add(h); seen.add(a); g[h]++; g[a]++; vs[h][a]++; vs[a][h]++; home[h]++; }
    }
    for (const n of g) assert.equal(n, L.games);
    for (const h of home) assert.ok(Math.abs(h - L.games / 2) <= 6, `홈 ${h}`);
    if (c === 'kbo') for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) if (i !== j) assert.equal(vs[i][j], 16);
    if (c === 'mlb') {
      for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) {
        if (i === j) continue;
        const sameDiv = Math.floor(i / 5) === Math.floor(j / 5), sameLg = (i < 15) === (j < 15);
        if (sameDiv) assert.equal(vs[i][j], 13); else if (sameLg) assert.equal(vs[i][j], 9); else assert.ok(vs[i][j] === 1 || vs[i][j] === 2);
        assert.equal(vs[i][j], vs[j][i]);
      }
      for (let i = 0; i < 30; i++) assert.equal(vs[i].reduce((a, b) => a + b), 162);
    }
    assert.ok(rounds.length <= L.games + 12, `${c} 라운드 ${rounds.length}`);
  }
});

test('같은 시드면 같은 일정, 다른 시드면 다른 일정', () => {
  const a = makeSchedule(LEAGUES.mlb, createRng(1)), b = makeSchedule(LEAGUES.mlb, createRng(1)), c = makeSchedule(LEAGUES.mlb, createRng(2));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

test('시작 전력: 강팀 후보가 약팀 후보보다 평균 능력이 높다', () => {
  const { teams } = createLeague(createRng(10), 'mlb');
  const m = (i) => teams[i].players.filter((p) => p.act).reduce((a, p) => a + ovrOf(p), 0) / 26;
  assert.ok(m(25) > m(29) + 2, `LAD ${m(25)} COL ${m(29)}`);
});
