// 상태 -> HTML 문자열. DOM을 건드리지 않는 순수 함수라서 Node에서 테스트할 수 있다.
import { esc, fmtMoney, fmtAvg, fmtIP, fmtEra, fmtClock, f1, avatar } from './util.js';
import { LEAGUES, COUNTRIES, POS_LABEL, STAT_LABEL, HIT_STATS, PIT_STATS } from './data.js';
import { HYPE_LABEL, HYPE_STARS, marketWage } from './player.js';
import { ROUND_NAME, seriesOver } from './league.js';
import * as G from './game.js';
import { CSV_TEMPLATE } from './pack.js';

const ICONS = {
  home: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>',
  roster: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.9.3 5 2.6 5 5.8"/>',
  league: '<path d="M5 20V11M12 20V4M19 20v-6M3 20h18"/>',
  market: '<path d="M4 8h16l-1.5 11h-13zM8 8V6a4 4 0 0 1 8 0v2"/>',
  club: '<path d="M3 21h18M5 21V9.5L12 4l7 5.5V21M10 21v-6h4v6"/>',
};
export const TABS = [['home', '경기'], ['roster', '선수단'], ['league', '리그'], ['market', '시장'], ['club', '구단']];
export const navHTML = (tab, badge = 0) =>
  TABS.map(([id, label]) => `<button class="tab${id === tab ? ' on' : ''}" data-act="tab" data-tab="${id}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg><span>${label}</span>${id === 'market' && badge ? `<i class="badge">${badge}</i>` : ''}</button>`).join('');

const ERR = {
  window: '지금은 트레이드할 수 없습니다 (마감 이후)', money: '자금이 부족합니다', full: '선수단이 가득 찼습니다', min: '선수단 최소 인원 아래로 줄일 수 없습니다',
  locked: '영입·교환한 지 얼마 안 된 선수는 잠시 거래할 수 없습니다', foreign: '외국인 선수 보유 한도를 넘습니다', notfound: '대상을 찾을 수 없습니다', max: '최대 레벨입니다',
  value: '상대 구단이 가치가 부족하다고 봅니다', bid: '금액을 확인하세요', rosterAI: '상대 구단의 선수단 인원 한도를 넘습니다', payAI: '상대 구단이 연봉 부담을 못 받아들입니다', empty: '교환할 선수를 양쪽에서 고르세요',
  toomany: '한 번에 최대 3명까지입니다', injured: '부상 중인 선수는 1군에 올릴 수 없습니다', phase: '지금은 할 수 없습니다', turn: '아직 내 지명 차례가 아닙니다',
};
export const errText = (r) => ERR[r.err] || '할 수 없습니다';
const grp = (pos) => (pos === 'C' ? 'C' : ['1B', '2B', '3B', 'SS'].includes(pos) ? 'IF' : ['LF', 'CF', 'RF'].includes(pos) ? 'OF' : pos);
const cls = (v) => (v >= 75 ? 'a4' : v >= 60 ? 'a3' : v >= 45 ? 'a2' : 'a1');

// ───────── 시작 화면 ─────────
export function leagueSelectView(ui = {}) {
  const info = {
    mlb: 'AL·NL 각 3개 지구 · 정규 162경기 · 포스트시즌 12팀 · 사치세(CBT $244M) · 26인 엔트리',
    kbo: '정규 144경기 · 포스트시즌 5팀 · 경쟁균형세(상한 143.97억) · 외국인 3+아시아쿼터 1 · 29인 엔트리',
  };
  const cards = COUNTRIES.map((c) => {
    const L = LEAGUES[c];
    return `<li><button class="rowbtn big" data-act="pick-league" data-id="${c}"><span class="grow"><b>${L.name}</b>${L.name === L.long ? '' : ` <span class="mute">${L.long}</span>`}<small>${L.teams.length}팀 · ${info[c]}</small></span><span class="chev">›</span></button></li>`;
  }).join('');
  return `<section class="head"><div><span class="eyebrow">새 게임</span><h2>리그를 고르세요</h2></div></section>
  <p class="mute">구단은 <b>2026 시즌 실제 구단</b>입니다. 선수는 실제 로스터를 <b>근사해서</b> 만든 이름 변형 선수(주요 선수만)와 가상 선수가 섞여 있습니다. 직접 구한 CSV는 아래 데이터 팩으로 가져올 수 있습니다.</p>
  <div class="card" style="margin-top:12px"><div class="row between"><div><b>실제 기반 명단 사용</b><small>2026 시즌 로스터를 웹 검색으로 추정해 만든 근사 명단입니다. 이름은 한 글자씩 바꿨고 능력은 성적·평판으로 판단한 근사값입니다. 꺼두면 전부 가상 선수입니다.</small></div><button class="btn small${ui.realRoster ? '' : ' ghost'}" data-act="toggle-real">${ui.realRoster ? '켜짐' : '꺼짐'}</button></div></div>
  <ul class="list" style="margin-top:12px">${cards}</ul>
  <h3>내 데이터 가져오기 <small class="mute" style="display:inline">선택</small></h3>
  <div class="card"><div class="row between"><div><b>실제 선수 데이터 팩</b><small>CSV/JSON으로 이름·나이·포지션·능력·유망주 등급·연봉을 반영합니다.</small></div><button class="btn small" data-act="import-open">가져오기</button></div></div>`;
}
export function clubSelectView(s, ui) {
  const L = G.Lof(s);
  const ts = s.teams.slice().sort((a, b) => G.teamOvr(b).total - G.teamOvr(a).total);
  const rows = ts.map((t, i) => `<li><button class="rowbtn" data-act="pick-club" data-id="${t.id}"><i class="dot" style="background:${t.color}"></i><span class="grow">${esc(t.name)}<small>${L.id === 'mlb' ? L.divs[t.div] + ' · ' : ''}전력 ${Math.round(G.teamOvr(t).total)} · 연봉 ${m(s, G.payroll(t))} · 시장 ${t.mkt >= 1.4 ? '대' : t.mkt >= 0.95 ? '중' : '소'}</small></span><span class="tag2">${i < ts.length / 3 ? '강팀' : i < (ts.length * 2) / 3 ? '중위' : '약팀'}</span></button></li>`).join('');
  return `<section class="head"><div><span class="eyebrow">${L.name}</span><h2>구단을 고르세요</h2></div><button class="btn small ghost" data-act="back-league">뒤로</button></section>
  <div class="card"><div class="row between"><div><b>방치형 자동 진행</b><small>시즌이 끝나면 재계약·FA·드래프트를 어시스턴트가 처리하고 다음 시즌을 자동으로 시작합니다</small></div><button class="btn small${ui.autopilot ? '' : ' ghost'}" data-act="setup-auto">${ui.autopilot ? '켜짐' : '꺼짐'}</button></div></div>
  <p class="mute small">강팀은 선수가 좋지만 연봉이 큽니다. 시장이 작은 구단은 돈이 적어 유망주를 키우고 트레이드를 잘 해야 합니다.</p><ul class="list">${rows}</ul>`;
}

const m = (s, v) => fmtMoney(s.country, v);
const sgn = (s, v) => (v >= 0 ? '+' : '') + m(s, v);

