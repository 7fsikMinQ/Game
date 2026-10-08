import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as V from '../src/views.js';
import { parsePackText } from '../src/pack.js';
import { squadFor } from '../src/game.js';
import { fmtMoney, fmtClock, esc, fuzz } from '../src/util.js';

const T0 = 1_800_000_000_000;
const clean = (html, where) => {
  assert.ok(html.length > 50, `${where}: 비어 있음`);
  for (const bad of ['undefined', 'NaN', '[object', 'null<', '>null', 'Infinity']) assert.ok(!html.includes(bad), `${where}: "${bad}" 출력\n${(html.match(new RegExp(`.{0,50}${bad.replace(/[[\]]/g, '\\$&')}.{0,50}`)) || [''])[0]}`);
};
const ui = (s) => ({ tab: 'home', pos: 'ALL', sort: 'pos', lseg: 'table', ldiv: null, cseg: 'info', msub: 'buy', live: null, report: null, squadCache: s.phase === 'setup' ? null : squadFor(s, G.userTeam(s)), autopilot: true, backupAge: '' });

test('시작 화면: 리그 선택/구단 선택/가져오기 시트', () => {
  clean(V.leagueSelectView(), '리그 선택');
  assert.ok(V.leagueSelectView().includes('프리미어 리그') && V.leagueSelectView().includes('분데스리가') && V.leagueSelectView().includes('K리그1'));
  assert.ok(V.leagueSelectView().includes('가상 구단'));
  for (const c of ['epl', 'bl', 'kl']) {
    const s = G.newGame(1, T0, c);
    clean(V.clubSelectView(s, { autopilot: true }), `구단 선택 ${c}`);
    assert.equal((V.clubSelectView(s, { autopilot: true }).match(/data-act="pick-club"/g) || []).length, s.teams.length);
  }
  clean(V.importSheet({}), '가져오기 시트');
  const bad = V.importSheet({ text: 'x', result: parsePackText('{bad') });
  assert.ok(bad.includes('가져올 수 없습니다'));
  const good = V.importSheet({ text: 't', result: parsePackText(V.csvTemplate()) });
  assert.ok(good.includes('사용할 수 있는 데이터') && good.includes('import-go'));
});

test('모든 탭이 3개 리그 x 모든 단계(시작 직후/시즌 중/후반/오프시즌)에서 이상 문자열 없이 그려진다', () => {
  for (const c of ['epl', 'bl', 'kl']) {
    const s = G.newGame(4, T0, c); G.chooseClub(s, 1, T0); s.money = 1e9;
    const stages = [['시작', () => {}], ['초반', () => G.dev.skip(s, 4, T0)], ['중반', () => G.dev.skip(s, 20, T0)], ['후반', () => G.dev.skip(s, 12, T0)], ['오프시즌', () => G.dev.toOffseason(s, T0)]];
    for (const [name, step] of stages) {
      step();
      const u = ui(s);
      const now = T0 + 7 * 60_000;
      const where = `${c}/${name}`;
      clean(V.homeView(s, u, now), `${where} 홈`);
      if (s.phase === 'regular') {
        for (const seg of ['table', 'goals', 'assists', 'rating', 'hist']) for (const ldiv of [0, 1]) clean(V.leagueView(s, { ...u, lseg: seg, ldiv }), `${where} 리그 ${seg}/${ldiv}`);
        for (const p of ['ALL', 'GK', 'DF', 'MF', 'FW']) for (const sort of ['pos', 'ca', 'pa', 'age']) clean(V.squadView(s, { ...u, pos: p, sort }), `${where} 선수단 ${p}/${sort}`);
        clean(V.tacticsView(s, u), `${where} 전술`);
        for (const seg of ['info', 'market', 'news', 'set']) for (const msub of ['buy', 'loan', 'free']) clean(V.clubView(s, { ...u, cseg: seg, msub }), `${where} 구단 ${seg}/${msub}`);
        clean(V.slotPicker(s, 3), `${where} 슬롯`);
        // 중계 중 화면(스포일러 가림)
        if (s.latest) { clean(V.homeView(s, { ...u, live: { min: 30 } }, now), `${where} 중계`); }
      } else {
        for (const seg of ['table', 'hist']) clean(V.leagueView(s, { ...u, lseg: seg }), `${where} 리그 ${seg}`);
      }
      clean(V.squadView(s, u), `${where} 선수단`);
      clean(V.clubView(s, u), `${where} 구단`);
      // 선수 시트: 내 선수/시장/임대/자유계약/임대 보낸 선수
      const me = G.userTeam(s);
      for (const p of me.players.slice(0, 6)) clean(V.playerSheet(s, p.id, 'own'), `${where} 선수 ${p.name}`);
      if (s.phase === 'regular' || s.offseason) {
        const m = G.marketPlayers(s)[0]; if (m) clean(V.playerSheet(s, m.p.id, 'market'), `${where} 시장 선수`);
        const l = G.loanCandidates(s)[0]; if (l) clean(V.playerSheet(s, l.p.id, 'loan'), `${where} 임대 후보`);
        if (s.market.free[0]) clean(V.playerSheet(s, s.market.free[0].id, 'free'), `${where} 자유계약`);
      }
    }
    assert.equal(s.phase, 'offseason');
    clean(V.homeView(s, ui(s), T0), `${c} 오프시즌 홈`);
    for (const y of s.offseason.youth) clean(V.playerSheet(s, y.id, 'youth'), `${c} 유스`);
    for (const id of s.offseason.expiring.slice(0, 2)) clean(V.playerSheet(s, id, 'own'), `${c} 재계약 시트`);
  }
});

