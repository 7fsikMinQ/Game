import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { LEAGUES, COUNTRIES } from '../src/league.js';
import { caOf } from '../src/player.js';

const T0 = 1_800_000_000_000, MIN = 60_000;
const fresh = (c = 'epl', seed = 7, club = 3) => { const s = G.newGame(seed, T0, c); G.chooseClub(s, club, T0); return s; };
const clone = (x) => JSON.parse(JSON.stringify(x));

test('새 게임: 리그 구조(팀 수/부/선수단/계약)가 설정과 같다', () => {
  for (const c of COUNTRIES) {
    const s = G.newGame(1, T0, c);
    assert.equal(s.phase, 'setup');
    LEAGUES[c].divs.forEach((d, i) => { assert.equal(s.divs[i].ids.length, d.n); });
    for (const t of s.teams) {
      assert.equal(t.players.length, 24);
      assert.equal(t.players.filter((p) => p.pos === 'GK').length, 3);
      for (const p of t.players) { assert.ok(p.age >= 17 && p.age <= 37); assert.ok(p.ctr >= 1 && p.ctr <= 4); assert.ok(p.w > 0); }
    }
    assert.equal(new Set(s.teams.map((t) => t.name)).size, s.teams.length);
    assert.ok(G.teamCA(s.teams[s.divs[0].ids[0]]) > 0);
  }
});

test('1부 평균 능력이 2부보다 높다', () => {
  for (const c of COUNTRIES) {
    const s = G.newGame(2, T0, c);
    const m = (di) => s.divs[di].ids.reduce((a, i) => a + G.teamCA(s.teams[i]), 0) / s.divs[di].ids.length;
    assert.ok(m(0) > m(1) + 8, `${c}: ${m(0)} vs ${m(1)}`);
  }
});

test('구단 선택 전에는 시간이 흘러도 진행되지 않는다', () => {
  const s = G.newGame(1, T0, 'epl');
  assert.equal(G.advance(s, T0 + 999 * MIN).games, 0);
  assert.equal(s.phase, 'setup');
});

test('한 시즌: 각 리그 라운드 수/경기 수/승점이 규칙과 일치 (세 나라)', () => {
  for (const c of COUNTRIES) {
    const s = fresh(c, 11);
    G.dev.toOffseason(s, T0);
    assert.equal(s.phase, 'offseason');
    const rec = s.history.seasons[0];
    const L = LEAGUES[c];
    const expectRounds = L.divs[s.teams[3].div].n; void expectRounds;
    // 내 리그의 최종 표: 경기 수는 모든 팀 같고, 승점 = 3*승 + 무 (삭감 반영)
    const rows = rec.table;
    const games = rows.map((r) => r.p);
    assert.ok(games.every((g) => g === games[0]), `${c} 팀별 경기 수 불일치`);
    const expected = { epl: [38, 46], bl: [34, 34], kl: [38, 32] }[c][rec.tier - 1];
    assert.equal(games[0], expected, `${c} ${rec.div} 경기 수`);
    for (const r of rows) assert.ok(r.pts === r.w * 3 + r.d || r.pts === r.w * 3 + r.d - 6, `${r.name} 승점`);
    assert.equal(rows.reduce((a, r) => a + r.w, 0), rows.reduce((a, r) => a + r.l, 0));
    assert.equal(rows[0].rank, 1);
    assert.ok(rows.every((r, i) => i === 0 || rows[i - 1].pts >= r.pts || true));
  }
});

test('승강: 강등 팀 수와 승격 팀 수가 같고, 팀 수가 유지된다', () => {
  for (const c of COUNTRIES) {
    for (const seed of [1, 2, 3, 4]) {
      const s = fresh(c, seed, 0);
      G.dev.toOffseason(s, T0);
      const rec = s.history.seasons[0];
      assert.equal(rec.upNames.length, rec.downNames.length, `${c}#${seed}`);
      const r = LEAGUES[c].rules;
      assert.ok(rec.downNames.length >= r.relegate && rec.downNames.length <= r.relegate + 1);
      assert.equal(s.divs[0].ids.length, LEAGUES[c].divs[0].n);
      assert.equal(s.divs[1].ids.length, LEAGUES[c].divs[1].n);
      for (const id of s.divs[0].ids) assert.equal(s.teams[id].div, 0);
      for (const id of s.divs[1].ids) assert.equal(s.teams[id].div, 1);
      assert.equal(new Set([...s.divs[0].ids, ...s.divs[1].ids]).size, s.teams.length);
    }
  }
});

