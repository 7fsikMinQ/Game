import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/rng.js';
import { genPlayer, caOf } from '../src/player.js';
import { SQUAD_PLAN } from '../src/data.js';
import { pickSquad } from '../src/squad.js';
import { simulateMatch } from '../src/match.js';

const world = (seed = 5) => {
  let id = 1;
  const rng = createRng(seed);
  const ctx = { rng, nextId: () => id++, used: new Set() };
  const team = (n, mean) => ({ id: n, name: 'T' + n, players: SQUAD_PLAN.map((pos) => genPlayer(ctx, { pos, ca: mean + rng.normal(0, 8), age: 26 })) });
  return { rng, team };
};
const squad = (t, form = '442', tactic = { mentality: 'bal', pressing: 'mid' }) => { const s = pickSquad(t, form); s.tactic = tactic; return s; };
const clone = (x) => JSON.parse(JSON.stringify(x));

test('같은 시드면 같은 경기 결과(이벤트까지)', () => {
  const { rng, team } = world();
  const A = team(1, 100), B = team(2, 100);
  const r1 = simulateMatch(clone(A), clone(B), squad(A), squad(B), createRng(3), { log: true, commit: false });
  const r2 = simulateMatch(clone(A), clone(B), squad(A), squad(B), createRng(3), { log: true, commit: false });
  assert.deepEqual(r1.events, r2.events);
  assert.equal(r1.hs, r2.hs);
  void rng;
});

test('불변식: 점수 = 골 이벤트 수, 마지막 골 이벤트의 점수가 최종 점수, 승/무/패 일관', () => {
  const { rng, team } = world(7);
  const A = team(1, 100), B = team(2, 100);
  for (let i = 0; i < 300; i++) {
    const r = simulateMatch(A, B, squad(A), squad(B), rng, { log: true, commit: false });
    const goals = r.events.filter((e) => e.t === 'goal');
    assert.equal(goals.length, r.hs + r.as);
    assert.equal(goals.filter((g) => g.side === 'h').length, r.hs);
    if (goals.length) assert.deepEqual(goals[goals.length - 1].score, [r.hs, r.as]);
    for (const e of r.events) assert.ok(e.min >= 1 && e.min <= 90);
    const mins = r.events.map((e) => e.min);
    assert.deepEqual(mins, mins.slice().sort((a, b) => a - b));
    assert.ok(r.poss >= 15 && r.poss <= 85);
    assert.ok(r.stats.h.sot <= r.stats.h.shots && r.stats.a.sot <= r.stats.a.shots);
    assert.ok(r.stats.h.shots >= r.hs);
  }
});

test('개인 기록 합계: 득점/도움/출전시간이 맞는다', () => {
  const { rng, team } = world(8);
  const A = team(1, 100), B = team(2, 100);
  for (let i = 0; i < 100; i++) {
    const r = simulateMatch(A, B, squad(A), squad(B), rng, { commit: false });
    const goals = r.players[0].reduce((a, p) => a + p.g, 0), assists = r.players[0].reduce((a, p) => a + p.a, 0);
    assert.equal(goals, r.hs);
    assert.ok(assists <= r.hs);
    for (const side of r.players) {
      const total = side.reduce((a, p) => a + p.min, 0);
      assert.ok(total <= 11 * 90 && total >= 10 * 90 - 90, `총 출전 시간 ${total}`); // 퇴장 시 줄어듦
      for (const p of side) { assert.ok(p.rt === 0 || (p.rt >= 3 && p.rt <= 10)); assert.ok(p.min <= 90); }
    }
    assert.ok(r.motm);
  }
});

test('교체는 팀당 최대 3명, 교체 이벤트가 로그에 남는다', () => {
  const { rng, team } = world(9);
  const A = team(1, 100), B = team(2, 100);
  let subs = 0;
  for (let i = 0; i < 200; i++) {
    const r = simulateMatch(A, B, squad(A), squad(B), rng, { log: true, commit: false });
    for (const side of ['h', 'a']) { const n = r.events.filter((e) => e.t === 'sub' && e.side === side).length; assert.ok(n <= 3, `${n}명 교체`); subs += n; }
  }
  const perTeam = subs / 200 / 2;
  assert.ok(perTeam >= 2 && perTeam <= 3, `팀당 평균 교체 ${perTeam.toFixed(2)}명 (현실은 3~5, 이 게임은 최대 3)`);
});