test('홈: 건너뛰기 버튼과 다음 경기/예상 승률/경기 간격 안내가 있다', () => {
  const s = G.newGame(2, T0, 'epl'); G.chooseClub(s, 2, T0);
  const h = V.homeView(s, ui(s), T0 + 60_000);
  for (const t of ['계속 ▶', '5라운드', '시즌 끝까지', '다음 경기', '승 ', '무 ', '패 ', '15분마다']) assert.ok(h.includes(t), `"${t}" 없음`);
  assert.ok(h.includes('data-act="play" data-n="1"') && h.includes('data-n="5"') && h.includes('data-n="9999"'));
});

test('중계 중에는 이번 경기 결과(승점·득실·자금)가 경기 전 값으로 보인다', () => {
  const s = G.newGame(2, T0, 'bl'); G.chooseClub(s, 2, T0);
  G.playNow(s, 2, T0);
  const before = JSON.parse(JSON.stringify(s));
  G.playNow(s, 1, T0);
  const u = { ...ui(s), live: { min: 20 }, before };
  const live = V.homeView(V.displayState(s, u), u, T0);
  const pts = (x) => G.standings(x).find((r) => r.id === x.userId).pts;
  assert.ok(live.includes('중계 중'));
  assert.ok(live.includes(`<span>승점</span><b>${pts(before)}</b>`));
  const done = V.homeView(s, ui(s), T0);
  assert.ok(done.includes(`<span>승점</span><b>${pts(s)}</b>`));
});

test('이적 탭: 열림/닫힘 안내, 임대 한도(EPL 2명 공식), 제안 수락/거절 버튼', () => {
  const s = G.newGame(2, T0, 'epl'); G.chooseClub(s, 2, T0);
  let c = V.clubView(s, { ...ui(s), cseg: 'market', msub: 'loan' });
  assert.ok(c.includes('열림') && c.includes('최대 2명') && c.includes('공식'));
  G.dev.skip(s, 8, T0);
  c = V.clubView(s, { ...ui(s), cseg: 'market' });
  assert.ok(c.includes('닫힘'));
  const bl = G.newGame(2, T0, 'bl'); G.chooseClub(bl, 0, T0);
  assert.ok(V.clubView(bl, { ...ui(bl), cseg: 'market', msub: 'loan' }).includes('게임 설정'));
  const p = G.userTeam(bl).players[3]; G.listPlayer(bl, p.id, 1); G.processOffers(bl, { chance: () => true, next: () => 0.5, pick: (a) => a[0] });
  const m = V.clubView(bl, { ...ui(bl), cseg: 'market' });
  assert.ok(m.includes('accept-offer') && m.includes('reject-offer'));
});