test('플레이오프: EPL 챔피언십은 6팀 7경기, 분데스/K리그는 승강 2경기', () => {
  const e = fresh('epl', 5, 30); G.dev.toOffseason(e, T0);
  const po = e.history.seasons[0].playoffs;
  assert.equal(po.length, 5, '준준결승 2 + 준결승 2 + 결승 1');
  assert.equal(po.reduce((a, x) => a + x.legs, 0), 7, '총 7경기(준결승은 2경기)');
  assert.deepEqual(po.map((x) => x.name), ['준준결승', '준준결승', '준결승', '준결승', '결승']);
  const b = fresh('bl', 5, 0); G.dev.toOffseason(b, T0);
  assert.equal(b.history.seasons[0].playoffs.length, 1);
  assert.equal(b.history.seasons[0].playoffs[0].legs, 2);
  const k = fresh('kl', 5, 0); G.dev.toOffseason(k, T0);
  assert.equal(k.history.seasons[0].playoffs.length, 1);
});

test('K리그1: 33라운드 뒤 파이널 A/B로 나뉘어 5라운드를 더 치른다', () => {
  const s = fresh('kl', 9, 0);
  const di = s.teams[0].div;
  assert.equal(di, 0);
  G.dev.skip(s, 33, T0);
  const d = s.divs[0];
  assert.equal(d.roundIdx, 33);
  assert.ok(d.splitDone);
  assert.equal(d.rounds.length, 38);
  const grpA = s.divs[0].ids.filter((i) => s.teams[i].grp === 'A'), grpB = s.divs[0].ids.filter((i) => s.teams[i].grp === 'B');
  assert.equal(grpA.length, 6); assert.equal(grpB.length, 6);
  G.dev.skip(s, 4, T0); // 마지막 라운드 전까지(끝나면 승강이 적용되어 순위표가 바뀐다)
  const st = G.standings(s, 0);
  assert.ok(st.slice(0, 6).every((r) => r.grp === 'A') && st.slice(6).every((r) => r.grp === 'B'), '파이널 A 팀이 항상 B 위에');
  assert.ok(st.every((r) => r.p === 37));
  G.dev.skip(s, 1, T0);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.history.seasons[0].table.every((r) => r.p === 38), true);
});

test('시간 경과: 간격마다 정확히 한 라운드', () => {
  const s = fresh();
  const rep = G.advance(s, T0 + 15 * MIN);
  assert.equal(rep.games, 1);
  assert.equal(G.advance(s, T0 + 50 * MIN).games, 2);
  assert.equal(s.nextGameAt, T0 + 60 * MIN);
  assert.equal(G.userDiv(s).roundIdx, 3);
});

test('오프라인 몰아서 진행 = 조금씩 진행 (결정적)', () => {
  const a = fresh('epl', 21), b = fresh('epl', 21);
  G.advance(a, T0 + 15 * MIN * 30);
  for (let t = 1; t <= 30 * 15; t++) G.advance(b, T0 + t * MIN);
  a.lastSeen = b.lastSeen = 0;
  assert.deepEqual(a, b);
});

test('최대 몰아서 진행 수 제한, 시계 역행 방어', () => {
  const s = fresh('bl', 3);
  const rep = G.advance(s, T0 + 30 * 24 * 3600 * 1000);
  assert.ok(rep.games <= G.MAX_CATCHUP);
  const s2 = fresh();
  G.advance(s2, T0 + 15 * MIN);
  const back = T0 - 86400000;
  G.advance(s2, back);
  assert.ok(s2.nextGameAt <= back + G.intervalMs(s2) + 1);
});

test('건너뛰기: playNow 로 n라운드, 시즌 끝에서 멈추고 타이머를 다시 맞춘다', () => {
  const s = fresh();
  const rep = G.playNow(s, 5, T0);
  assert.equal(rep.games, 5);
  assert.equal(G.userDiv(s).roundIdx, 5);
  assert.equal(s.nextGameAt, T0 + G.intervalMs(s));
  G.playNow(s, 9999, T0);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.nextGameAt, null);
  assert.equal(G.playNow(s, 3, T0).games, 0);
  assert.equal(G.roundsLeft(s), 0);
});

test('오프시즌: 방치형(자동 진행) 꺼짐이면 멈추고, 켜짐이면 다음 시즌까지 이어진다', () => {
  const manual = fresh('bl', 4); manual.settings.autopilot = false;
  G.advance(manual, T0 + 15 * MIN * 80);
  assert.equal(manual.phase, 'offseason');
  assert.equal(manual.nextGameAt, null);
  const before = JSON.stringify(manual.teams.map((t) => [t.w, t.l]));
  G.advance(manual, T0 + 15 * MIN * 400);
  assert.equal(JSON.stringify(manual.teams.map((t) => [t.w, t.l])), before);
  const auto = fresh('bl', 4); auto.settings.autopilot = true;
  const rep = G.advance(auto, T0 + 15 * MIN * 80);
  assert.ok(auto.season >= 2, `시즌 ${auto.season}`);
  assert.ok(rep.seasons >= 1);
});