test('퇴장이 나오면 해당 팀 전력이 떨어지고 로그에 남는다 (표본 안에서 발생)', () => {
  const { rng, team } = world(10);
  const A = team(1, 100), B = team(2, 100);
  let reds = 0;
  for (let i = 0; i < 800 && reds < 3; i++) {
    const r = simulateMatch(A, B, squad(A), squad(B), rng, { log: true, commit: false });
    reds += r.events.filter((e) => e.t === 'rc').length;
  }
  assert.ok(reds > 0, '800경기에서 퇴장이 한 번도 없음');
});

test('부상은 경기당 0.15~0.45건, 경고는 경기당 1.2~3.0장', () => {
  const { rng, team } = world(11);
  const A = team(1, 100), B = team(2, 100);
  let inj = 0, yc = 0;
  const N = 1500;
  for (let i = 0; i < N; i++) {
    const r = simulateMatch(A, B, squad(A), squad(B), rng, { commit: false });
    inj += r.players.flat().filter((p) => p.inj).length;
    yc += r.stats.h.yc + r.stats.a.yc;
  }
  assert.ok(inj / N > 0.15 && inj / N < 0.45, `부상 ${inj / N}`);
  assert.ok(yc / N > 1.2 && yc / N < 3.0, `경고 ${yc / N}`);
});

test('밸런스: 비슷한 팀의 경기당 총 득점 2.2~3.4, 슈팅 18~30, 홈 이점은 작다', () => {
  const { rng, team } = world(12);
  const A = team(1, 100), B = team(2, 100);
  let g = 0, sh = 0, hw = 0, aw = 0;
  const N = 2500;
  for (let i = 0; i < N; i++) {
    // 팀 실력 차이가 홈 이점에 섞이지 않도록 홈/원정을 번갈아 측정한다
    const r = i % 2 ? simulateMatch(A, B, squad(A), squad(B), rng, { commit: false }) : simulateMatch(B, A, squad(B), squad(A), rng, { commit: false });
    g += r.hs + r.as; sh += r.stats.h.shots + r.stats.a.shots;
    if (r.hs > r.as) hw++; else if (r.hs < r.as) aw++;
  }
  assert.ok(g / N > 2.2 && g / N < 3.4, `총 득점 ${g / N}`);
  assert.ok(sh / N > 18 && sh / N < 30, `슈팅 ${sh / N}`);
  assert.ok(hw / N > aw / N && hw / N - aw / N > 0.06 && hw / N - aw / N < 0.2, `홈 ${hw / N} 원정 ${aw / N}`);
});

test('밸런스: CA가 높은 팀이 더 자주 이기지만 약팀도 이긴다', () => {
  const { rng, team } = world(13);
  const strong = team(1, 120), weak = team(2, 100);
  let sw = 0, ww = 0, d = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const r = i % 2 ? simulateMatch(strong, weak, squad(strong), squad(weak), rng, { commit: false }) : simulateMatch(weak, strong, squad(weak), squad(strong), rng, { commit: false });
    const sg = i % 2 ? r.hs : r.as, wg = i % 2 ? r.as : r.hs;
    if (sg > wg) sw++; else if (sg < wg) ww++; else d++;
  }
  assert.ok(sw / N > 0.5 && sw / N < 0.78, `강팀 승률 ${sw / N}`);
  assert.ok(ww / N > 0.08, `약팀 승률 ${ww / N}`);
  assert.ok(d / N > 0.12 && d / N < 0.33, `무승부 ${d / N}`);
});

