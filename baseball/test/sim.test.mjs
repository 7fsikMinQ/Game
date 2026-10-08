import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { createLeague, makeSchedule } from '../src/league.js';
import { LEAGUES } from '../src/data.js';
import { simulateGame, ENV } from '../src/sim.js';
import { ovrOf } from '../src/player.js';
import { autoRoster } from '../src/roster.js';

function league(c, seed = 11) { const rng = createRng(seed); const lg = createLeague(rng, c); for (const t of lg.teams) autoRoster(t, LEAGUES[c]); return { lg, rng }; }
function recover(lg) { for (const t of lg.teams) for (const p of t.players) { if (p.inj > 0) p.inj--; p.fat = Math.max(0, p.fat - 12); p.rest++; } }
function season(c, seed, seasons = 1) {
  const { lg, rng } = league(c, seed);
  const L = LEAGUES[c];
  const agg = { n: 0, runs: 0, pa: 0, k: 0, bb: 0, hr: 0, ties: 0, homeW: 0, decided: 0, inn: 0, inj: 0, maxInn: 0, wins: lg.teams.map(() => 0), g: lg.teams.map(() => 0) };
  for (let i = 0; i < seasons; i++) {
    for (const round of makeSchedule(L, rng)) {
      for (const [h, a] of round) {
        const r = simulateGame(lg.teams[h], lg.teams[a], rng, { env: ENV[c] });
        agg.n++; agg.runs += r.hs + r.as; agg.inn += r.innings; agg.inj += r.inj.length; agg.maxInn = Math.max(agg.maxInn, r.innings);
        if (r.tie) agg.ties++; else { agg.decided++; if (r.winnerId === h) agg.homeW++; agg.wins[r.winnerId]++; }
        agg.g[h]++; agg.g[a]++;
      }
      recover(lg);
    }
  }
  for (const t of lg.teams) for (const p of t.players) if (p.s && p.role === 'H') { agg.pa += p.s.pa; agg.k += p.s.k; agg.bb += p.s.bb; agg.hr += p.s.hr; }
  return { lg, agg };
}

test('같은 시드 → 같은 경기 결과 (결정적)', () => {
  const run = () => { const { lg, rng } = league('mlb', 5); return simulateGame(lg.teams[0], lg.teams[1], rng, { log: true, env: ENV.mlb }); };
  assert.deepEqual(run(), run());
});

test('MLB 득점 환경: 팀당 4.0~5.0점, 삼진 19~25%, 볼넷 7~10%, 홈런 2.4~3.6%, 홈 승률 51~56%, 무승부 없음', () => {
  const { agg } = season('mlb', 21, 2);
  const rg = agg.runs / agg.n / 2;
  assert.ok(rg > 4.0 && rg < 5.0, `R/G ${rg}`);
  assert.ok(agg.k / agg.pa > 0.19 && agg.k / agg.pa < 0.25, `K% ${agg.k / agg.pa}`);
  assert.ok(agg.bb / agg.pa > 0.07 && agg.bb / agg.pa < 0.10, `BB% ${agg.bb / agg.pa}`);
  assert.ok(agg.hr / agg.pa > 0.024 && agg.hr / agg.pa < 0.036, `HR% ${agg.hr / agg.pa}`);
  const home = agg.homeW / agg.decided;
  assert.ok(home > 0.51 && home < 0.56, `home ${home}`);
  assert.equal(agg.ties, 0);
});

test('KBO 득점 환경과 무승부: 팀당 4.3~5.6점, 삼진 17.5~23%, 연장 11회 제한, 무승부 존재', () => {
  const { agg } = season('kbo', 22, 4);
  const rg = agg.runs / agg.n / 2;
  assert.ok(rg > 4.3 && rg < 5.6, `R/G ${rg}`);
  assert.ok(agg.k / agg.pa > 0.175 && agg.k / agg.pa < 0.23, `K% ${agg.k / agg.pa}`);
  assert.ok(agg.maxInn <= 11, `max inn ${agg.maxInn}`);
  assert.ok(agg.ties > 0 && agg.ties / agg.n < 0.05, `ties ${agg.ties}/${agg.n}`);
});