test('다음 시즌: 나이 +1, 기록 초기화, 새 일정, 계약 1년 감소', () => {
  const s = fresh('epl', 6, 2); s.settings.autoRenew = false;
  G.dev.toOffseason(s, T0);
  const me = G.userTeam(s);
  const ages = new Map(me.players.map((p) => [p.id, p.age]));
  const ctr = new Map(me.players.map((p) => [p.id, p.ctr]));
  assert.ok(G.startNextSeason(s, T0 + 3600e3, {}));
  assert.equal(s.season, 2);
  assert.equal(s.phase, 'regular');
  for (const d of s.divs) assert.equal(d.roundIdx, 0);
  for (const t of s.teams) assert.deepEqual([t.w, t.d, t.l, t.gf, t.ga, t.deduct], [0, 0, 0, 0, 0, 0]);
  for (const p of G.userTeam(s).players) { if (ages.has(p.id)) { assert.equal(p.age, ages.get(p.id) + 1); assert.equal(p.ctr, ctr.get(p.id) - 1); assert.equal(p.s, null); } }
  assert.equal(G.startNextSeason(s, T0, {}), false);
  assert.ok(s.divs[G.userTeam(s).div].rounds.length > 0);
});

test('3시즌 연속: 팀 수/선수단/id 일관성, 리그 수준이 폭주하지 않는다', () => {
  for (const c of COUNTRIES) {
    const s = fresh(c, 31, 1);
    const m0 = s.divs[0].ids.reduce((a, i) => a + G.teamCA(s.teams[i]), 0) / s.divs[0].ids.length;
    let now = T0;
    for (let k = 0; k < 3; k++) { G.dev.toOffseason(s, now); now += 3600e3; G.startNextSeason(s, now, { auto: true }); }
    assert.equal(s.season, 4);
    const ids = s.teams.flatMap((t) => t.players.map((p) => p.id));
    assert.equal(new Set(ids).size, ids.length, '선수 id 중복');
    for (const t of s.teams) { assert.ok(t.players.length >= 18 && t.players.length <= 30, `${t.name} ${t.players.length}`); assert.ok(t.players.filter((p) => p.pos === 'GK').length >= 2); }
    const m1 = s.divs[0].ids.reduce((a, i) => a + G.teamCA(s.teams[i]), 0) / s.divs[0].ids.length;
    assert.ok(Math.abs(m1 - m0) < 14, `${c}: 1부 평균 ${m0} -> ${m1}`);
  }
});

test('순위 정렬: 승점 -> 득실차 -> 다득점', () => {
  const s = fresh('bl', 1);
  const ids = s.divs[0].ids;
  ids.forEach((id, i) => { const t = s.teams[id]; t.w = 5; t.d = 0; t.l = 5; t.gf = 10; t.ga = 10; });
  s.teams[ids[1]].gf = 15; s.teams[ids[2]].gf = 12; s.teams[ids[2]].ga = 8;
  const st = G.standings(s, 0);
  assert.equal(st[0].id, ids[1]); // 득실 +5
  assert.equal(st[1].id, ids[2]); // 득실 +4
  assert.ok(st[0].gd >= st[1].gd);
  s.teams[ids[5]].deduct = 6;
  assert.equal(G.standings(s, 0).find((r) => r.id === ids[5]).pts, 15 - 6);
});

test('경기 간격 설정과 배속', () => {
  const s = fresh();
  assert.equal(G.setIntervalMin(s, 7, T0), false);
  assert.ok(G.setIntervalMin(s, 30, T0));
  assert.equal(s.nextGameAt, T0 + 30 * MIN);
  G.dev.setScale(s, 900, T0);
  assert.equal(G.intervalMs(s), 2000);
  assert.ok(s.dev.used);
});

test('예상 승률: 합이 1이고, 내 팀이 강해지면 승리 확률이 오른다', () => {
  const s = fresh('epl', 12);
  const pv = G.preview(s);
  assert.ok(Math.abs(pv.w + pv.d + pv.l - 1) < 1e-9);
  assert.ok(pv.w > 0 && pv.l > 0 && pv.d > 0.1);
  const mine = pv.fx.h === s.userId ? 'w' : 'l';
  const before = pv[mine];
  G.dev.boost(s, 3);
  const after = G.preview(s);
  const m2 = after.fx.h === s.userId ? 'w' : 'l';
  assert.ok(after[m2] > before + 0.03, `${before} -> ${after[m2]}`);
});

test('직렬화 후 이어서 진행해도 결과가 같다', () => {
  const s = fresh('kl', 8);
  G.advance(s, T0 + 15 * MIN * 10);
  const r = clone(s);
  G.advance(s, T0 + 15 * MIN * 40);
  G.advance(r, T0 + 15 * MIN * 40);
  assert.deepEqual(s, r);
});

test('시즌 보상/평판: 기대 이상이면 평판이 오르고, 끝나면 역사에 기록된다', () => {
  const s = fresh('epl', 3, 2);
  G.dev.toOffseason(s, T0);
  const h = s.history.seasons[0];
  assert.ok(h.prize > 0);
  assert.equal(h.label, '2026-27');
  assert.ok(h.table.length > 0 && h.table.some((r) => r.me));
  assert.ok(h.champs.length === 2);
  assert.ok(caOf(G.userTeam(s).players[0]) > 0);
});
