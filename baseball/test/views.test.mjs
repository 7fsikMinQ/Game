import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, advance, dev, userTeam, startNextSeason } from '../src/game.js';
import { homeView, rosterView, tableView, clubView, playerSheet, backupSheet, devSheet, boardFromPlays, boardHTML, navHTML, TABS } from '../src/views.js';
import { fmtMoney, fmtAvg, fmtIP, fmtEra, fmtClock, esc } from '../src/util.js';

const T0 = 1_700_000_000_000;
const ui = () => ({ tab: 'home', seg: 'H', live: null, report: null, pick: null });

test('모든 화면이 모든 단계(새 게임/시즌 중/포스트시즌/오프시즌)에서 예외 없이 그려진다', () => {
  const s = newGame(3, T0);
  const stages = [];
  stages.push(['new', JSON.parse(JSON.stringify(s))]);
  advance(s, T0 + 600_000 * 5);
  stages.push(['mid', JSON.parse(JSON.stringify(s))]);
  advance(s, T0 + 600_000 * 42);
  stages.push(['late', JSON.parse(JSON.stringify(s))]);
  dev.toOffseason(s);
  stages.push(['off', JSON.parse(JSON.stringify(s))]);
  for (const [name, st] of stages) {
    const now = T0 + 600_000 * 5;
    for (const seg of ['H', 'P']) {
      const u = { ...ui(), seg };
      for (const html of [homeView(st, u, now), rosterView(st, u), tableView(st), clubView(st)]) {
        assert.ok(html.length > 100, name);
        assert.ok(!html.includes('undefined'), `${name}: undefined 출력\n${html.match(/.{40}undefined.{40}/)?.[0]}`);
        assert.ok(!html.includes('NaN'), `${name}: NaN 출력`);
      }
    }
    for (const p of userTeam(st).players) assert.ok(playerSheet(st, p.id).includes(p.name));
  }
});

test('중계 중 화면: 결과 줄과 승패 기록이 가려진다', () => {
  const s = newGame(3, T0);
  advance(s, T0 + 600_000);
  const e = s.latest;
  const live = homeView(s, { ...ui(), live: { shown: 5 } }, T0 + 600_000);
  assert.ok(!live.includes('boardmeta'));
  assert.ok(live.includes('중계 중'));
  const done = homeView(s, ui(), T0 + 600_000);
  assert.ok(done.includes('boardmeta'));
  const w = userTeamRecord(s);
  assert.ok(done.includes(`<b>${w.w}</b>승 <b>${w.l}</b>패`));
  assert.ok(live.includes('<b>0</b>승 <b>0</b>패'), '중계 중에는 이 경기를 뺀 기록');
  assert.ok(e.plays.length > 20);
});
const userTeamRecord = (s) => s.teams[0];

test('중계 연출 스코어보드는 일부 플레이만 반영하고 최종 값에 수렴한다', () => {
  const s = newGame(3, T0);
  advance(s, T0 + 600_000);
  const e = s.latest;
  const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
  let prev = 0;
  for (let n = 0; n <= e.plays.length; n++) {
    const b = boardFromPlays(s, e, n);
    const t = sum(b.away) + sum(b.home);
    assert.ok(t >= prev);
    prev = t;
  }
  const last = boardFromPlays(s, e, e.plays.length);
  assert.equal(sum(last.away), e.line.away.reduce((x, y) => x + (y || 0), 0));
  assert.equal(sum(last.home), e.line.home.reduce((x, y) => x + (y || 0), 0));
  assert.ok(boardHTML(last).includes('<table>'));
});

test('이름 등 사용자 입력은 HTML로 해석되지 않는다 (XSS 방지)', () => {
  const s = newGame(3, T0);
  userTeamName(s, '<img src=x onerror=alert(1)>');
  const p = s.teams[0].players[0];
  p.name = '"><script>alert(1)</script>';
  for (const html of [homeView(s, ui(), T0), rosterView(s, ui()), tableView(s), clubView(s), playerSheet(s, p.id), backupSheet('"><b>')]) {
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img src=x'));
  }
});
const userTeamName = (s, n) => { s.teams[0].name = n; };

test('하단 탭은 4개, 현재 탭에만 on', () => {
  assert.equal(TABS.length, 4);
  const html = navHTML('roster');
  assert.equal((html.match(/class="tab on"/g) || []).length, 1);
});

test('개발자 시트에 현재 배속이 표시된다', () => {
  const s = newGame(1, T0);
  s.dev.timeScale = 60;
  assert.ok(devSheet(s).includes('x60'));
});

test('서식 함수', () => {
  assert.equal(fmtMoney(500), '500만');
  assert.equal(fmtMoney(1234567), '123억');
  assert.equal(fmtMoney(12500), '1.25억');
  assert.equal(fmtMoney(10000), '1억');
  assert.equal(fmtMoney(-2500), '-2,500만');
  assert.equal(fmtAvg(3, 10), '.300');
  assert.equal(fmtAvg(0, 0), '.000');
  assert.equal(fmtIP(10), '3.1');
  assert.equal(fmtEra(3, 27), '3.00');
  assert.equal(fmtEra(0, 0), '-.--');
  assert.equal(fmtClock(61_000), '01:01');
  assert.equal(fmtClock(-5), '00:00');
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});