test('구단 현황: 선수단 비용 비율 게이지와 규정 설명', () => {
  const e = G.newGame(2, T0, 'epl'); G.chooseClub(e, 2, T0);
  const h = V.clubView(e, ui(e));
  assert.ok(h.includes('선수단 비용 비율') && h.includes('85%') && h.includes('승점 삭감'));
  const b = G.newGame(2, T0, 'bl'); G.chooseClub(b, 2, T0);
  assert.ok(V.clubView(b, ui(b)).includes('경고만'));
});

test('리그 탭: 규칙 설명과 구역 표시(승격/플레이오프/강등/대륙 대회)', () => {
  const s = G.newGame(2, T0, 'epl'); G.chooseClub(s, 2, T0);
  const t = V.leagueView(s, { ...ui(s), ldiv: 0 });
  assert.ok(t.includes('38라운드') && t.includes('강등 3팀') && t.includes('z-down') && t.includes('z-cont'));
  const t2 = V.leagueView(s, { ...ui(s), ldiv: 1 });
  assert.ok(t2.includes('46라운드') && t2.includes('z-up') && t2.includes('z-po'));
  const k = G.newGame(2, T0, 'kl'); G.chooseClub(k, 0, T0);
  assert.ok(V.leagueView(k, { ...ui(k), ldiv: 1 }).includes('32라운드') === false);
  assert.ok(V.leagueView(k, { ...ui(k), ldiv: 1 }).includes('34라운드'));
});

test('선수 시트: 능력치 24개(골키퍼는 골키퍼 능력치 포함), CA/PA, 계약, 이적 동작 버튼', () => {
  const s = G.newGame(3, T0, 'epl'); G.chooseClub(s, 2, T0);
  const me = G.userTeam(s);
  const fw = me.players.find((p) => p.pos === 'ST'), gk = me.players.find((p) => p.pos === 'GK');
  const a = V.playerSheet(s, fw.id, 'own');
  assert.ok(a.includes('골 결정력') && !a.includes('반사신경'));
  assert.ok(V.playerSheet(s, gk.id, 'own').includes('반사신경'));
  for (const t of ['즉시 매각', '이적 등록', '임대 보내기', '방출']) assert.ok(a.includes(t), t);
  assert.ok(/PA \d+/.test(a));
  const m = G.marketPlayers(s)[0].p;
  const ms = V.playerSheet(s, m.id, 'market');
  assert.ok(ms.includes('data-act="buy"') && /PA \d+~\d+/.test(ms), 'PA 범위로 표시');
});

test('유망주 등급 표시와 기대주 라벨 데이터가 있다', async () => {
  const { HYPE_LABEL, HYPE_STARS } = await import('../src/player.js');
  assert.deepEqual(HYPE_LABEL, ['', '기대주', '유망주', '특급 유망주', '세계적 재능']);
  assert.equal(HYPE_STARS(3), '★★★');
  assert.equal(HYPE_STARS(0), '');
});

test('서식/보안 함수', () => {
  assert.equal(fmtMoney(500), '500만');
  assert.equal(fmtMoney(12500), '1.3억');
  assert.equal(fmtMoney(2028000), '203억');
  assert.equal(fmtMoney(-2500), '-2,500만');
  assert.equal(fmtClock(3661_000), '1:01:01');
  assert.equal(fmtClock(61_000), '01:01');
  assert.equal(esc('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  const f = fuzz(123); assert.ok(f >= -1 && f <= 1); assert.equal(fuzz(123), f);
});

test('중계 중에는 경기 전 스냅샷을 보여 준다', async () => {
  const V2 = await import('../src/views.js');
  const s = { money: 5, latest: { x: 1 } };
  const before = { money: 1, latest: { x: 0 } };
  assert.equal(V2.displayState(s, { live: { min: 3 }, before }).money, 1);
  assert.equal(V2.displayState(s, { live: { min: 3 }, before }).latest.x, 1);
  assert.equal(V2.displayState(s, { live: null, before }), s);
});