// ───────── 스코어보드 ─────────
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);
export function boardHTML(vm) {
  const n = Math.max(9, vm.away.length, vm.home.length);
  const cols = Array.from({ length: n }, (_, i) => i);
  const cell = (v) => (v === null || v === undefined ? '<td class="x">·</td>' : `<td${v > 0 ? ' class="run"' : ''}>${v}</td>`);
  const row = (name, arr, hits, mine) => `<tr${mine ? ' class="me"' : ''}><th>${esc(name)}</th>${cols.map((i) => (i < arr.length ? cell(arr[i]) : '<td class="x"></td>')).join('')}<td class="tot">${sum(arr)}</td><td class="tot">${hits}</td></tr>`;
  return `<div class="board" role="table" aria-label="스코어보드"><table><thead><tr><th></th>${cols.map((i) => `<td>${i + 1}</td>`).join('')}<td class="tot">R</td><td class="tot">H</td></tr></thead><tbody>${row(vm.awayName, vm.away, vm.hitsA, vm.awayMine)}${row(vm.homeName, vm.home, vm.hitsH, vm.homeMine)}</tbody></table></div>`;
}
export function boardFromEntry(s, e) {
  return { awayName: s.teams[e.awayId].short, homeName: s.teams[e.homeId].short, away: e.line.away, home: e.line.home, hitsA: e.hits.away, hitsH: e.hits.home, awayMine: e.awayId === s.userId, homeMine: e.homeId === s.userId };
}
export function boardFromPlays(s, e, n) {
  const away = [], home = [];
  let ha = 0, hh = 0;
  for (const p of e.plays.slice(0, n)) {
    const arr = p.half === 0 ? away : home;
    while (arr.length < p.inn) arr.push(0);
    arr[p.inn - 1] += p.runs;
    if (p.hit) p.half === 0 ? ha++ : hh++;
  }
  return { ...boardFromEntry(s, e), away, home, hitsA: ha, hitsH: hh };
}
export const playLine = (p) => `<li class="${p.runs ? 'score' : ''}${p.change ? ' chg' : ''}"><b>${p.inn}회${p.half ? '말' : '초'}</b><span>${esc(p.text)}</span></li>`;

// ───────── 경기 탭 ─────────
const NEWS_TAG = { match: '경기', injury: '부상', trade: '트레이드', contract: '계약', finance: '재정', season: '시즌', draft: '드래프트', info: '안내' };
const newsRow = (n) => `<li><span class="nt ${n.kind}">${NEWS_TAG[n.kind] || '소식'}</span><span class="grow">${esc(n.text)}<small>${n.season}시즌</small></span></li>`;
const fcs = (arr) => arr.slice(-5).map((r) => `<span class="fc ${r}">${r === 'W' ? '승' : r === 'L' ? '패' : '무'}</span>`).join('') || '<span class="mute">-</span>';

export function homeView(s, ui, now) {
  if (s.phase === 'offseason') return offseasonView(s, ui);
  const L = G.Lof(s), me = G.userTeam(s);
  const st = G.standings(s);
  const mine = st.find((r) => r.id === s.userId);
  const nx = G.nextOpponent(s);
  const pv = nx ? G.preview(s) : null;
  const iv = G.intervalMs(s);
  const left = Math.max(0, (s.nextGameAt || now) - now);
  const prog = Math.min(100, Math.max(0, (1 - left / iv) * 100));
  const live = ui.live, e = s.latest;
  const hide = false;
  const opp = nx ? s.teams[nx.h === s.userId ? nx.a : nx.h] : null;
  const phaseLabel = s.phase === 'regular' ? `정규시즌 ${me.w + me.l + (me.d || 0)}/${L.games}` : s.phase === 'playoffs' ? ROUND_NAME[s.country][s.playoff.round] : '';
  const report = ui.report ? `<section class="card report"><div><b>자리를 비운 동안</b><p>${ui.report.games}경기 · ${ui.report.w}승 ${ui.report.d ? ui.report.d + '무 ' : ''}${ui.report.l}패${ui.report.seasons ? ` · ${ui.report.seasons}시즌 자동 진행` : ''} · 자금 ${sgn(s, ui.report.money)}${ui.report.skipped ? '<br><span class="mute">밀린 경기가 많아 일부만 반영되었습니다.</span>' : ''}</p></div><button class="btn small ghost" data-act="dismiss-report">확인</button></section>` : '';
  const offers = s.offers.length ? `<section class="card alert"><div class="row between"><div><b>트레이드 제안 ${s.offers.length}건</b><small>시장 탭 → 제안에서 확인하세요</small></div><button class="btn small" data-act="goto-offers">보기</button></div></section>` : '';
  const nudge = ui.backupNudge ? `<section class="card alert"><div class="row between"><div><b>백업을 권장합니다</b><small>iOS가 웹 데이터를 지울 수 있어서 가끔 백업해 두세요</small></div><div class="oact"><button class="btn small" data-act="backup">백업</button><button class="btn small ghost" data-act="dismiss-nudge">나중에</button></div></div></section>` : '';
  const bad = G.validateRoster(me, L);
  const debt = s.money < 0 ? `<section class="card alert"><b>자금이 마이너스입니다</b><small>FA 영입과 시설 투자가 막힙니다. 방출·트레이드로 연봉을 줄이세요.</small></section>` : '';
  const warn = bad.length ? `<section class="card alert"><b>엔트리 확인</b><small>${bad.map(esc).join('<br>')}</small></section>` : '';
  const sp = nx && s.phase === 'regular' ? G.nextStarterOf(s, s.userId) : null;
  const osp = opp && s.phase === 'regular' ? G.nextStarterOf(s, opp.id) : null;
  let board = '';
  if (e) board = live ? boardFromPlays(s, e, live.shown) : boardFromEntry(s, e);
  const recent = s.history.games.slice(0, 6);
  const shownStreak = s.streak;
  const po = s.phase === 'playoffs' ? s.playoff : null;
  const sr = nx && nx.sr;
  return `${nudge}${report}${offers}${debt}${warn}
  <section class="head"><div><span class="eyebrow">${G.seasonLabel(s)} · ${phaseLabel}</span><h2>${esc(me.name)}</h2></div><div class="rec"><b>${hide ? '-' : mine.rank}</b>위</div></section>
  <section class="stats4"><div><span>성적</span><b>${me.w}-${me.l}${me.d ? '-' + me.d : ''}</b></div><div><span>승률</span><b>${(me.w + me.l ? me.w / (me.w + me.l) : 0).toFixed(3).replace(/^0/, '')}</b></div><div><span>최근 5경기</span><b class="fcs">${fcs(shownStreak)}</b></div><div><span>자금</span><b>${m(s, s.money)}</b></div></section>
  <section class="card next">
    <div class="row between"><span class="eyebrow">${nx ? `다음 경기 · ${nx.home ? '홈' : '원정'}${sr ? ` · ${sr.w[0]}-${sr.w[1]} (${sr.bestOf}전)` : ''}` : '경기 없음'}</span><span class="clock" id="cd">${fmtClock(left)}</span></div>
    <div class="bar"><i id="cdbar" style="width:${prog.toFixed(1)}%"></i></div>
    <p class="vs">${opp ? `vs <b>${esc(opp.name)}</b> <span class="mute">(${st.find((r) => r.id === opp.id).rank}위)</span>` : '<span class="mute">대기 중</span>'}</p>
    ${sp || osp ? `<p class="meta">선발: <b>${sp ? esc(sp.name) : '-'}</b> (${sp ? G.ovrOf(sp) : '-'}) vs <b>${osp ? esc(osp.name) : '-'}</b> (${osp ? G.ovrOf(osp) : '-'})</p>` : ''}
    ${pv ? `<div class="odds"><i class="w" style="width:${Math.round(pv.user * 100)}%"></i><i class="l" style="width:${100 - Math.round(pv.user * 100)}%"></i></div><div class="oddsl"><span>승 ${Math.round(pv.user * 100)}%</span><span>패 ${100 - Math.round(pv.user * 100)}%</span></div>` : ''}
    <div class="skip"><button class="btn" data-act="play" data-n="1">계속 ▶</button><button class="btn ghost" data-act="play" data-n="7">7경기</button><button class="btn ghost" data-act="play" data-n="9999">시즌 끝까지</button></div>
    <p class="meta">남은 ${s.phase === 'regular' ? G.gamesLeft(s) + '경기' : '포스트시즌'} · 앱을 닫아도 ${s.intervalMin}분마다 한 경기씩 자동으로 진행됩니다.${po && po.userOut ? ' <b>탈락했습니다.</b>' : ''}${!po && L.id === 'mlb' ? ` ${L.divs[me.div]} ${mine.gb ? `선두와 ${mine.gb}게임 차` : ''}` : ''}</p>
  </section>
  <section><h3>${live ? '중계 중' : '지난 경기'}</h3>${e ? `<div id="match">${matchPanel(s, e, live, board)}</div>${live ? '<button class="btn small ghost" data-act="skip-live">중계 건너뛰기</button>' : ''}` : '<p class="empty">첫 경기를 기다리는 중입니다. <b>계속 ▶</b>를 누르면 바로 시작합니다.</p>'}</section>
  ${s.news.length ? `<section><h3>소식</h3><ul class="list news">${s.news.slice(0, 4).map(newsRow).join('')}</ul></section>` : ''}
  ${recent.length ? `<section><h3>경기 기록</h3><ul class="list results">${recent.map((g) => `<li><span class="tag ${g.res === 1 ? 'w' : g.res === 0 ? 'd' : 'l'}">${g.res === 1 ? '승' : g.res === 0 ? '무' : '패'}</span><span class="grow">${g.home ? '' : '@ '}${esc(s.teams[g.oppId].name)}<small>${esc(g.label)}${g.wp ? ` · 승 ${esc(g.wp)}${g.lp ? ` 패 ${esc(g.lp)}` : ''}` : ''}</small></span><b class="num">${g.us}:${g.them}</b></li>`).join('')}</ul></section>` : ''}`;
}
export function matchPanel(s, e, live, board) {
  const plays = live ? e.plays.slice(0, live.shown) : e.key;
  const final = !live;
  const meta = final ? `<p class="meta">${e.innings > 9 ? `${e.innings}회 연장 · ` : ''}${e.walkoff ? '끝내기 · ' : ''}승 <b>${esc(e.wp || '무승부')}</b>${e.lp ? ` · 패 <b>${esc(e.lp)}</b>` : ''}${e.sv ? ` · 세 <b>${esc(e.sv)}</b>` : ''}<br>선발 ${esc(e.sp.away)} vs ${esc(e.sp.home)} · 손익 ${sgn(s, e.net)}</p>` : '';
  return `${boardHTML(board)}${meta}<ol class="plays" id="mevents">${(live ? plays.slice().reverse() : plays).map(playLine).join('') || '<li class="mute">득점 장면이 없었습니다.</li>'}</ol>`;
}

