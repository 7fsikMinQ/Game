import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as V from '../src/views.js';
import { esc } from '../src/util.js';
import { LEAGUES, COUNTRIES } from '../src/data.js';

const T0 = 1_800_000_000_000;
const fresh = (c, seed = 7, club = 3) => { const s = G.newGame(seed, T0, c); G.chooseClub(s, club, T0); return s; };
const ui = (o = {}) => ({ tab: 'home', rseg: 'H', lseg: 'table', cseg: 'fin', msub: 'trade', frole: 'ALL', live: null, report: null, trade: null, backupAge: '', backupNudge: false, ...o });
const clean = (html, what) => { assert.ok(html.length > 50, `${what} 비어 있음`); assert.ok(!/undefined|NaN|\[object|Infinity/.test(html.replace(/data-[a-z-]+="[^"]*"/g, '')), `${what}: undefined/NaN 포함: ${(html.match(/.{30}(undefined|NaN|\[object|Infinity).{30}/) || [''])[0]}`); };

test('시작 화면: 리그 선택/구단 선택이 두 리그 모두 렌더된다', () => {
  clean(V.leagueSelectView(), '리그 선택');
  for (const c of COUNTRIES) { const s = G.newGame(1, T0, c); clean(V.clubSelectView(s, { autopilot: true }), `구단 선택 ${c}`); assert.equal((V.clubSelectView(s, { autopilot: true }).match(/data-act="pick-club"/g) || []).length, LEAGUES[c].teams.length); }
});

test('모든 탭·구간이 시즌 시작/중반/포스트시즌/오프시즌에 렌더된다 (MLB·KBO)', () => {
  for (const c of COUNTRIES) {
    const s = fresh(c, 5, 2);
    const stages = [['시작', () => {}], ['중반', () => G.playNow(s, 40, T0)], ['포스트시즌', () => { G.dev.boost(s, 12); while (s.phase === 'regular') G.playNow(s, 30, T0); }], ['오프시즌', () => G.dev.toOffseason(s)], ['다음 시즌', () => G.startNextSeason(s, T0, { auto: true })]];
    for (const [name, fn] of stages) {
      fn();
      const u = ui();
      clean(V.homeView(s, u, T0), `${c} ${name} home`);
      for (const rseg of ['H', 'P', 'F', 'L']) clean(V.rosterView(s, ui({ rseg })), `${c} ${name} roster ${rseg}`);
      for (const lseg of ['table', 'stats', 'po', 'hist']) for (const llg of ['AL', 'NL']) clean(V.leagueView(s, ui({ lseg, llg })), `${c} ${name} league ${lseg}`);
      for (const msub of ['trade', 'fa', 'fx', 'draft', 'offers']) clean(V.marketView(s, ui({ msub })), `${c} ${name} market ${msub}`);
      for (const cseg of ['fin', 'fac', 'set']) clean(V.clubView(s, ui({ cseg })), `${c} ${name} club ${cseg}`);
    }
  }
});

test('선수 시트: 내 선수/상대 선수/FA/드래프트/외국인 모두 렌더되고 알맞은 버튼이 있다', () => {
  const s = fresh('kbo', 3, 4);
  const me = G.userTeam(s);
  const mine = me.players[0];
  let h = V.playerSheet(s, mine.id, 'own');
  clean(h, '내 선수'); assert.ok(h.includes('data-act="release"') && h.includes('trade-with'));
  assert.ok(V.playerSheet(s, me.players.find((p) => !p.act).id).includes('promote'));
  assert.ok(V.playerSheet(s, me.players.find((p) => p.act).id).includes('demote'));
  const other = s.teams[1].players[0];
  assert.ok(V.playerSheet(s, other.id, 'other').includes('trade-with-ai'));
  const fa = s.market.free[0]; h = V.playerSheet(s, fa.id, 'free'); clean(h, 'FA'); assert.ok(h.includes('data-act="sign"'));
  const fx = s.market.foreign[0]; h = V.playerSheet(s, fx.id, 'foreign'); assert.ok(h.includes('data-src="foreign"'));
  G.dev.toOffseason(s);
  const d = s.offseason.draft.pool[0];
  assert.ok(V.playerSheet(s, d.id, 'draft').includes('내 지명 차례'));
  assert.equal(V.playerSheet(s, 123456, 'own'), '');
});

test('다른 팀 선수의 잠재력은 범위(~)로, 내 선수는 정확한 숫자로 보인다', () => {
  const s = fresh('mlb');
  const other = s.teams[9].players.find((p) => p.age < 25);
  assert.ok(/잠재 \d+~\d+/.test(V.playerSheet(s, other.id, 'other')));
  const mine = G.userTeam(s).players[0];
  assert.ok(/잠재 \d+</.test(V.playerSheet(s, mine.id, 'own')));
});

test('트레이드 시트: 선택 전/가능/불가능 메시지', () => {
  const s = fresh('mlb', 6);
  const ai = s.teams[10];
  const star = ai.players.slice().sort((a, b) => G.ovrOf(b) - G.ovrOf(a))[0];
  const junk = G.userTeam(s).players.slice().sort((a, b) => G.ovrOf(a) - G.ovrOf(b))[0];
  let h = V.tradeSheet(s, { trade: { teamId: 10, give: new Set(), get: new Set() } });
  assert.ok(h.includes('양쪽에서 선수를 고르세요') && h.includes('disabled'));
  h = V.tradeSheet(s, { trade: { teamId: 10, give: new Set([junk.id]), get: new Set([star.id]) } });
  assert.ok(h.includes('가치가 부족'));
});

test('화면 문자열에 이름이 이스케이프된다 (구단·선수 이름의 HTML)', () => {
  const s = fresh('mlb');
  G.renameTeam(s, '<b>x</b>');
  G.userTeam(s).players[0].name = '<img src=x onerror=alert(1)>';
  const html = V.homeView(s, ui(), T0) + V.rosterView(s, ui()) + V.clubView(s, ui({ cseg: 'set' }));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>x</b>'));
  assert.equal(esc('<a>'), '&lt;a&gt;');
});

test('중계 중에는 결과가 스포일러되지 않는다 (순위·최근 성적을 직전 값으로)', () => {
  const s = fresh('mlb', 8);
  G.playNow(s, 1, T0);
  const live = { shown: 1 };
  const html = V.homeView(s, ui({ live }), T0);
  assert.ok(html.includes('중계 중'));
  assert.ok(!html.includes('경기 기록'.repeat(2)));
  const board = V.boardFromPlays(s, s.latest, 0);
  assert.equal(board.away.length + board.home.length, 0);
});

test('KBO 순위표는 5위까지 컷 라인, MLB는 6개 지구 이름이 모두 나온다', () => {
  const k = fresh('kbo');
  assert.ok(V.leagueView(k, ui()).includes('class="me cut"') || V.leagueView(k, ui()).includes('cut'));
  const m = fresh('mlb');
  const names = LEAGUES.mlb.divs;
  const html = V.leagueView(m, ui({ llg: 'AL' })) + V.leagueView(m, ui({ llg: 'NL' }));
  for (const n of names) assert.ok(html.includes(n), n);
});

test('백업/데이터 팩/개발자 시트가 렌더되고, 팩 검사 결과가 표시된다', () => {
  const s = fresh('mlb');
  clean(V.backupSheet('x'.repeat(400)), 'backup');
  clean(V.importSheet({}), 'import');
  const r = { ok: false, errors: ['오류A'], warnings: ['경고B'], stats: { teams: 1, players: 2 } };
  const h = V.importSheet({ text: 'a', result: r });
  assert.ok(h.includes('오류A') && h.includes('경고B') && !h.includes('import-go'));
  assert.ok(V.importSheet({ text: 'a', result: { ...r, ok: true, errors: [] } }).includes('import-go'));
  assert.ok(V.devSheet(s).includes('dev-boost'));
});

test('오프시즌 화면: 재계약 목록과 드래프트·FA 이동 버튼', () => {
  const s = fresh('mlb', 8);
  G.dev.toOffseason(s);
  const h = V.homeView(s, ui(), T0);
  for (const k of ['다음 시즌 시작', 'goto-draft', 'goto-fa', '계약 만료 선수']) assert.ok(h.includes(k), k);
});