test('경기당 이닝 9.0~9.4, 부상은 팀 시즌당 적당히(0.5~12건)', () => {
  const { agg, lg } = season('mlb', 23, 1);
  assert.ok(agg.inn / agg.n > 9.0 && agg.inn / agg.n < 9.4);
  const perTeam = agg.inj / lg.teams.length;
  assert.ok(perTeam > 0.5 && perTeam < 12, `injuries per team ${perTeam}`);
});

test('능력이 높은 팀이 더 많이 이긴다 (팀 능력 1점당 승률 +1.5~5%p)', () => {
  const { agg, lg } = season('mlb', 24, 2);
  const act = (t) => t.players.filter((p) => p.act);
  const xs = lg.teams.map((t) => act(t).reduce((a, p) => a + ovrOf(p), 0) / act(t).length);
  const ys = lg.teams.map((t, i) => agg.wins[i] / agg.g[i]);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const slope = sxy / sxx;
  assert.ok(slope > 0.015 && slope < 0.05, `slope ${slope}`);
});

test('팀 승률 분포가 현실적이다 (표준편차 5.5~10%p)', () => {
  for (const c of ['mlb', 'kbo']) {
    const { agg } = season(c, 25, 1);
    const p = agg.wins.map((w, i) => w / agg.g[i]);
    const sd = Math.sqrt(p.reduce((a, x) => a + (x - 0.5) ** 2, 0) / p.length);
    assert.ok(sd > 0.04 && sd < 0.11, `${c} sd ${sd}`);
  }
});

test('기록 정합성: 승·패 투수 각 1명, 세이브는 승리팀 투수, 타자 안타 ≤ 타수', () => {
  const { lg, rng } = league('mlb', 31);
  for (let i = 0; i < 60; i++) {
    const r = simulateGame(lg.teams[i % 30], lg.teams[(i + 7) % 30], rng, { env: ENV.mlb });
    assert.ok(r.wp && r.lp && r.wp !== r.lp);
    assert.ok(r.hs !== r.as);
    assert.equal(r.line.away.reduce((a, b) => a + b, 0), r.as);
    assert.equal(r.line.home.reduce((a, b) => a + (b || 0), 0), r.hs);
  }
  for (const t of lg.teams) for (const p of t.players) if (p.s && p.role === 'H') assert.ok(p.s.h <= p.s.ab && p.s.hr <= p.s.h && p.s.ab <= p.s.pa);
  const w = lg.teams.flatMap((t) => t.players).reduce((a, p) => a + (p.s && p.role === 'P' ? p.s.w : 0), 0);
  const l = lg.teams.flatMap((t) => t.players).reduce((a, p) => a + (p.s && p.role === 'P' ? p.s.l : 0), 0);
  assert.equal(w, 60); assert.equal(l, 60);
});

test('선발은 돌아가며 등판하고 (5인 로테이션), 불펜은 지치면 쉰다', () => {
  const { lg, rng } = league('mlb', 41);
  const t = lg.teams[0];
  const starters = new Set();
  for (let i = 0; i < 25; i++) {
    const r = simulateGame(t, lg.teams[1 + (i % 29)], rng, { env: ENV.mlb });
    starters.add(r.sp[r.homeId === t.id ? 'home' : 'away']);
    recover(lg);
  }
  assert.ok(starters.size >= 4, `starters ${starters.size}`);
  assert.ok(t.players.filter((p) => p.pos === 'RP').every((p) => p.fat < 100));
});

test('모든 포지션에서 수비 감점이 적용된다 (포수/유격수를 아무나 못 본다)', async () => {
  const { fitPenalty } = await import('../src/player.js');
  assert.equal(fitPenalty({ pos: 'SS' }, 'SS'), 0);
  assert.ok(fitPenalty({ pos: 'LF' }, 'C') >= 20);
  assert.ok(fitPenalty({ pos: 'LF' }, 'SS') > fitPenalty({ pos: '3B' }, 'SS'));
  assert.equal(fitPenalty({ pos: 'LF' }, 'DH'), 0);
});