function offseasonView(s, ui) {
  const o = s.offseason, h = o.hist, me = G.userTeam(s), L = G.Lof(s);
  const exp = o.expiring.map((id) => me.players.find((p) => p.id === id)).filter(Boolean);
  const d = o.draft;
  const mineLeft = d ? d.order.slice(d.idx).filter((t) => t === s.userId).length : 0;
  return `<section class="head"><div><span class="eyebrow">${h.year} 시즌 종료 · ${h.po}</span><h2>오프시즌</h2></div><div class="rec"><b>${h.rank}</b>위</div></section>
  <section class="card">
    <div class="kv"><span>우승</span><b>${esc(h.champion)}</b></div>
    <div class="kv"><span>내 성적</span><b>${h.w}승 ${h.d ? h.d + '무 ' : ''}${h.l}패</b></div>
    ${h.bonus ? `<div class="kv"><span>포스트시즌 보너스</span><b>+${m(s, h.bonus)}</b></div>` : ''}
    ${h.penalty ? `<div class="kv"><span>${esc(h.penaltyName)}</span><b class="neg-t">-${m(s, h.penalty)}</b></div>` : ''}
    <div class="kv"><span>연봉 총액</span><b>${m(s, G.payroll(me))}${L.id === 'mlb' ? ` (CBT ${m(s, L.cbt)})` : ` (경쟁균형세 기준 ${m(s, G.capPayroll(me))} / ${m(s, L.cap)})`}</b></div>
    <div class="kv"><span>자금</span><b>${m(s, s.money)}</b></div>
  </section>
  <section><h3>올해의 기록</h3><div class="card">${[['홈런왕', ''], ].length ? '' : ''}${['hr', 'avg', 'w', 'k', 'sv'].map((k) => G.topList(s, k, 1)).map((l) => (l.rows[0] ? `<div class="kv"><span>${l.label}</span><b>${esc(l.rows[0].name)} (${esc(l.rows[0].team)}) ${l.rows[0].text}</b></div>` : '')).join('') || '<p class="mute">기록이 없습니다.</p>'}</div></section>
  ${exp.length ? `<section><h3>계약 만료 선수 <small class="mute" style="display:inline">${exp.length}명</small></h3><p class="mute">선수를 눌러 재계약하세요. 하지 않으면 FA로 팀을 떠납니다${s.settings.autopilot ? ' (자동 진행이 켜져 있으면 어시스턴트가 필요한 선수만 재계약합니다)' : ''}.</p><ul class="list">${exp.map((p) => playerRow(s, p)).join('')}</ul></section>` : ''}
  <section><h3>드래프트</h3><div class="card"><div class="row between"><div><b>${d && d.done ? '지명 완료' : `내 지명 ${mineLeft}번 남음`}</b><small>${d && !d.done ? (G.draftCurrent(d) === s.userId ? '지금 내 차례입니다' : '앞 순서가 진행 중입니다') : '신인은 2군에 합류합니다'}</small></div><button class="btn small" data-act="goto-draft">${d && d.done ? '결과 보기' : '지명하러 가기'}</button></div></div></section>
  <section class="actions"><button class="btn" data-act="next-season">다음 시즌 시작</button><button class="btn ghost" data-act="auto-next">어시스턴트에게 맡기고 시작</button><button class="btn ghost" data-act="goto-fa">FA 시장 보기</button></section>
  <p class="mute small">시작하면 모든 선수가 한 살 먹고 성장·노화가 반영되며, 은퇴 선수가 정리되고 AI 구단은 FA를 영입합니다.</p>`;
}