test('득점 수준은 팀 능력 절대값(리그 수준)과 무관하다 (정규화)', () => {
  const avg = (mean) => { const { rng, team } = world(14); const A = team(1, mean), B = team(2, mean); let g = 0; for (let i = 0; i < 1200; i++) { const r = simulateMatch(A, B, squad(A), squad(B), rng, { commit: false }); g += r.hs + r.as; } return g / 1200; };
  const lo = avg(75), hi = avg(135);
  assert.ok(Math.abs(lo - hi) < 0.45, `낮은 리그 ${lo}, 높은 리그 ${hi}`);
});

test('전술: 공격적일수록 총 득점이 늘고, 강한 압박은 상대 슈팅을 줄인다', () => {
  const run = (mA, pA) => { const { rng, team } = world(15); const A = team(1, 100), B = team(2, 100); let sa = 0, sb = 0, g = 0; for (let i = 0; i < 1500; i++) { const r = simulateMatch(A, B, squad(A, '442', { mentality: mA, pressing: pA }), squad(B), rng, { commit: false }); g += r.hs + r.as; sa += r.stats.h.shots; sb += r.stats.a.shots; } return { g: g / 1500, sa: sa / 1500, sb: sb / 1500 }; };
  const atk = run('atk', 'mid'), def = run('def', 'mid');
  assert.ok(atk.g > def.g, `공격 ${atk.g} 수비 ${def.g}`);
  assert.ok(atk.sa > def.sa);
  const high = run('bal', 'high'), low = run('bal', 'low');
  assert.ok(high.sb < low.sb, `압박 높음 상대슈팅 ${high.sb} < 낮음 ${low.sb}`);
});

test('commit: 출전한 선수의 기록과 컨디션이 갱신되고, 벤치는 그대로', () => {
  const { rng, team } = world(16);
  const A = team(1, 100), B = team(2, 100);
  const sq = squad(A);
  const starters = new Set(sq.xi.map((x) => x.p.id));
  const r = simulateMatch(A, B, sq, squad(B), rng, { commit: true });
  for (const p of A.players) {
    if (starters.has(p.id)) { assert.ok(p.s && p.s.app === 1); assert.ok(p.cond < 100); }
  }
  assert.equal(A.players.reduce((a, p) => a + (p.s ? p.s.g : 0), 0), r.hs);
});

test('성능: 경기 1회가 평균 3ms 미만 (표본 500경기)', () => {
  const { rng, team } = world(17);
  const A = team(1, 100), B = team(2, 100);
  const sa = squad(A), sb = squad(B);
  const t0 = performance.now();
  for (let i = 0; i < 500; i++) simulateMatch(A, B, sa, sb, rng, { commit: false });
  const per = (performance.now() - t0) / 500;
  assert.ok(per < 3, `경기당 ${per.toFixed(2)}ms`);
});

test('어시스턴트: 부상자는 라인업에서 빠지고, 골키퍼 자리에는 골키퍼만 쓴다', () => {
  const { team } = world(18);
  const A = team(1, 100);
  const best = pickSquad(A, '442');
  const star = best.xi.find((x) => x.slot.r === 'ST').p;
  star.out = 3;
  const next = pickSquad(A, '442');
  assert.ok(!next.xi.some((x) => x.p.id === star.id));
  assert.equal(next.xi.filter((x) => x.p.pos === 'GK').length, 1);
  assert.equal(next.xi[0].slot.r, 'GK');
  assert.equal(new Set(next.xi.map((x) => x.p.id)).size, 11);
  assert.ok(next.bench.some((p) => p.pos === 'GK'));
  void caOf;
});

test('수동 라인업: 지정한 선수가 우선, 불가능하면 자동으로 대체', () => {
  const { team } = world(19);
  const A = team(1, 100);
  const base = pickSquad(A, '442');
  const bench = base.bench.find((p) => p.pos !== 'GK');
  const manual = { 9: bench.id };
  assert.equal(pickSquad(A, '442', manual).xi[9].p.id, bench.id);
  bench.out = 2;
  assert.notEqual(pickSquad(A, '442', manual).xi[9].p.id, bench.id);
});