// ───────── 선수 행 / 선수단 탭 ─────────
export function statLine(p) {
  const x = p.s;
  if (!x) return '';
  if (p.role === 'H') {
    if (!x.pa) return '';
    const obp = (x.h + x.bb) / x.pa, slg = x.ab ? (x.h + x.d2 + 2 * x.d3 + 3 * x.hr) / x.ab : 0;
    return `${fmtAvg(x.h, x.ab)} ${x.hr}홈런 ${x.rbi}타점 OPS ${(obp + slg).toFixed(3).replace(/^0/, '')}`;
  }
  if (!x.outs) return '';
  return `${x.w}승 ${x.l}패${x.sv ? ` ${x.sv}세` : ''} ERA ${fmtEra(x.er, x.outs)} ${fmtIP(x.outs)}이닝 ${x.k}K`;
}
const status = (s, p) => (p.inj > 0 ? `<span class="st bad">부상 ${Math.ceil(p.inj)}일</span>` : '') + (p.fat > 55 ? '<span class="st warn">피로</span>' : '') + (p.fx ? `<span class="st loan">${p.fx === 2 ? '아쿼' : '외인'}</span>` : '') + (p.yrs <= 0 && s.phase === 'offseason' ? '<span class="st warn">만료</span>' : '');
const hypeTag = (p) => (p.hype && p.age <= 23 ? `<span class="st hype" title="${HYPE_LABEL[p.hype]}">${HYPE_STARS(p.hype)}</span>` : '');
export function playerRow(s, p, extra = '', src = '') {
  const est = G.potEstimate(s, p);
  return `<li><button class="rowbtn" data-act="player" ${src ? `data-src="${src}"` : ''} data-pid="${p.id}"><span class="pos ${grp(p.pos)}">${p.pos}</span><span class="grow">${esc(p.name)} ${status(s, p)}${hypeTag(p)}<small>${p.age}세 · ${extra || statLine(p) || `연봉 ${m(s, p.sal)} · ${p.yrs}년`}</small></span><span class="ca"><b>${G.ovrOf(p)}</b><i>/${est.err ? `${est.lo}~${est.hi}` : est.mid}</i></span></button></li>`;
}
export function rosterView(s, ui) {
  const L = G.Lof(s), me = G.userTeam(s);
  const seg = ui.rseg || 'H';
  const c = G.roleCounts(s);
  let body = '';
  if (seg === 'H' || seg === 'P') {
    const list = me.players.filter((p) => p.act && (seg === 'H' ? p.role === 'H' : p.role === 'P')).sort((a, b) => (seg === 'P' ? (a.pos === b.pos ? G.ovrOf(b) - G.ovrOf(a) : a.pos === 'SP' ? -1 : 1) : G.ovrOf(b) - G.ovrOf(a)));
    body = `<ul class="list roster">${list.map((p) => playerRow(s, p)).join('')}</ul>`;
  } else if (seg === 'F') {
    const list = me.players.filter((p) => !p.act).sort((a, b) => b.pot - a.pot);
    body = `<ul class="list roster">${list.map((p) => playerRow(s, p)).join('') || '<li class="mute">2군 선수가 없습니다.</li>'}</ul><p class="mute small">2군 선수를 눌러 1군으로 올릴 수 있습니다. 부상 선수는 올릴 수 없습니다.</p>`;
  } else {
    const lu = G.lineupOf(s);
    const rot = G.rotationInfo(s);
    const pen = me.players.filter((p) => p.pos === 'RP' && p.act).sort((a, b) => G.ovrOf(b) - G.ovrOf(a));
    body = `<div class="card"><div class="row between"><div><b>자동 라인업</b><small>${me.auto ? '켜짐: 매 경기 컨디션·부상을 보고 최적 라인업' : '꺼짐: 직접 정한 선수 우선(뛸 수 없으면 대체)'}</small></div><button class="btn small${me.auto ? '' : ' ghost'}" data-act="auto-lineup">${me.auto ? '켜짐' : '꺼짐'}</button></div></div>
    <h3>오늘의 타순</h3><ul class="list">${lu.map((x, i) => `<li><button class="rowbtn" data-act="slot" data-pos="${x.pos}"><span class="no">${i + 1}</span><span class="pos ${grp(x.pos)}">${x.pos}</span><span class="grow">${esc(x.p.name)}<small>${x.p.pos !== x.pos && x.pos !== 'DH' ? `본포지션 ${x.p.pos} · ` : ''}컨택 ${x.p.con} 파워 ${x.p.pow} 선구 ${x.p.eye} 주력 ${x.p.spd} 수비 ${x.p.fld}</small></span><span class="ca"><b>${G.ovrOf(x.p)}</b></span></button></li>`).join('')}</ul>
    <h3>선발 로테이션</h3><ul class="list">${rot.map((r, i) => `<li><button class="rowbtn" data-act="player" data-pid="${r.p.id}"><span class="no">${i + 1}</span><span class="grow">${esc(r.p.name)} ${status(s, r.p)}<small>구위 ${r.p.stf} 제구 ${r.p.ctl} 체력 ${r.p.sta} · ${r.p.inj > 0 ? '부상' : r.ready ? '등판 가능' : `휴식 ${r.p.rest}일째`}</small></span><span class="ca"><b>${G.ovrOf(r.p)}</b></span></button></li>`).join('')}</ul>
    <h3>불펜</h3><ul class="list">${pen.map((p, i) => `<li><button class="rowbtn" data-act="player" data-pid="${p.id}"><span class="no">${i === 0 ? '마' : ''}</span><span class="grow">${esc(p.name)} ${status(s, p)}<small>${i === 0 ? '마무리 · ' : ''}피로 ${Math.round(p.fat)}%</small></span><span class="ca"><b>${G.ovrOf(p)}</b></span></button></li>`).join('')}</ul>`;
  }
  const bad = G.validateRoster(me, L);
  return `<section class="head"><div><span class="eyebrow">1군 ${c.total}/${L.active} · 전체 ${me.players.length}/${G.rosterMax(s)} · 평균 ${Math.round(G.teamOvr(me).total)}</span><h2>선수단</h2></div><div class="rec">연봉 <b>${m(s, G.payroll(me))}</b></div></section>
  <div class="seg">${[['H', '타자'], ['P', '투수'], ['F', '2군'], ['L', '라인업']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="rseg" data-v="${k}">${l}</button>`).join('')}</div>
  ${bad.length ? `<div class="card alert"><small>${bad.map(esc).join('<br>')}</small></div>` : ''}
  <div class="card"><div class="row between"><div><b>어시스턴트 엔트리 관리</b><small>${s.settings.autoRoster ? '켜짐: 부상·회복 시 1군을 자동으로 정리' : '꺼짐: 직접 1군/2군을 관리'}</small></div><div class="oact"><button class="btn small${s.settings.autoRoster ? '' : ' ghost'}" data-act="setting" data-key="autoRoster">${s.settings.autoRoster ? '켜짐' : '꺼짐'}</button><button class="btn small ghost" data-act="auto-roster">지금 정리</button></div></div></div>
  ${body}
  <p class="mute small">오른쪽 숫자는 <b>현재 능력 / 잠재력</b>(최대 99)입니다. 다른 팀 선수의 잠재력은 스카우트 수준에 따라 범위로 보입니다. ★은 유망주 등급입니다.</p>`;
}

export function playerSheet(s, pid, src = 'own') {
  let p = null, t = null;
  for (const tm of s.teams) { const x = tm.players.find((q) => q.id === pid); if (x) { p = x; t = tm; } }
  if (!p) p = s.market.free.find((q) => q.id === pid) || s.market.foreign.find((q) => q.id === pid);
  if (!p && s.offseason && s.offseason.draft) p = s.offseason.draft.pool.find((q) => q.id === pid);
  if (!p) return '';
  const L = G.Lof(s), me = G.userTeam(s);
  const own = me.players.includes(p);
  const est = G.potEstimate(s, p);
  const ovr = G.ovrOf(p);
  const keys = p.role === 'H' ? HIT_STATS : PIT_STATS;
  const attrs = keys.map((k) => `<div class="ar"><span>${STAT_LABEL[k]}</span><b class="${cls(p[k])}">${p[k]}</b></div>`).join('');
  const lock = G.lockLeft(s, p);
  let act = '<button class="btn" data-act="close">닫기</button>';
  if (own) {
    const bs = [];
    if (s.phase === 'offseason' && p.yrs <= 0) {
      for (const y of [1, 2, 3, 5].filter((y) => y <= G.maxYears(p))) bs.push(`<button class="btn" data-act="extend" data-pid="${p.id}" data-y="${y}">${y}년 재계약 · 연봉 ${m(s, G.extendQuote(s, p, y))}</button>`);
    }
    bs.push(p.act ? `<button class="btn ghost" data-act="demote" data-pid="${p.id}">2군으로 내리기</button>` : `<button class="btn" data-act="promote" data-pid="${p.id}">1군으로 올리기</button>`);
    bs.push(`<button class="btn ghost" data-act="trade-with" data-pid="${p.id}">트레이드 카드에 올리기</button>`);
    bs.push(`<button class="btn ghost danger" data-act="release" data-pid="${p.id}">방출 (위약금 ${m(s, G.releaseCost(s, p))})</button>`);
    bs.push('<button class="btn" data-act="close">닫기</button>');
    act = bs.join('');
  } else if (src === 'free' || src === 'foreign') {
    const ys = [1, 2, 3, 5].filter((y) => y <= G.maxYears(p));
    act = ys.map((y) => `<button class="btn${y === 1 ? '' : ' ghost'}" data-act="sign" data-src="${src}" data-pid="${p.id}" data-y="${y}">${y}년 계약 · 연봉 ${m(s, G.askSalary(s, p))}</button>`).join('') + '<button class="btn ghost" data-act="close">닫기</button>';
  } else if (src === 'draft') {
    const turn = s.offseason && s.offseason.draft && G.draftCurrent(s.offseason.draft) === s.userId;
    act = `${turn ? `<button class="btn" data-act="draft-pick" data-pid="${p.id}">지명하기</button>` : '<p class="mute small">내 지명 차례에 지명할 수 있습니다.</p>'}<button class="btn ghost" data-act="close">닫기</button>`;
  } else if (t && t.id !== s.userId) act = `<button class="btn" data-act="trade-with-ai" data-tid="${t.id}" data-pid="${p.id}">이 선수 트레이드 알아보기</button><button class="btn ghost" data-act="close">닫기</button>`;
  const x = p.s;
  return `<header class="sheet-h">${avatar(p)}<div class="grow"><h2>${esc(p.name)}</h2><span class="mute">${POS_LABEL[p.pos]} · ${p.age}세${t && !own ? ` · ${esc(t.name)}` : ''}${p.fx ? ` · ${p.fx === 2 ? '아시아쿼터' : '외국인'}` : ''}</span>${p.hype && p.age <= 23 ? `<div class="hypeline">${HYPE_STARS(p.hype)} ${HYPE_LABEL[p.hype]} <span class="mute">(시장·언론의 기대 등급)</span></div>` : ''}</div><div class="big"><b>${ovr}</b><small>/ 잠재 ${est.err ? `${est.lo}~${est.hi}` : est.mid}</small></div></header>
  <div class="gauge"><i style="width:${ovr}%"></i><u style="left:${est.mid}%"></u></div>
  <div class="kvs"><div><span>상태</span><b>${p.inj > 0 ? `부상 ${Math.ceil(p.inj)}일` : '정상'}</b></div><div><span>연봉</span><b>${m(s, p.sal)}</b></div><div><span>계약</span><b>${p.yrs > 0 ? `${p.yrs}년` : '만료'}</b></div><div><span>${L.id === 'mlb' ? '서비스' : '등록'}</span><b>${p.svc}년${p.svc >= L.faAt ? ' (FA)' : ''}</b></div><div><span>시장 연봉</span><b>${m(s, marketWage(L, ovr, p.age))}</b></div><div><span>트레이드 가치</span><b>${Math.round(G.tradeValue(L, p))}</b></div></div>
  ${x && (x.pa || x.outs) ? `<p class="meta">시즌 기록: ${statLine(p)}</p>` : ''}${lock ? `<p class="mute small">거래 제한: ${lock}일 뒤 가능</p>` : ''}
  <h3>능력치 <small class="mute" style="display:inline">20~99</small></h3><div class="attrs">${attrs}</div>
  <div class="actions col">${act}</div>`;
}
export function slotPicker(s, pos) {
  const me = G.userTeam(s);
  const cands = me.players.filter((p) => p.role === 'H' && p.inj <= 0).map((p) => ({ p, v: Math.round(slotScoreOf(p, pos)) })).sort((a, b) => b.v - a.v);
  return `<header class="sheet-h"><div><h2>${POS_LABEL[pos]}</h2><span class="mute">이 자리에서 뛸 선수를 고르세요</span></div></header>
  <ul class="list">${cands.map(({ p, v }) => `<li><button class="rowbtn" data-act="set-slot" data-pos="${pos}" data-pid="${p.id}"><span class="pos ${grp(p.pos)}">${p.pos}</span><span class="grow">${esc(p.name)} ${status(s, p)}<small>${p.act ? '1군' : '2군(자동 1군 합류 안 함)'} · 이 자리 적합도 ${v}</small></span><span class="ca"><b>${G.ovrOf(p)}</b></span></button></li>`).join('')}</ul>
  <div class="actions"><button class="btn ghost" data-act="close">닫기</button></div>`;
}
import { slotScore as slotScoreOf } from './player.js';

// ───────── 리그 탭 ─────────
const stRow = (s, r, cut) => `<tr class="${r.id === s.userId ? 'me ' : ''}${cut ? 'cut' : ''}"><td class="rk">${r.rank}</td><td class="nm"><i style="background:${r.color}"></i>${esc(r.short)}</td><td>${r.w}</td><td>${r.l}</td>${s.country === 'kbo' ? `<td>${r.d}</td>` : ''}<td>${r.pct.toFixed(3).replace(/^0/, '')}</td><td>${r.gb ? r.gb : '-'}</td><td>${r.rs - r.ra > 0 ? '+' : ''}${r.rs - r.ra}</td></tr>`;
const stTable = (s, rows, head, cutAfter) => `<h3>${head}</h3><div class="tablewrap"><table class="standings"><thead><tr><th></th><th class="nm">팀</th><th>승</th><th>패</th>${s.country === 'kbo' ? '<th>무</th>' : ''}<th>승률</th><th>차</th><th>득실</th></tr></thead><tbody>${rows.map((r, i) => stRow(s, r, cutAfter && i === cutAfter - 1)).join('')}</tbody></table></div>`;
export function leagueView(s, ui) {
  const L = G.Lof(s);
  const seg = ui.lseg || 'table';
  let body = '';
  if (seg === 'table') {
    if (L.id === 'kbo') body = stTable(s, G.standings(s), 'KBO 순위', 5) + '<p class="mute small">상위 5팀이 포스트시즌에 진출합니다. 1위는 한국시리즈 직행, 4위는 와일드카드 결정전에서 1승 어드밴티지를 갖습니다.</p>';
    else {
      const lg = ui.llg || (G.userTeam(s).id < 15 ? 'AL' : 'NL');
      const ids = (x) => (lg === 'AL') === (x.id < 15);
      const divs = lg === 'AL' ? [0, 1, 2] : [3, 4, 5];
      body = `<div class="seg">${['AL', 'NL'].map((x) => `<button class="${lg === x ? 'on' : ''}" data-act="llg" data-v="${x}">${x}</button>`).join('')}</div>` +
        divs.map((d) => stTable(s, G.standingsOf(s, (r) => r.div === d), L.divs[d])).join('') +
        stTable(s, G.standingsOf(s, (r) => ids(r)), `${lg} 와일드카드 레이스 (전체 순위)`, 6) +
        '<p class="mute small">지구 우승 3팀 + 나머지 중 승률 상위 3팀이 포스트시즌에 갑니다(12팀). 위 표는 리그 전체 순위이며 6위 아래가 탈락권입니다.</p>';
    }
  } else if (seg === 'stats') {
    body = G.LEADER_KINDS.map((k) => G.topList(s, k, 5)).map((l) => `<h3>${l.label}</h3><ul class="list">${l.rows.map((r, i) => `<li class="${r.mine ? 'mine' : ''}"><button class="rowbtn" data-act="player" data-src="league" data-pid="${r.id}"><span class="no">${i + 1}</span><span class="grow">${esc(r.name)}<small>${esc(r.team)}</small></span><b class="num">${r.text}</b></button></li>`).join('') || '<li class="mute">기록이 없습니다.</li>'}</ul>`).join('');
  } else if (seg === 'po') {
    const po = s.playoff || (s.offseason ? null : null);
    body = po ? bracketHTML(s, po) : `<p class="empty">포스트시즌은 정규시즌이 끝나면 시작합니다.</p>`;
  } else {
    body = s.history.seasons.length ? `<ul class="list">${s.history.seasons.map((h) => `<li><span class="grow"><b>${h.year}</b> ${esc(h.champion)} 우승<small>내 성적 ${h.w}승 ${h.l}패 · ${h.rank}위 · ${h.po}${h.penalty ? ` · ${esc(h.penaltyName)} ${m(s, h.penalty)}` : ''}</small></span></li>`).join('')}</ul>` : '<p class="empty">아직 끝난 시즌이 없습니다.</p>';
  }
  return `<section class="head"><div><span class="eyebrow">${G.seasonLabel(s)}</span><h2>리그</h2></div></section>
  <div class="seg">${[['table', '순위'], ['stats', '기록'], ['po', '포스트시즌'], ['hist', '역대']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="lseg" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}
function bracketHTML(s, po) {
  const names = ROUND_NAME[s.country];
  return po.rounds.map((r, i) => `<h3>${names[i]}</h3><ul class="list">${r.map((sr) => {
    const a = s.teams[sr.a], b = s.teams[sr.b];
    return `<li class="${sr.a === s.userId || sr.b === s.userId ? 'mine' : ''}"><span class="grow">${esc(a.short)} vs ${esc(b.short)}<small>${sr.bestOf}전 ${Math.floor(sr.bestOf / 2) + 1}선승${seriesOver(sr) ? ` · ${esc(s.teams[sr.win].short)} 진출` : ''}</small></span><b class="num">${sr.w[0]}-${sr.w[1]}</b></li>`;
  }).join('')}</ul>`).join('') + (po.champion != null ? `<p class="card good"><b>우승</b> ${esc(s.teams[po.champion].name)}</p>` : '');
}

// ───────── 시장 탭 ─────────
export function badgeCount(s) { return s.offers.length; }
export function marketView(s, ui) {
  const L = G.Lof(s);
  const segs = [['trade', '트레이드'], ['fa', 'FA'], ...(L.foreign ? [['fx', '외국인']] : []), ['draft', '드래프트'], ['offers', `제안${s.offers.length ? ' ' + s.offers.length : ''}`]];
  const seg = ui.msub || 'trade';
  const open = G.tradeOpen(s);
  let body = '';
  if (seg === 'trade') {
    const ts = s.teams.filter((t) => t.id !== s.userId).sort((a, b) => G.teamOvr(b).total - G.teamOvr(a).total);
    body = `${open ? '' : '<p class="card alert">트레이드 마감 이후입니다. 오프시즌에 다시 열립니다.</p>'}<p class="mute small">구단을 고르고 서로 최대 3명까지 교환합니다. 상대가 가치를 더 받는다고 판단해야 성사됩니다. 한 번에 여러 명을 몰아주면 가치를 깎아서 봅니다.</p>
    <ul class="list">${ts.map((t) => `<li><button class="rowbtn" data-act="trade-open" data-tid="${t.id}"><i class="dot" style="background:${t.color}"></i><span class="grow">${esc(t.name)}<small>전력 ${Math.round(G.teamOvr(t).total)} · 연봉 ${m(s, G.payroll(t))}</small></span><span class="chev">›</span></button></li>`).join('')}</ul>`;
  } else if (seg === 'fa' || seg === 'fx') {
    const pool = seg === 'fx' ? s.market.foreign : s.market.free;
    const role = ui.frole || 'ALL';
    const list = pool.filter((p) => role === 'ALL' || (role === 'H' ? p.role === 'H' : p.role === 'P')).sort((a, b) => G.ovrOf(b) - G.ovrOf(a)).slice(0, 60);
    body = `<div class="seg small">${[['ALL', '전체'], ['H', '타자'], ['P', '투수']].map(([k, l]) => `<button class="${role === k ? 'on' : ''}" data-act="frole" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="mute small">${seg === 'fx' ? `외국인 ${G.foreignCount(G.userTeam(s), 1)}/${G.FOREIGN_MAX[1]} · 아시아쿼터 ${G.foreignCount(G.userTeam(s), 2)}/${G.FOREIGN_MAX[2]}` : `자유계약 선수 ${pool.length}명${s.phase === 'regular' ? ' · 시즌 중에는 요구 연봉이 낮아집니다' : ''}`}. 영입한 선수는 2군으로 들어오며, 한동안 거래할 수 없습니다.</p>
    <ul class="list roster">${list.map((p) => playerRow(s, p, `요구 연봉 ${m(s, G.askSalary(s, p))}`, seg === 'fx' ? 'foreign' : 'free')).join('') || '<li class="mute">선수가 없습니다.</li>'}</ul>`;
  } else if (seg === 'draft') {
    const d = s.offseason && s.offseason.draft;
    if (!d) body = '<p class="empty">드래프트는 시즌이 끝난 뒤 열립니다.</p>';
    else {
      const cur = G.draftCurrent(d);
      const list = d.pool.slice().sort((a, b) => G.potEstimate(s, b).mid + b.hype * 2 - (G.potEstimate(s, a).mid + a.hype * 2)).slice(0, 50);
      const mine = d.picks.filter((x) => x.teamId === s.userId).map((x) => me2(s, x.pid)).filter(Boolean);
      body = `<div class="card"><b>${d.done ? '드래프트 종료' : cur === s.userId ? '내 지명 차례입니다' : `${s.teams[cur].short} 지명 중`}</b><small>${Math.min(d.idx + 1, d.order.length)}/${d.order.length}번째 지명 · 내 남은 지명 ${d.order.slice(d.idx).filter((t) => t === s.userId).length}번</small>
      ${d.done ? '' : `<div class="actions"><button class="btn small" data-act="draft-run">앞 순서 진행</button><button class="btn small ghost" data-act="draft-auto">전부 자동 지명</button></div>`}</div>
      ${mine.length ? `<h3>내가 지명한 선수</h3><ul class="list roster">${mine.map((p) => playerRow(s, p)).join('')}</ul>` : ''}
      ${d.done ? '' : `<h3>지명 가능 선수 <small class="mute" style="display:inline">잠재력 기대순</small></h3><ul class="list roster">${list.map((p) => playerRow(s, p, `${p.pos === 'SP' || p.pos === 'RP' ? '투수' : '타자'}`, 'draft')).join('')}</ul>`}`;
    }
  } else {
    body = s.offers.length ? `<ul class="list offers">${s.offers.map((o) => {
      const ask = G.userTeam(s).players.find((p) => p.id === o.askId), ai = s.teams[o.teamId], give = o.giveIds.map((id) => ai.players.find((p) => p.id === id)).filter(Boolean);
      return `<li><span class="grow"><b>${esc(ai.name)}</b>가 <b>${ask ? esc(ask.name) : '?'}</b>(${ask ? G.ovrOf(ask) : ''})를 원합니다<small>대가: ${give.map((p) => `${esc(p.name)} ${p.pos} ${G.ovrOf(p)}/${G.potEstimate(s, p).mid} ${p.age}세`).join(', ')}</small></span><div class="oact"><button class="btn small" data-act="accept-offer" data-id="${o.id}">수락</button><button class="btn small ghost" data-act="reject-offer" data-id="${o.id}">거절</button></div></li>`;
    }).join('')}</ul>` : '<p class="empty">받은 제안이 없습니다. 좋은 선수를 가지고 있으면 AI 구단이 제안을 보냅니다.</p>';
  }
  return `<section class="head"><div><span class="eyebrow">${open ? '트레이드 가능' : '트레이드 마감'} · 자금 ${m(s, s.money)}</span><h2>시장</h2></div></section>
  <div class="seg wrap">${segs.map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="msub" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}
const me2 = (s, pid) => { for (const t of s.teams) { const p = t.players.find((x) => x.id === pid); if (p) return p; } return null; };

const formChips = (p) => { const f = G.valueFactors(p); return f.length ? ` <span class="st ${f[0].mul >= 1 ? 'good' : 'warn'}" title="${esc(f.map((x) => x.label).join(', '))}">${f[0].mul >= 1 ? '▲' : '▼'}${Math.round(Math.abs(f[0].mul - 1) * 100)}%</span>` : ''; };
export function tradeSheet(s, ui) {
  const tr = ui.trade;
  const ai = s.teams[tr.teamId], me = G.userTeam(s);
  const cash = Math.max(0, +tr.cash || 0);
  const chk = tr.give.size && tr.get.size ? G.tradeCheck(s, ai.id, [...tr.give], [...tr.get], cash) : null;
  const n = G.negOf(s, ai.id);
  const broken = n.until && G.dayOf(s) < n.until;
  const li = (p, set, side) => `<li><button class="rowbtn${set.has(p.id) ? ' sel' : ''}" data-act="trade-toggle" data-side="${side}" data-pid="${p.id}"><span class="pos ${grp(p.pos)}">${p.pos}</span><span class="grow">${esc(p.name)}${formChips(p)}<small>${p.age}세 · ${m(s, p.sal)}/${p.yrs}년${G.lockLeft(s, p) ? ` · 거래제한 ${G.lockLeft(s, p)}일` : ''}</small></span><span class="ca"><b>${G.ovrOf(p)}</b><i>/${G.potEstimate(s, p).mid}</i></span></button></li>`;
  const mine = me.players.slice().sort((a, b) => G.tradeValue(G.Lof(s), b) - G.tradeValue(G.Lof(s), a));
  const theirs = ai.players.slice().sort((a, b) => G.tradeValue(G.Lof(s), b) - G.tradeValue(G.Lof(s), a));
  const msg = !chk ? '양쪽에서 선수를 고르세요 (최대 3명씩)' : chk.ok ? `성사될 것 같습니다 · 상대가 보는 가치 ${f1(chk.ratio)}배` : chk.err === 'value' ? `아직 부족합니다 · 상대가 보는 가치 ${f1(chk.ratio)}배` : errText(chk);
  const log = (tr.log || []).map((l) => `<li class="${l.cls || ''}">${esc(l.text)}</li>`).join('');
  return `<header class="sheet-h"><div><h2>${esc(ai.name)}</h2><span class="mute">트레이드 협상</span></div></header>
  <div class="card ${chk && chk.ok ? 'good' : ''}"><b>${msg}</b><small>활약·부상 상태에 따라 선수 가치가 오르내립니다 (▲▼). 구단마다 요구하는 수준이 다릅니다. 부족하면 현금을 보태거나 역제안을 받을 수 있습니다.</small></div>
  ${log ? `<ul class="list tight neglog">${log}</ul>` : ''}
  ${broken ? `<div class="card alert"><b>협상이 중단되었습니다</b><small>${n.until - G.dayOf(s)}일 뒤에 다시 시도할 수 있습니다.</small></div>` : `<label class="field"><span>현금 보태기 (${s.country === 'kbo' ? '억 원' : '백만 달러'})</span><input id="tr-cash" type="number" inputmode="decimal" step="${s.country === 'kbo' ? 1 : 0.5}" min="0" value="${cash || ''}" placeholder="0" style="width:100%;font-size:16px"></label><p class="mute small">남은 협상 기회 ${Math.max(0, n.pat)}번</p>`}
  <h3>내가 보낼 선수 (${tr.give.size})</h3><ul class="list roster tight">${mine.slice(0, 40).map((p) => li(p, tr.give, 'give')).join('')}</ul>
  <h3>받을 선수 (${tr.get.size})</h3><ul class="list roster tight">${theirs.slice(0, 40).map((p) => li(p, tr.get, 'get')).join('')}</ul>
  <div class="actions"><button class="btn" data-act="trade-go" ${chk && !broken && chk.err !== 'window' ? '' : 'disabled'}>제안하기</button><button class="btn ghost" data-act="close">닫기</button></div>`;
}

// ───────── 구단 탭 ─────────
export function clubView(s, ui) {
  const L = G.Lof(s), me = G.userTeam(s);
  const seg = ui.cseg || 'fin';
  const rev = G.annualRevenue(s, me), pay = G.payroll(me), bud = G.budgetOf(s, me);
  let body = '';
  if (seg === 'fin') {
    const lim = L.id === 'mlb' ? L.cbt : L.cap, used = L.id === 'mlb' ? pay : G.capPayroll(me);
    body = `<section class="card"><div class="kv"><span>자금</span><b>${m(s, s.money)}</b></div><div class="kv"><span>연 수입(추정)</span><b>${m(s, rev)}</b></div><div class="kv"><span>연봉 총액</span><b>${m(s, pay)}</b></div><div class="kv"><span>예산 기준</span><b>${m(s, bud)}</b></div>
    <div class="kv"><span>${L.id === 'mlb' ? '사치세(CBT) 기준' : '경쟁균형세 기준(상위 40명, 외국인·신인 제외)'}</span><b class="${used > lim ? 'neg-t' : ''}">${m(s, used)} / ${m(s, lim)}</b></div>
    <div class="gauge"><i style="width:${Math.min(100, (used / lim) * 100)}%"></i></div>
    ${used > lim ? `<p class="mute small">초과 시 시즌 종료 때 ${L.id === 'mlb' ? '초과분에 구간별 세율(20~80%, 연속 초과 시 최대 110%)을 적용한 사치세를' : '초과분의 일부를 야구발전기금으로(비율은 게임 설정)'} 내야 합니다.</p>` : ''}
    <div class="kv"><span>인기(팬)</span><b>${Math.round(me.fan)}</b></div><div class="kv"><span>누적 순이익</span><b>${sgn(s, s.totals.earned)}</b></div></section>
    ${s.history.seasons.length ? `<h3>시즌별</h3><ul class="list">${s.history.seasons.slice(0, 5).map((h) => `<li><span class="grow">${h.year} · ${h.w}승 ${h.l}패<small>${h.po} · 연봉 ${m(s, h.payroll)}${h.penalty ? ` · ${esc(h.penaltyName)} ${m(s, h.penalty)}` : ''}</small></span></li>`).join('')}</ul>` : ''}`;
  } else if (seg === 'fac') {
    body = `<ul class="list">${Object.entries(G.FAC_INFO).map(([k, f]) => {
      const lv = s.fac[k], max = lv >= G.FAC_MAX, cost = G.facCost(s, k, lv);
      return `<li><span class="grow"><b>${f.name}</b> <span class="mute">Lv ${lv}/${G.FAC_MAX}</span><small>${f.desc}</small></span><button class="btn small" data-act="fac" data-key="${k}" ${max || s.money < cost ? 'disabled' : ''}>${max ? '최대' : m(s, cost)}</button></li>`;
    }).join('')}</ul><p class="mute small">시설은 연간 운영비(수입의 0.5%/레벨)도 늘립니다.</p>`;
  } else {
    body = `<ul class="list"><li><span class="grow">경기 간격<small>앱을 닫아도 이 간격마다 한 경기가 진행됩니다</small></span><div class="seg small" style="margin:0;width:190px">${G.INTERVAL_CHOICES.map((x) => `<button class="${s.intervalMin === x ? 'on' : ''}" data-act="interval" data-min="${x}">${x}분</button>`).join('')}</div></li>
    <li><span class="grow">자동 진행(방치형)<small>시즌이 끝나면 재계약·FA·드래프트를 어시스턴트가 처리하고 다음 시즌을 시작</small></span><button class="btn small${s.settings.autopilot ? '' : ' ghost'}" data-act="setting" data-key="autopilot">${s.settings.autopilot ? '켜짐' : '꺼짐'}</button></li>
    <li><span class="grow">엔트리 자동 관리<small>부상·회복 때 1군을 알아서 정리</small></span><button class="btn small${s.settings.autoRoster ? '' : ' ghost'}" data-act="setting" data-key="autoRoster">${s.settings.autoRoster ? '켜짐' : '꺼짐'}</button></li>
    <li><span class="grow">구단 이름<small>${esc(me.name)}</small></span><button class="btn small ghost" data-act="rename-team">변경</button></li>
    <li><span class="grow">백업 / 복원<small>${ui.backupAge ? `마지막 백업 ${ui.backupAge}` : '아직 백업하지 않았습니다'}</small></span><button class="btn small" data-act="backup">열기</button></li>
    <li><span class="grow">새로 시작<small>모든 진행 상황이 사라집니다</small></span><button class="btn small ghost danger" data-act="reset">초기화</button></li></ul>
    ${s.pack ? `<p class="mute small">데이터 팩 적용됨: ${esc(s.pack.name)} (${s.pack.teams}개 구단 · 선수 ${s.pack.players}명)</p>` : ''}
    ${s.dev.used ? '<p class="mute small">개발자 메뉴를 사용한 저장 데이터입니다.</p>' : ''}
    <p class="mute small">이 게임은 ${L.name} 2026 시즌 규정을 단순화해서 따릅니다. 규정 설명은 문서(docs/baseball/RULES.md)에 있습니다.</p>`;
  }
  return `<section class="head"><div><span class="eyebrow">${esc(me.name)}</span><h2 id="brand">구단</h2></div></section>
  <div class="seg">${[['fin', '재정'], ['fac', '시설'], ['set', '설정']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="cseg" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}

// ───────── 시트 ─────────
export function backupSheet(text) {
  return `<header class="sheet-h"><div><h2>백업 / 복원</h2><span class="mute">iOS가 웹 데이터를 지울 수 있어서 가끔 백업해 두세요</span></div></header>
  <div class="actions col"><button class="btn" data-act="bk-file">파일로 저장 (공유)</button><button class="btn ghost" data-act="bk-copy">텍스트 복사</button></div>
  <h3>복원</h3><textarea id="bk-in" rows="4" placeholder="백업 텍스트를 붙여 넣으세요" style="width:100%;font-size:16px"></textarea>
  <div class="actions col"><button class="btn" data-act="bk-restore">붙여넣은 텍스트로 복원</button><label class="btn ghost" style="text-align:center">파일에서 복원<input id="bk-file" type="file" accept=".json,application/json,text/plain" hidden></label><button class="btn ghost" data-act="close">닫기</button></div>
  <textarea id="bk-out" readonly rows="2" style="width:100%;font-size:16px;margin-top:8px">${esc(text.slice(0, 120))}…</textarea>`;
}
export const csvTemplate = () => CSV_TEMPLATE;
export function importSheet({ text = '', result = null, mask = false } = {}) {
  const r = result;
  return `<header class="sheet-h"><div><h2>데이터 팩 가져오기</h2><span class="mute">CSV 또는 JSON · 이 기기 안에서만 처리됩니다</span></div></header>
  <textarea id="pk-in" rows="6" placeholder="league,team,name,pos,birth,ovr,pot,hype,salary,years,fx,war,ops,era" style="width:100%;font-size:16px">${esc(text)}</textarea>
  <div class="card"><div class="row between"><div><b>이름 한 글자 바꾸기</b><small>가져온 선수 이름의 한 글자(영문은 이름 첫 단어의 끝 글자)를 바꿔 실제 선수와 똑같지 않게 합니다</small></div><button class="btn small${mask ? '' : ' ghost'}" data-act="import-mask">${mask ? '켜짐' : '꺼짐'}</button></div></div>
  <div class="actions col"><button class="btn" data-act="import-check">검사하기</button><label class="btn ghost" style="text-align:center">파일 선택<input id="pk-file" type="file" accept=".csv,.json,text/csv,application/json,text/plain" hidden></label><button class="btn ghost" data-act="import-template">양식 복사</button></div>
  ${r ? `<div class="card ${r.ok ? 'good' : 'alert'}"><b>${r.ok ? '사용할 수 있습니다' : '고쳐야 할 점이 있습니다'}</b><small>구단 ${r.stats.teams}개 · 선수 ${r.stats.players}명${r.errors.length ? '<br>' + r.errors.map(esc).join('<br>') : ''}${r.warnings.length ? '<br><span class="mute">' + r.warnings.map(esc).join('<br>') + '</span>' : ''}</small></div>${r.ok ? '<div class="actions col"><button class="btn" data-act="import-go">이 데이터로 새 게임 만들기</button></div>' : ''}` : ''}
  <div class="actions"><button class="btn ghost" data-act="close">닫기</button></div>`;
}
export function devSheet(s) {
  return `<header class="sheet-h"><div><h2>개발자 메뉴</h2><span class="mute">쓰면 저장 데이터에 표시됩니다</span></div></header>
  <h3>시간 배속</h3><div class="seg">${[1, 10, 60, 600].map((x) => `<button class="${s.dev.timeScale === x ? 'on' : ''}" data-act="dev-scale" data-x="${x}">x${x}</button>`).join('')}</div>
  <h3>자금</h3><div class="seg">${[['+', 100], ['++', 1000]].map(([l, v]) => `<button data-act="dev-money" data-v="${v}">${l}${v}</button>`).join('')}</div>
  <div class="actions col"><button class="btn" data-act="dev-boost">내 팀 능력치 +5</button><button class="btn" data-act="dev-10">10경기 즉시</button><button class="btn" data-act="dev-end">시즌 끝까지</button><button class="btn ghost" data-act="close">닫기</button></div>`;
}

// 중계 중에는 경기 전 스냅샷(ui.before)을 보여 주어 승패가 미리 드러나지 않게 한다
export function displayState(s, ui) { return ui.live && ui.before ? { ...ui.before, latest: s.latest } : s; }
