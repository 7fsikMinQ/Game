// 상태 -> HTML 문자열. DOM을 건드리지 않는 순수 함수라서 Node에서 테스트할 수 있다.
import { esc, fmtMoney, fmtClock, f1, avatar } from './util.js';
import { ATTRS, ATTR_LABEL, GROUP_LABEL, ROLES, ROLE_LABEL, FORMATIONS, MENTALITY, PRESSING, TRAIN_FOCUS, SQUAD_MAX } from './data.js';
import { LEAGUES, COUNTRIES } from './league.js';
import { caOf, caAt, valueOf, famOf, HYPE_LABEL, HYPE_STARS } from './player.js';
import { rankFormations, formOf } from './squad.js';
import * as G from './game.js';
import { CSV_TEMPLATE } from './pack.js';

const ICONS = {
  home: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5l3.5 2.5-1.3 4h-4.4L8.5 10z"/>',
  squad: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.9.3 5 2.6 5 5.8"/>',
  tactics: '<rect x="3.5" y="4" width="17" height="16" rx="1.5"/><path d="M3.5 12h17"/><circle cx="12" cy="12" r="2.6"/>',
  league: '<path d="M5 20V11M12 20V4M19 20v-6M3 20h18"/>',
  club: '<path d="M3 21h18M5 21V9.5L12 4l7 5.5V21M10 21v-6h4v6"/>',
};
export const TABS = [['home', '경기'], ['squad', '선수단'], ['tactics', '전술'], ['league', '리그'], ['club', '구단']];
export const navHTML = (tab, badge = 0) =>
  TABS.map(([id, label]) => `<button class="tab${id === tab ? ' on' : ''}" data-act="tab" data-tab="${id}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg><span>${label}</span>${id === 'club' && badge ? `<i class="badge">${badge}</i>` : ''}</button>`).join('');

const POSG = { GK: 'GK', DC: 'DF', DL: 'DF', DR: 'DF', DM: 'MF', MC: 'MF', ML: 'MF', MR: 'MF', AM: 'MF', ST: 'FW' };
const attrCls = (v) => (v >= 16 ? 'a4' : v >= 11 ? 'a3' : v >= 6 ? 'a2' : 'a1');
const mentLabel = Object.fromEntries(MENTALITY);
const pressLabel = Object.fromEntries(PRESSING);
const pct = (x) => Math.round(x * 100);
const money = fmtMoney;
const ERR = { window: '이적시장이 닫혀 있습니다', money: '자금이 부족합니다', full: '선수단이 가득 찼습니다', min: '선수단 최소 인원(18명) 아래로 줄일 수 없습니다', gk: '골키퍼는 최소 2명이 필요합니다', limit: '임대 인원 한도에 도달했습니다', locked: '영입한 지 얼마 안 된 선수는 19라운드 동안 팔 수 없습니다', loaned: '임대 중인 선수입니다', notfound: '대상을 찾을 수 없습니다', bid: '금액을 입력하세요', max: '최대 레벨입니다' };
export const errText = (r) => ERR[r.err] || '할 수 없습니다';

// ───────── 시작 화면 ─────────
export function leagueSelectView() {
  const cards = COUNTRIES.map((c) => {
    const L = LEAGUES[c];
    const [d1, d2] = L.divs;
    const split = d1.split ? ' + 파이널 5라운드' : '';
    const rounds1 = d1.cycles * (d1.n - 1) + (d1.split ? d1.n / 2 - 1 : 0);
    return `<li><button class="rowbtn big" data-act="pick-league" data-id="${c}"><span class="grow"><b>${L.top}</b> <span class="mute">${L.name}</span><small>${d1.n}팀 · ${rounds1}라운드${split} · 승 3점 무 1점 패 0점<br>2부 ${d2.name} (${d2.n}팀) · 강등 ${L.rules.relegate}팀 · 승강제 포함</small></span><span class="chev">›</span></button></li>`;
  }).join('');
  return `<section class="head"><div><span class="eyebrow">새 게임</span><h2>리그를 고르세요</h2></div></section>
  <p class="mute">기본은 <b>가상 구단·가상 선수</b>입니다. 실제 선수 이름·얼굴은 라이선스(초상권·상표) 문제가 있어 앱에 넣지 않았습니다. 리그 구조(팀 수·경기 수·승점·승강제)는 공개된 2026년 자료를 따르고, 이적시장 기간·일부 임대 한도·재정 제재 수치는 <b>단순화한 게임 설정</b>입니다.</p>
  <ul class="list" style="margin-top:12px">${cards}</ul>
  <h3>내 데이터 가져오기 <small class="mute" style="display:inline">선택</small></h3>
  <div class="card"><div class="row between"><div><b>실제 구단·선수 데이터 팩</b><small>직접 구한 CSV/JSON으로 구단명·선수명·나이·유망주 등급을 반영합니다. 이 기기 안에서만 쓰입니다.</small></div><button class="btn small" data-act="import-open">가져오기</button></div></div>`;
}
export function clubSelectView(s, ui) {
  const L = LEAGUES[s.country];
  const rows = s.divs.map((d, di) => {
    const ts = d.ids.map((i) => s.teams[i]).sort((a, b) => b.rep - a.rep);
    return `<h3>${L.divs[di].name} <small class="mute" style="display:inline">${ts.length}팀</small></h3><ul class="list">${ts.map((t, i) => `<li><button class="rowbtn" data-act="pick-club" data-id="${t.id}"><i class="dot" style="background:${t.color}"></i><span class="grow">${esc(t.name)}<small>평판 ${Math.round(t.rep)} · 평균 CA ${Math.round(G.teamCA(t))} · 연봉 총액 ${money(G.wageBill(t))}</small></span><span class="tag2">${i < ts.length / 3 ? '강팀' : i < (ts.length * 2) / 3 ? '중위' : '약팀'}</span></button></li>`).join('')}</ul>`;
  }).join('');
  return `<section class="head"><div><span class="eyebrow">${L.top}</span><h2>구단을 고르세요</h2></div><button class="btn small ghost" data-act="back-league">뒤로</button></section>
  <div class="card"><div class="row between"><div><b>방치형 자동 진행</b><small>시즌이 끝나면 유스·재계약을 어시스턴트가 처리하고 다음 시즌을 자동으로 시작합니다</small></div><button class="btn small${ui.autopilot ? '' : ' ghost'}" data-act="setup-auto">${ui.autopilot ? '켜짐' : '꺼짐'}</button></div></div>
  <p class="mute small">강팀은 선수가 좋지만 연봉도 큽니다. 약팀·2부 팀은 가난하지만 유망주를 키우거나 승격을 노리는 재미가 있습니다.</p>${rows}`;
}

// ───────── 경기 탭 ─────────
const formChips = (arr) => arr.map((r) => `<span class="fc ${r}">${r}</span>`).join('') || '<span class="mute">-</span>';
function scoreAt(e, min) { let sc = [0, 0]; for (const x of e.events || []) if (x.t === 'goal' && x.min <= min) sc = x.score; return sc; }
export function eventLine(s, e, x) {
  const club = x.side === 'h' ? e.homeId : e.awayId;
  const icon = { goal: '골', yc: '경고', rc: '퇴장', sub: '교체', inj: '부상', pen: '페널티', save: '선방', miss: '기회' }[x.t] || '';
  return `<li class="ev ${x.t}"><b>${x.min}'</b><span class="et">${icon}</span><span>${esc(x.text)}<small>${esc(s.teams[club].name)}</small></span></li>`;
}
export function matchPanel(s, e, live) {
  const min = live ? live.min : 90;
  const sc = live ? scoreAt(e, min) : [e.hs, e.as];
  const hn = esc(s.teams[e.homeId].name), an = esc(s.teams[e.awayId].name);
  const evs = (e.events || []).filter((x) => x.min <= min && (live || !['save', 'miss'].includes(x.t)));
  const list = live ? evs.slice().reverse() : evs;
  const st = e.stats;
  const bar = (label, a, b, fmt = (v) => v) => { const t = a + b || 1; return `<div class="sb"><span class="n">${fmt(a)}</span><div class="mb"><i style="width:${(a / t) * 100}%"></i></div><span class="l">${label}</span><div class="mb r"><i style="width:${(b / t) * 100}%"></i></div><span class="n">${fmt(b)}</span></div>`; };
  const stats = live ? '' : `<div class="stats-box">${bar('점유율', e.poss, 100 - e.poss, (v) => v + '%')}${bar('슈팅', st.h.shots, st.a.shots)}${bar('유효 슈팅', st.h.sot, st.a.sot)}${bar('기대 득점', st.h.xg, st.a.xg, f1)}${bar('코너킥', st.h.corners, st.a.corners)}${bar('파울', st.h.fouls, st.a.fouls)}${bar('경고', st.h.yc, st.a.yc)}</div>`;
  return `<div class="board mboard"><div class="mrow"><span class="tn${e.homeId === s.userId ? ' me' : ''}">${hn}</span><span class="sc" id="mscore">${sc[0]} : ${sc[1]}</span><span class="tn r${e.awayId === s.userId ? ' me' : ''}">${an}</span></div><div class="mclock" id="mmin">${live ? (min >= 90 ? '종료' : min + '분') : `${e.round ? `R${e.round} · ` : ''}종료`}</div></div>
  ${stats}
  ${!live && e.motm ? `<p class="meta">경기 최우수 선수: <b>${esc(e.motm.name)}</b> (평점 ${f1(e.motm.rt)}${e.motm.g ? `, ${e.motm.g}골` : ''}${e.motm.a ? `, ${e.motm.a}도움` : ''})${e.net !== undefined && e.net !== null ? ` · 이번 라운드 손익 ${e.net >= 0 ? '+' : ''}${money(e.net)}` : ''}</p>` : ''}
  <ol class="plays" id="mevents">${list.map((x) => eventLine(s, e, x)).join('') || '<li class="mute">특별한 장면이 없었습니다.</li>'}</ol>`;
}

const NEWS_TAG = { match: '경기', injury: '부상', transfer: '이적', loan: '임대', offer: '제안', finance: '재정', window: '시장', season: '시즌', info: '안내' };
export const newsRow = (n) => `<li><span class="nt ${n.kind}">${NEWS_TAG[n.kind] || '소식'}</span><span class="grow">${esc(n.text)}<small>${n.season}시즌 R${n.round}</small></span></li>`;

export function homeView(s, ui, now) {
  if (s.phase === 'offseason') return offseasonView(s, ui);
  const me = G.userTeam(s), d = G.userDiv(s), dc = G.divCfg(s, me.div);
  const st = G.standings(s);
  const mine = st.find((r) => r.id === s.userId);
  const fx = G.nextFixture(s);
  const iv = G.intervalMs(s);
  const left = Math.max(0, s.nextGameAt - now);
  const prog = Math.min(100, Math.max(0, (1 - left / iv) * 100));
  const pv = fx ? G.preview(s) : null;
  const opp = fx ? s.teams[fx.h === s.userId ? fx.a : fx.h] : null;
  const e = s.latest, live = ui.live, hide = false;
  const out = me.players.filter((p) => p.out > 0).length, sus = me.players.filter((p) => p.suspend).length;
  const w = G.windowInfo(s);
  const report = ui.report ? `<section class="card report"><div><b>자리를 비운 동안</b><p>${ui.report.games}라운드${ui.report.seasons ? ` · ${ui.report.seasons}시즌 자동 진행` : ''} · ${ui.report.w}승 ${ui.report.d}무 ${ui.report.l}패 · 자금 ${ui.report.money >= 0 ? '+' : ''}${money(ui.report.money)}${ui.report.skipped ? '<br><span class="mute">밀린 경기가 많아 일부만 반영되었습니다.</span>' : ''}</p></div><button class="btn small ghost" data-act="dismiss-report">확인</button></section>` : '';
  const offers = s.offers.length ? `<section class="card alert"><div class="row between"><div><b>이적 제안 ${s.offers.length}건</b><small>구단 탭 → 이적에서 확인하세요</small></div><button class="btn small" data-act="goto-offers">보기</button></div></section>` : '';
  const recent = s.history.games.slice(0, 5);
  const streak = s.streak;
  const odds = pv ? { w: fx.h === s.userId ? pv.w : pv.l, d: pv.d, l: fx.h === s.userId ? pv.l : pv.w } : null;
  const roundsLeft = G.roundsLeft(s);
  const nudge = ui.backupNudge ? `<section class="card alert"><div class="row between"><div><b>백업을 권장합니다</b><small>iOS가 웹 데이터를 지울 수 있어서 가끔 백업해 두세요</small></div><div class="oact"><button class="btn small" data-act="backup">백업</button><button class="btn small ghost" data-act="dismiss-nudge">나중에</button></div></div></section>` : '';
  return `${nudge}${report}${offers}
  <section class="head"><div><span class="eyebrow">${G.seasonLabel(s)} · ${dc.name} · ${Math.min(d.roundIdx + (hide ? 0 : 0), d.rounds.length)}/${d.rounds.length}R</span><h2>${esc(me.name)}</h2></div><div class="rec"><b>${hide ? '-' : mine.rank}</b>위</div></section>
  <section class="stats4"><div><span>승점</span><b>${hide ? '-' : mine.pts}</b></div><div><span>득실</span><b>${hide ? '-' : (mine.gd > 0 ? '+' : '') + mine.gd}</b></div><div><span>최근 5경기</span><b class="fcs">${formChips(streak)}</b></div><div><span>자금</span><b>${money(s.money)}</b></div></section>
  <section class="card next">
    <div class="row between"><span class="eyebrow">${fx ? `다음 경기 · ${fx.h === s.userId ? '홈' : '원정'}` : '이번 라운드는 휴식'}</span><span class="clock" id="cd">${fmtClock(left)}</span></div>
    <div class="bar"><i id="cdbar" style="width:${prog.toFixed(1)}%"></i></div>
    <p class="vs">${opp ? `vs <b>${esc(opp.name)}</b> <span class="mute">(${st.find((r) => r.id === opp.id).rank}위)</span>` : '<span class="mute">부전 라운드입니다</span>'}</p>
    ${odds ? `<div class="odds"><i class="w" style="width:${pct(odds.w)}%"></i><i class="d" style="width:${pct(odds.d)}%"></i><i class="l" style="width:${pct(odds.l)}%"></i></div><div class="oddsl"><span>승 ${pct(odds.w)}%</span><span>무 ${pct(odds.d)}%</span><span>패 ${pct(odds.l)}%</span></div>` : ''}
    ${out || sus ? `<p class="meta">결장: 부상 ${out}명${sus ? ` · 출장정지 ${sus}명` : ''}${me.auto ? ' (어시스턴트가 대체)' : ''}</p>` : ''}
    <div class="skip"><button class="btn" data-act="play" data-n="1">계속 ▶</button><button class="btn ghost" data-act="play" data-n="5">5라운드</button><button class="btn ghost" data-act="play" data-n="9999">시즌 끝까지</button></div>
    <p class="meta">남은 ${roundsLeft}라운드 · 앱을 닫아도 ${s.intervalMin}분마다 한 라운드씩 자동으로 진행됩니다.${w.open ? ` <b>${w.label} 열림${w.left ? ` (${w.left}라운드 남음)` : ''}</b>` : ''}</p>
  </section>
  <section><h3>${live ? '중계 중' : '지난 경기'}</h3>${e ? `<div id="match">${matchPanel(s, e, live)}</div>${live ? '<button class="btn small ghost" data-act="skip-live">중계 건너뛰기</button>' : ''}` : '<p class="empty">첫 경기를 기다리는 중입니다. <b>계속 ▶</b>를 누르면 바로 시작합니다.</p>'}</section>
  ${s.news.length ? `<section><h3>소식</h3><ul class="list news">${s.news.slice(0, 4).map(newsRow).join('')}</ul></section>` : ''}
  ${recent.length ? `<section><h3>경기 기록</h3><ul class="list results">${recent.map((g) => `<li><span class="tag ${g.res === 1 ? 'w' : g.res === 0 ? 'd' : 'l'}">${g.res === 1 ? '승' : g.res === 0 ? '무' : '패'}</span><span class="grow">${g.home ? '' : '@ '}${esc(s.teams[g.oppId].name)}<small>${g.season}시즌 R${g.round}${g.motm ? ` · MOM ${esc(g.motm.name)}` : ''}</small></span><b class="num">${g.us}:${g.them}</b></li>`).join('')}</ul></section>` : ''}`;
}

function offseasonView(s, ui) {
  const o = s.offseason, h = s.history.seasons[0], me = G.userTeam(s);
  const youth = o.youth.map((p) => `<li><button class="rowbtn" data-act="player" data-src="youth" data-pid="${p.id}"><span class="pos">${p.pos}</span><span class="grow">${esc(p.name)}<small>${p.age}세 · CA ${caOf(p)} · PA ${p.pa}</small></span><span class="chev">›</span></button></li>`).join('');
  const exp = o.expiring.map((id) => me.players.find((p) => p.id === id)).filter(Boolean);
  const renew = exp.map((p) => `<li><button class="rowbtn" data-act="player" data-pid="${p.id}"><span class="pos ${POSG[p.pos]}">${p.pos}</span><span class="grow">${esc(p.name)}<small>${p.age}세 · CA ${caOf(p)} · 새 연봉 ${money(G.wageDemand(p))} · 보너스 ${money(G.renewBonus(p))}</small></span><span class="chev">›</span></button></li>`).join('');
  const po = (o.playoffs || []).map((x) => `<li><span class="grow">${esc(x.name)}<small>${esc(x.lowName)} vs ${esc(x.highName)} · 합계 ${x.agg[0]}:${x.agg[1]}</small></span><b>${esc(x.winnerName)}</b></li>`).join('');
  return `<section class="head"><div><span class="eyebrow">${h.label} 종료 · ${h.div}</span><h2>오프시즌</h2></div><div class="rec"><b>${h.rank}</b>위</div></section>
  <section class="card">
    <div class="kv"><span>우승</span><b>${esc(h.champion)}</b></div>
    <div class="kv"><span>최종 성적</span><b>${h.w}승 ${h.d}무 ${h.l}패 · 승점 ${h.pts} (${h.rounds}경기)</b></div>
    <div class="kv"><span>기대 순위</span><b>${o.expected}위 → ${h.rank}위 ${o.delta > 0 ? '(기대 이상)' : o.delta < 0 ? '(기대 이하)' : ''}</b></div>
    <div class="kv"><span>득점왕</span><b>${h.scorer ? `${esc(h.scorer.name)} ${h.scorer.g}골` : '-'}</b></div>
    <div class="kv"><span>최고 평점</span><b>${h.best ? `${esc(h.best.name)} ${f1(h.best.rt)}` : '-'}</b></div>
    <div class="kv"><span>순위 상금</span><b>+${money(h.prize)}</b></div>
    ${o.contBonus ? `<div class="kv"><span>대륙 대회 진출 보상</span><b>+${money(o.contBonus)}</b></div>` : ''}
    ${o.parachute ? `<div class="kv"><span>강등 낙하산 지원금</span><b>+${money(o.parachute)}</b></div>` : ''}
    <div class="kv"><span>자금</span><b>${money(s.money)}</b></div>
  </section>
  ${o.promoted ? '<section class="card good"><b>승격!</b> 다음 시즌은 1부에서 뜁니다.</section>' : ''}${o.relegated ? '<section class="card alert"><b>강등</b> 다음 시즌은 2부에서 뜁니다. 선수 연봉이 수입보다 클 수 있으니 재정을 확인하세요.</section>' : ''}
  <section><h3>승강</h3><p class="mute small">승격: ${o.upNames.map(esc).join(', ') || '-'}<br>강등: ${o.downNames.map(esc).join(', ') || '-'}</p>${po ? `<ul class="list">${po}</ul>` : ''}</section>
  ${exp.length ? `<section><h3>계약 만료 선수 <small class="mute" style="display:inline">${exp.length}명</small></h3><p class="mute">선수를 눌러 재계약하세요. 하지 않으면 시즌이 시작될 때 팀을 떠납니다${s.settings.autoRenew ? ' (자동 재계약이 켜져 있으면 어시스턴트가 필요한 선수만 재계약합니다)' : ''}.</p><ul class="list">${renew}</ul></section>` : ''}
  <section><h3>유스 입단 후보 <small class="mute" style="display:inline">${o.youth.length}명</small></h3>
    <p class="mute">지금 CA가 낮아도 PA(잠재능력)가 높으면 몇 년 뒤 주전이 됩니다.</p>${youth ? `<ul class="list">${youth}</ul>` : '<p class="empty">후보가 없습니다.</p>'}</section>
  ${o.notes.length ? `<p class="mute small">${o.notes.map(esc).join('<br>')}</p>` : ''}
  <section class="actions"><button class="btn" data-act="next-season">다음 시즌 시작</button><button class="btn ghost" data-act="auto-next">어시스턴트에게 맡기고 시작</button><button class="btn ghost" data-act="goto-market">이적시장 보기</button></section>
  <p class="mute small">시작하면 나이가 +1 되고, 30대 선수는 피지컬이 떨어지며, 은퇴 선수가 정리됩니다. 선수단 ${me.players.length}명 (최대 ${SQUAD_MAX}).</p>`;
}

// ───────── 선수단 탭 ─────────
const statusTag = (p) => (p.out > 0 ? `<span class="st bad">부상 ${p.out}R</span>` : p.suspend ? '<span class="st bad">출장정지</span>' : p.cond < 60 ? '<span class="st warn">지침</span>' : '') + (p.loan ? `<span class="st loan">${p.loan.from === 99999 ? '' : '임대'}</span>` : '');
const hypeTag = (p) => (p.hype && p.age <= 23 ? `<span class="st hype" title="${HYPE_LABEL[p.hype]}">${HYPE_STARS(p.hype)}</span>` : '');
const ctrTag = (p) => (p.loan ? '' : p.ctr <= 1 ? `<span class="st warn">계약 ${p.ctr}년</span>` : '');
export function playerRow(s, p, extra = '', src = '') {
  const ca = caOf(p);
  const pa = G.paEstimate(s, p);
  return `<li><button class="rowbtn" data-act="player" ${src ? `data-src="${src}"` : ''} data-pid="${p.id}"><span class="pos ${POSG[p.pos]}">${p.pos}</span><span class="grow">${esc(p.name)} ${statusTag(p)}${ctrTag(p)}${hypeTag(p)}<small>${p.age}세 · ${extra || (p.s && p.s.app ? `${p.s.app}경기 ${p.s.g}골 ${p.s.a}도움 · 평점 ${f1(p.s.rt / p.s.app)}` : `연봉 ${money(p.w)}`)}</small></span><span class="ca"><b>${ca}</b><i>/${pa.err ? `${pa.lo}~${pa.hi}` : pa.mid}</i></span><span class="cond"><u style="height:${p.cond}%"></u></span></button></li>`;
}
export function squadView(s, ui) {
  const me = G.userTeam(s);
  const f = ui.pos || 'ALL';
  const sorts = { ca: (a, b) => caOf(b) - caOf(a), pa: (a, b) => b.pa - a.pa, age: (a, b) => a.age - b.age, pos: (a, b) => ROLES.indexOf(a.pos) - ROLES.indexOf(b.pos) || caOf(b) - caOf(a) };
  const list = me.players.filter((p) => f === 'ALL' || POSG[p.pos] === f).sort(sorts[ui.sort || 'pos']);
  const out = G.loansOut(s);
  return `<section class="head"><div><span class="eyebrow">${me.players.length}/${SQUAD_MAX}명 · 평균 CA ${Math.round(G.teamCA(me))}</span><h2>선수단</h2></div><div class="rec">연봉 <b>${money(G.wageBill(me))}</b></div></section>
  <div class="seg">${['ALL', 'GK', 'DF', 'MF', 'FW'].map((x) => `<button class="${f === x ? 'on' : ''}" data-act="pos" data-v="${x}">${x === 'ALL' ? '전체' : x}</button>`).join('')}</div>
  <div class="seg small">${[['pos', '포지션'], ['ca', 'CA'], ['pa', 'PA'], ['age', '나이']].map(([k, l]) => `<button class="${(ui.sort || 'pos') === k ? 'on' : ''}" data-act="sort" data-v="${k}">${l}</button>`).join('')}</div>
  <ul class="list roster">${list.map((p) => playerRow(s, p)).join('')}</ul>
  ${out.length ? `<h3>임대 보낸 선수</h3><ul class="list roster">${out.map(({ p, t }) => playerRow(s, p, `${esc(t.name)}에서 뛰는 중`, 'out')).join('')}</ul>` : ''}
  <p class="mute small">오른쪽 숫자는 <b>현재능력(CA) / 잠재능력(PA)</b> (최대 200). 막대는 컨디션입니다.</p>`;
}

export function playerSheet(s, pid, src = 'own') {
  let p = null, t = null;
  for (const tm of s.teams) { const x = tm.players.find((q) => q.id === pid); if (x) { p = x; t = tm; } }
  if (!p) p = (s.market.free || []).find((q) => q.id === pid);
  if (!p && s.offseason) p = s.offseason.youth.find((q) => q.id === pid);
  if (!p) return '';
  const me = G.userTeam(s);
  const own = me.players.includes(p);
  const loanedIn = own && p.loan && p.loan.from !== s.userId;
  const loanedOut = !own && p.loan && p.loan.from === s.userId;
  const ca = caOf(p), est = G.paEstimate(s, p);
  const paTxt = own || src === 'youth' ? p.pa : est.err ? `${est.lo}~${est.hi}` : est.mid;
  const attrs = Object.entries(ATTRS).filter(([g]) => g !== 'gk' || p.pos === 'GK').map(([g, ks]) => `<div class="ag"><h4>${GROUP_LABEL[g]}</h4>${ks.map((k) => `<div class="ar"><span>${ATTR_LABEL[k]}</span><b class="${attrCls(p.a[k])}">${p.a[k]}</b></div>`).join('')}</div>`).join('');
  const roles = (p.pos === 'GK' ? ['GK'] : ROLES.filter((r) => r !== 'GK')).map((r) => ({ r, v: Math.round(caAt(p, r) * famOf(p, r)) })).sort((a, b) => b.v - a.v).slice(0, 4);
  const win = G.windowInfo(s);
  const lock = own ? G.lockLeft(s, p) : 0;
  const wnote = (win.open ? '' : '<p class="mute small">이적시장이 닫혀 있어 영입·매각·임대를 할 수 없습니다.</p>') + (lock ? `<p class="mute small">이적 제한: 영입 후 ${lock}라운드 뒤에 매각할 수 있습니다.</p>` : '');
  let act = '<button class="btn" data-act="close">닫기</button>';
  const expiring = s.offseason && s.offseason.expiring.includes(p.id);
  if (own) {
    const listed = s.listings.some((l) => l.pid === p.id);
    const bs = [];
    if (expiring) bs.push(`<button class="btn" data-act="renew" data-pid="${p.id}">재계약 (보너스 ${money(G.renewBonus(p))}, 연봉 ${money(G.wageDemand(p))})</button>`);
    if (loanedIn) bs.push(`<button class="btn" data-act="buy-option" data-pid="${p.id}">완전 영입 ${money(p.loan.opt)}</button>`);
    else {
      bs.push(`<button class="btn" data-act="neg-open" data-mode="sell" data-pid="${p.id}">가격 협상하며 팔기</button>`);
      bs.push(`<button class="btn ghost danger" data-act="sell" data-pid="${p.id}">즉시 매각 ${money(G.sellPrice(p))}</button>`);
      bs.push(`<button class="btn ghost" data-act="${listed ? 'unlist' : 'list'}" data-pid="${p.id}">${listed ? '이적 등록 취소' : '이적 등록 (제안 기다리기)'}</button>`);
      if (!p.loan) bs.push(`<button class="btn ghost" data-act="loan-out" data-pid="${p.id}">임대 보내기 (임대료 ${money(Math.round(valueOf(p) * 0.04 / 100) * 100)})</button>`);
      bs.push(`<button class="btn ghost" data-act="release" data-pid="${p.id}">방출 (위약금 ${money(G.releaseCost(p))})</button>`);
    }
    bs.push('<button class="btn" data-act="close">닫기</button>');
    act = bs.join('');
  } else if (src === 'market') { const q = G.quoteOf(s, p.id); act = `<button class="btn" data-act="neg-open" data-mode="buy" data-pid="${p.id}">협상하기</button><button class="btn ghost" data-act="buy" data-pid="${p.id}">즉시 구매 ${money(q ? q.ask : G.askPrice(p))}</button><button class="btn ghost" data-act="close">닫기</button>`; }
  else if (src === 'loan') act = `<button class="btn" data-act="loan-in" data-pid="${p.id}">임대 영입 (임대료 ${money(G.loanFee(p))} + 연봉 부담)</button><button class="btn ghost" data-act="close">닫기</button>`;
  else if (src === 'free') act = `<button class="btn" data-act="sign" data-pid="${p.id}">자유계약 ${money(G.freePrice(p))}</button><button class="btn ghost" data-act="close">닫기</button>`;
  else if (src === 'youth') act = `<button class="btn" data-act="youth-yes" data-pid="${p.id}">영입</button><button class="btn ghost" data-act="youth-no" data-pid="${p.id}">돌려보내기</button>`;
  else if (loanedOut) act = `<button class="btn" data-act="recall" data-pid="${p.id}">복귀 요청</button><button class="btn ghost" data-act="close">닫기</button>`;
  const x = p.s;
  return `<header class="sheet-h">${avatar(p)}<div class="grow"><h2>${esc(p.name)}</h2><span class="mute">${ROLE_LABEL[p.pos]} · ${p.age}세${t && !own ? ` · ${esc(t.name)}` : ''}${p.alt && p.alt.length ? ` · 가능: ${p.alt.join(', ')}` : ''}</span>${p.hype && p.age <= 23 ? `<div class="hypeline">${HYPE_STARS(p.hype)} ${HYPE_LABEL[p.hype]} <span class="mute">(시장·언론의 기대 등급)</span></div>` : ''}</div><div class="big"><b>${ca}</b><small>/ PA ${paTxt}</small></div></header>
  <div class="gauge"><i style="width:${(ca / 200) * 100}%"></i><u style="left:${(Math.min(200, est.mid ?? p.pa) / 200) * 100}%"></u></div>
  <div class="kvs"><div><span>컨디션</span><b>${Math.round(p.cond)}%</b></div><div><span>사기</span><b>${Math.round(p.mor ?? 70)}</b></div><div><span>상태</span><b>${p.out > 0 ? `부상 ${p.out}R` : p.suspend ? '출장정지' : '정상'}</b></div><div><span>시장 가치</span><b>${money(valueOf(p))}</b></div><div><span>연봉</span><b>${money(p.w)}</b></div><div><span>계약</span><b>${p.loan ? `임대(시즌 종료까지)` : p.ctr > 0 ? `${p.ctr}년 남음` : '무소속'}</b></div></div>
  ${x && x.app ? `<p class="meta">시즌 기록: ${x.app}경기 ${x.g}골 ${x.a}도움 · 평균 평점 ${f1(x.rt / x.app)}</p>` : ''}
  <h3>포지션 적합도</h3><div class="chips">${roles.map((o) => `<span class="chip">${o.r} <b>${o.v}</b></span>`).join('')}</div>
  <h3>능력치 <small class="mute" style="display:inline">1~20</small></h3><div class="attrs">${attrs}</div>
  ${factorLine(p)}${wnote}<div class="actions col">${act}</div>`;
}

const factorLine = (p) => { const f = G.factorsOf(p); return f.length ? `<div class="factors"><span class="mute small">몸값 요인</span>${f.map((x) => `<span class="chip">${esc(x.label)} ${x.mul >= 1 ? '+' : ''}${Math.round((x.mul - 1) * 100)}%</span>`).join('')}</div>` : ''; };

// ───────── 이적 협상 시트 ─────────
export function negSheet(s, ui) {
  const n = ui.neg, p = G.findPlayer(s, n.pid);
  if (!p) return '<p class="empty">대상을 찾을 수 없습니다.</p><div class="actions"><button class="btn" data-act="close">닫기</button></div>';
  const buy = n.mode === 'buy';
  let info;
  if (buy) {
    const q = G.quoteOf(s, p.id), t = q && q.t;
    info = q ? `<div class="kv"><span>판매 구단</span><b>${esc(t.name)}</b></div><div class="kv"><span>호가</span><b>${money(q.ask)}</b></div><div class="kv"><span>기준 시장가치</span><b>${money(valueOf(p))}</b></div>${q.star ? '<p class="mute small">구단의 핵심 선수라 쉽게 깎아 주지 않습니다.</p>' : ''}` : '';
  } else {
    const b = G.sellBand(s, p);
    info = `<div class="kv"><span>관심 구단</span><b>${esc(b.buyer)}</b></div><div class="kv"><span>기준 시장가치</span><b>${money(G.tradeValue(p))}</b></div><p class="mute small">상대가 내줄 수 있는 선은 비공개입니다. 높게 부를수록 거절될 수 있고, 무리하면 협상이 깨집니다.</p>`;
  }
  const pat = G.negOf(s, p.id);
  const broken = pat.until && s.tick < pat.until;
  const left = Math.max(0, pat.pat);
  const dflt = n.input ?? Math.round((buy ? G.askPrice(p) * 0.85 : G.sellPrice(p) * 1.15) / 100) * 100;
  const log = n.log.map((l) => `<li class="${l.cls || ''}">${esc(l.text)}</li>`).join('');
  return `<header class="sheet-h">${avatar(p)}<div class="grow"><h2>${esc(p.name)}</h2><span class="mute">${buy ? '영입 협상' : '매각 협상'} · CA ${caOf(p)} · ${p.age}세</span></div></header>
  <div class="card">${info}${factorLine(p)}</div>
  ${log ? `<ul class="list tight neglog">${log}</ul>` : ''}
  ${!G.windowInfo(s).open ? '<div class="card alert"><b>이적시장이 닫혀 있습니다</b><small>시장이 열리면 협상할 수 있습니다.</small></div>' : broken ? `<div class="card alert"><b>협상이 결렬되었습니다</b><small>${pat.until - s.tick}라운드 뒤에 다시 시도할 수 있습니다.</small></div>` : `
  <label class="field"><span>${buy ? '제시할 이적료' : '요구할 이적료'} (만)</span><input id="neg-in" type="number" inputmode="numeric" step="100" min="100" value="${dflt}" style="width:100%;font-size:16px"></label>
  <p class="mute small">남은 협상 기회 ${left}번</p>
  <div class="actions col"><button class="btn" data-act="neg-bid">${buy ? '입찰하기' : '이 가격에 팔기'}</button>${n.counter ? `<button class="btn ghost" data-act="neg-take" >역제안 수락 ${money(n.counter)}</button>` : ''}</div>`}
  <div class="actions"><button class="btn ghost" data-act="close">닫기</button></div>`;
}

// ───────── 전술 탭 ─────────
export function tacticsView(s, ui) {
  const me = G.userTeam(s), form = formOf(me.form), sq = ui.squadCache, rank = rankFormations(me);
  const slots = form.slots.map((sl, i) => { const p = sq.xi[i].p; return `<button class="slot${p.out || p.suspend ? ' bad' : ''}" style="left:${sl.x}%;top:${sl.y}%" data-act="slot" data-i="${i}"><b>${Math.round(caAt(p, sl.r) * famOf(p, sl.r))}</b><span>${esc(p.name)}</span><em>${sl.r}</em></button>`; }).join('');
  const bench = sq.bench.map((p) => `<span class="chip">${p.pos} ${esc(p.name)} <b>${caOf(p)}</b></span>`).join('');
  return `<section class="head"><div><span class="eyebrow">${mentLabel[me.mentality]} · ${pressLabel[me.pressing]}</span><h2>전술</h2></div><div class="rec">${form.name}</div></section>
  <div class="pitch">${slots}</div>
  <p class="mute small" style="margin-top:6px">선수를 누르면 교체할 선수를 고릅니다. 숫자는 그 자리에서의 실효 능력(CA 기준)입니다.</p>
  <h3>포메이션</h3><div class="seg wrap">${FORMATIONS.map((f) => `<button class="${me.form === f.id ? 'on' : ''}" data-act="form" data-id="${f.id}">${f.name}</button>`).join('')}</div>
  <h3>마인드</h3><div class="seg">${MENTALITY.map(([k, l]) => `<button class="${me.mentality === k ? 'on' : ''}" data-act="ment" data-v="${k}">${l}</button>`).join('')}</div>
  <h3>압박</h3><div class="seg">${PRESSING.map(([k, l]) => `<button class="${me.pressing === k ? 'on' : ''}" data-act="press" data-v="${k}">${l}</button>`).join('')}</div>
  <p class="mute small">공격적일수록 서로 찬스가 늘어납니다. 강한 압박은 상대 찬스를 줄이지만 체력이 빨리 닳고 파울이 늘어납니다.</p>
  <h3>어시스턴트 감독</h3>
  <div class="card"><div class="row between"><div><b>자동 라인업</b><small>${me.auto ? '켜짐: 컨디션·부상을 보고 매 경기 베스트11 선택' : '꺼짐: 직접 고른 선수 우선(못 뛰면 대체)'}</small></div><button class="btn small${me.auto ? '' : ' ghost'}" data-act="auto">${me.auto ? '켜짐' : '꺼짐'}</button></div></div>
  <ul class="list" style="margin-top:8px">${rank.map((r, i) => `<li><span class="grow"><b>${r.name}</b>${r.id === me.form ? ' <span class="mute">(현재)</span>' : ''}<small>수비 ${f1(r.s.D)} · 중원 ${f1(r.s.M)} · 공격 ${f1(r.s.A)} · GK ${f1(r.s.gk)}</small></span><b class="num">${f1(r.power)}</b>${i === 0 && r.id !== me.form ? `<button class="btn small" data-act="form" data-id="${r.id}">추천 적용</button>` : ''}</li>`).join('')}</ul>
  <h3>벤치</h3><div class="chips">${bench || '<span class="mute">없음</span>'}</div>
  <h3>훈련 집중</h3><div class="seg">${TRAIN_FOCUS.map(([k, l]) => `<button class="${s.trainFocus === k ? 'on' : ''}" data-act="focus" data-v="${k}">${l}</button>`).join('')}</div>`;
}
export function slotPicker(s, slotIdx) {
  const me = G.userTeam(s), slot = formOf(me.form).slots[slotIdx];
  const cands = me.players.filter((p) => (p.pos === 'GK') === (slot.r === 'GK')).map((p) => ({ p, v: Math.round(caAt(p, slot.r) * famOf(p, slot.r)) })).sort((a, b) => b.v - a.v);
  return `<header class="sheet-h"><div><h2>${ROLE_LABEL[slot.r]}</h2><span class="mute">이 자리에서 뛸 선수를 고르세요</span></div></header>
  <ul class="list">${cands.map(({ p, v }) => `<li><button class="rowbtn" data-act="set-slot" data-i="${slotIdx}" data-pid="${p.id}"><span class="pos ${POSG[p.pos]}">${p.pos}</span><span class="grow">${esc(p.name)} ${statusTag(p)}<small>CA ${caOf(p)} · 컨디션 ${Math.round(p.cond)}%</small></span><span class="ca"><b>${v}</b></span></button></li>`).join('')}</ul>
  <div class="actions"><button class="btn ghost" data-act="close">닫기</button></div>`;
}

// ───────── 리그 탭 ─────────
export function rulesText(s, di) {
  const L = LEAGUES[s.country], r = L.rules, d = L.divs[di], n = d.n;
  const rounds = s.divs[di].rounds.length;
  const parts = [`${n}팀 · ${rounds}라운드${d.split ? '(정규 33 + 파이널 5)' : ''} · 승 3점 무 1점 패 0점`];
  if (di === 0) parts.push(`강등 ${r.relegate}팀${r.playoff === 'bl' ? ' + 16위 승강 PO' : r.playoff === 'kl' ? ' + 11위 승강 PO' : ''} · 상위 ${r.continental}팀 대륙 대회`);
  else parts.push(`상위 ${r.promoteAuto}팀 자동 승격${r.playoff === 'six' ? ' + 3~8위 플레이오프 우승팀' : r.playoff === 'bl' ? ' · 3위는 1부 16위와 승강 PO' : ' · 2위는 1부 11위와 승강 PO'}`);
  return parts.join('<br>');
}
export function leagueView(s, ui) {
  const seg = ui.lseg || 'table';
  const di = ui.ldiv ?? G.userTeam(s).div;
  const L = LEAGUES[s.country], r = L.rules;
  let body = '';
  if (seg === 'table') {
    const st = G.standings(s, di);
    const n = st.length;
    const zone = (rank) => {
      if (di === 0) return rank > n - r.relegate ? 'z-down' : r.playoff !== 'six' && r.playoff && rank === n - r.relegate ? 'z-po' : rank <= r.continental ? 'z-cont' : '';
      return rank <= r.promoteAuto ? 'z-up' : (r.playoff === 'six' && rank >= 3 && rank <= 8) || (r.playoff === 'bl' && rank === 3) || (r.playoff === 'kl' && rank === 2) ? 'z-po' : '';
    };
    const split = s.divs[di].splitDone;
    body = `<div class="tablewrap"><table class="standings"><thead><tr><th></th><th class="nm">팀</th><th>경기</th><th>승</th><th>무</th><th>패</th><th>득실</th><th>승점</th></tr></thead><tbody>${st.map((x) => `<tr class="${x.id === s.userId ? 'me ' : ''}${zone(x.rank)}${split && x.rank === Math.ceil(n / 2) ? ' cut' : ''}"><td class="rk">${x.rank}</td><td class="nm"><i style="background:${x.color}"></i>${esc(x.name)}</td><td>${x.p}</td><td>${x.w}</td><td>${x.d}</td><td>${x.l}</td><td>${x.gd > 0 ? '+' : ''}${x.gd}</td><td><b>${x.pts}</b>${x.deduct ? '<sup>−</sup>' : ''}</td></tr>`).join('')}</tbody></table></div>
    <p class="legend"><span class="z z-cont"></span>대륙 대회 <span class="z z-up"></span>승격 <span class="z z-po"></span>플레이오프 <span class="z z-down"></span>강등</p>
    <p class="mute small">${rulesText(s, di)}</p>`;
  } else if (seg === 'hist') {
    body = s.history.seasons.length ? `<ul class="list">${s.history.seasons.map((h) => `<li><span class="grow">${h.label} ${esc(h.div)}<small>우승 ${esc(h.champion)} · 득점왕 ${h.scorer ? `${esc(h.scorer.name)} ${h.scorer.g}골` : '-'}${h.promoted ? ' · 승격' : ''}${h.relegated ? ' · 강등' : ''}</small></span><b>${h.rank}위</b></li>`).join('')}</ul>` : '<p class="empty">아직 끝난 시즌이 없습니다.</p>';
  } else {
    const key = seg === 'goals' ? 'g' : seg === 'assists' ? 'a' : 'rt';
    const rows = G.leaders(s, key, 15, di);
    body = rows.length ? `<ul class="list">${rows.map((x, i) => `<li><span class="rk2">${i + 1}</span><button class="rowbtn inl" data-act="player" data-src="view" data-pid="${x.p.id}"><span class="grow">${esc(x.p.name)}<small>${esc(x.team.name)} · ${x.p.pos} · ${x.app}경기</small></span><b class="num">${key === 'rt' ? f1(x.v) : x.v}</b></button></li>`).join('')}</ul>` : '<p class="empty">아직 기록이 없습니다.</p>';
  }
  return `<section class="head"><div><span class="eyebrow">${G.seasonLabel(s)}</span><h2>리그</h2></div></section>
  <div class="seg small">${L.divs.map((d, i) => `<button class="${di === i ? 'on' : ''}" data-act="ldiv" data-v="${i}">${d.name}</button>`).join('')}</div>
  <div class="seg">${[['table', '순위'], ['goals', '득점'], ['assists', '도움'], ['rating', '평점'], ['hist', '역대']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="lseg" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}

// ───────── 구단 탭 ─────────
export function badgeCount(s) { return s.offers.length; }
export function clubView(s, ui) {
  const me = G.userTeam(s), seg = ui.cseg || 'info';
  let body = '';
  if (seg === 'info') {
    const rounds = G.roundsOf(s), rev = G.annualRevenue(s, me), wages = G.wageBill(me), up = G.upkeepAnnual(s), scr = G.scrInfo(s);
    const net = (rev - wages - up) / rounds;
    body = `<section class="card">
      <div class="kv"><span>보유 자금</span><b>${money(s.money)}</b></div>
      <div class="kv"><span>평판</span><b>${Math.round(me.rep)}</b></div>
      <div class="kv"><span>연 수입(추정)</span><b>${money(rev)}</b></div>
      <div class="kv"><span>연 선수 연봉</span><b>${money(wages)}</b></div>
      <div class="kv"><span>시설 유지비</span><b>${money(up)}</b></div>
      <div class="kv"><span>라운드당 손익(추정)</span><b class="${net >= 0 ? 'pos-t' : 'neg-t'}">${net >= 0 ? '+' : ''}${money(net)}</b></div>
    </section>
    <h3>선수단 비용 비율</h3>
    <div class="card"><div class="gauge scr"><i class="${scr.ratio > scr.red && scr.enforce ? 'over' : scr.ratio > scr.green ? 'warn' : ''}" style="width:${Math.min(100, (scr.ratio / 1.3) * 100)}%"></i><u style="left:${(scr.green / 1.3) * 100}%"></u>${scr.enforce ? `<u class="red" style="left:${(scr.red / 1.3) * 100}%"></u>` : ''}</div>
    <div class="kv"><span>(연봉 + 이적료 상각) / 수입</span><b>${Math.round(scr.ratio * 100)}%</b></div>
    <p class="mute small">${scr.enforce ? `한도 ${Math.round(scr.green * 100)}%는 2026/27 잉글랜드 선수단 비용 비율 규정을 따릅니다. 초과 시 부담금, 크게 초과(${Math.round(scr.red * 100)}%) 시 승점 삭감(시즌 80% 시점 점검)의 세부 수치는 <b>게임 설정</b>입니다.` : `권장 한도 ${Math.round(scr.green * 100)}% (이 리그는 게임에서 경고만 합니다).`}</p></div>
    <h3>시설 투자</h3><ul class="list fac">${Object.keys(G.FAC_INFO).map((k) => { const lv = s.fac[k], max = lv >= G.FAC_MAX, cost = G.facCost(s, k, lv), can = !max && s.money >= cost; return `<li><div class="grow"><b>${G.FAC_INFO[k].name}</b> <span class="mute">Lv ${lv}</span><small>${G.FAC_INFO[k].desc}</small></div><button class="btn small${can ? '' : ' off'}" data-act="fac" data-key="${k}" ${max ? 'disabled' : ''}>${max ? '최대' : money(cost)}</button></li>`; }).join('')}</ul>`;
  } else if (seg === 'market') {
    const w = G.windowInfo(s), r = G.rulesOf(s), lin = G.loansIn(s), lout = G.loansOut(s);
    const sub = ui.msub || 'buy';
    const offers = s.offers.map((o) => { const p = me.players.find((x) => x.id === o.pid); return p ? `<li><button class="rowbtn" data-act="player" data-pid="${p.id}"><span class="pos ${POSG[p.pos]}">${p.pos}</span><span class="grow">${esc(p.name)}<small>${esc(s.teams[o.teamId].name)} · 제안 ${money(o.fee)} · ${Math.max(0, o.expires - s.tick)}라운드 유효</small></span></button><span class="oact"><button class="btn small" data-act="accept-offer" data-id="${o.id}">수락</button><button class="btn small ghost" data-act="reject-offer" data-id="${o.id}">거절</button></span></li>` : ''; }).join('');
    const list = (arr, src, price) => `<ul class="list roster">${arr.map(({ p, t }) => playerRowM(s, p, t, src, price)).join('')}</ul>`;
    body = `<div class="card ${w.open ? 'good' : ''}"><b>${w.open ? `${w.label} 열림` : '이적시장 닫힘'}</b><small>${w.open ? (w.left ? `${w.left}라운드 뒤 마감` : '오프시즌에는 계속 열려 있습니다') : `${w.label} ${w.left}라운드 뒤 열림`}</small></div>
    ${offers ? `<h3>받은 제안</h3><ul class="list offers">${offers}</ul>` : ''}
    <div class="seg small"><button class="${sub === 'buy' ? 'on' : ''}" data-act="msub" data-v="buy">이적</button><button class="${sub === 'loan' ? 'on' : ''}" data-act="msub" data-v="loan">임대</button><button class="${sub === 'free' ? 'on' : ''}" data-act="msub" data-v="free">자유계약</button></div>
    ${sub === 'buy' ? `<p class="mute small">영입하면 상대 구단은 비슷한 선수를 새로 보충합니다. <b>PA는 스카우트 수준에 따라 범위</b>로 보입니다.</p>${list(G.marketPlayers(s), 'market')}` : ''}
    ${sub === 'loan' ? `<p class="mute small">임대료 + 연봉을 내고 시즌이 끝날 때까지 빌립니다. 동시에 최대 ${r.loanInMax}명${r.loanInVerified ? '(잉글랜드 공식 규정)' : ' (이 값은 게임 설정입니다)'}. 현재 ${lin.length}명. 임대 중에도 완전 영입 옵션을 쓸 수 있습니다.</p>${list(G.loanCandidates(s), 'loan')}${lout.length ? `<h3>내가 임대 보낸 선수 ${lout.length}/${r.loanOutMax}</h3><ul class="list roster">${lout.map(({ p, t }) => playerRow(s, p, `${esc(t.name)}에서 뛰는 중`, 'out')).join('')}</ul>` : ''}` : ''}
    ${sub === 'free' ? `<p class="mute small">자유계약 선수는 계약 보너스만 내고 데려옵니다(이적시장이 닫혀도 가능).</p><ul class="list roster">${s.market.free.map((p) => playerRow(s, p, `${money(G.freePrice(p))} · 희망 연봉 ${money(p.w)}`, 'free')).join('')}</ul>` : ''}`;
  } else if (seg === 'news') {
    body = s.news.length ? `<ul class="list news">${s.news.map(newsRow).join('')}</ul>` : '<p class="empty">아직 소식이 없습니다.</p>';
  } else {
    body = `<div class="field"><span>경기 간격</span><div class="seg">${G.INTERVAL_CHOICES.map((m) => `<button class="${s.intervalMin === m ? 'on' : ''}" data-act="interval" data-min="${m}">${m}분</button>`).join('')}</div></div>
    <div class="card"><div class="row between"><div><b>방치형 자동 진행</b><small>시즌이 끝나도 멈추지 않고 어시스턴트가 다음 시즌을 시작합니다</small></div><button class="btn small${s.settings.autopilot ? '' : ' ghost'}" data-act="setting" data-key="autopilot">${s.settings.autopilot ? '켜짐' : '꺼짐'}</button></div></div>
    <div class="card"><div class="row between"><div><b>자동 재계약</b><small>필요한 선수만, 재정 한도 안에서</small></div><button class="btn small${s.settings.autoRenew ? '' : ' ghost'}" data-act="setting" data-key="autoRenew">${s.settings.autoRenew ? '켜짐' : '꺼짐'}</button></div></div>
    <div class="actions col"><button class="btn ghost" data-act="rename-team">구단 이름 변경</button><button class="btn ghost" data-act="backup">백업 / 복원</button><button class="btn ghost danger" data-act="reset">새로 시작</button></div>
    <p class="mute small">앱을 닫아도 시간은 흐릅니다. 다시 열면 그동안의 라운드가 한꺼번에 반영됩니다(한 번에 최대 ${G.MAX_CATCHUP}라운드).${s.dev.used ? '<br>개발자 메뉴를 사용한 저장 데이터입니다.' : ''}${ui.backupAge ? `<br>마지막 백업: ${ui.backupAge}` : '<br>아직 백업하지 않았습니다. iOS가 웹 데이터를 지울 수 있어서 가끔 백업하세요.'}</p>`;
  }
  const badge = s.offers.length;
  return `<section class="head"><div><span class="eyebrow">${esc(me.name)}</span><h2>구단</h2></div></section>
  <div class="seg">${[['info', '현황'], ['market', `이적${badge ? ` (${badge})` : ''}`], ['news', '소식'], ['set', '설정']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-act="cseg" data-v="${k}">${l}</button>`).join('')}</div>${body}`;
}
function playerRowM(s, p, t, src, price) {
  const e = G.paEstimate(s, p);
  const cost = src === 'market' ? G.askPrice(p) : src === 'loan' ? G.loanFee(p) : 0;
  return `<li><button class="rowbtn" data-act="player" data-src="${src}" data-pid="${p.id}"><span class="pos ${POSG[p.pos]}">${p.pos}</span><span class="grow">${esc(p.name)}<small>${p.age}세 · ${esc(t.name)} · ${money(cost)}${src === 'loan' ? ' (+연봉)' : ''}</small></span><span class="ca"><b>${caOf(p)}</b><i>/${e.err ? `${e.lo}~${e.hi}` : e.mid}</i></span></button></li>`;
}

export function importSheet(state = {}) {
  const r = state.result;
  const msg = !r ? '' : r.ok
    ? `<div class="card good"><b>사용할 수 있는 데이터입니다</b><small>${LEAGUES[r.pack.country].top} · 구단 ${r.stats.clubs}개 · 선수 ${r.stats.players}명</small></div>`
    : `<div class="card alert"><b>가져올 수 없습니다</b><small>${r.errors.map(esc).join('<br>')}${r.stats.moreErrors ? `<br>… 외 ${r.stats.moreErrors}건` : ''}</small></div>`;
  const warn = r && r.warnings.length ? `<p class="mute small">참고: ${r.warnings.map(esc).join(' · ')}</p>` : '';
  return `<header class="sheet-h"><div><h2>데이터 팩 가져오기</h2><span class="mute">CSV 또는 JSON. 형식은 docs/soccer/REAL-DATA.md 에 있습니다.</span></div></header>
  <label class="lab">붙여넣기</label><textarea id="pk-in" rows="5" placeholder="country,division,club,rank,name,pos,birth,ovr,value,hype&#10;epl,1,…">${esc(state.text || '')}</textarea>
  <div class="actions"><button class="btn" data-act="import-check">검사하기</button><label class="btn ghost filebtn">파일 선택<input type="file" id="pk-file" accept=".csv,.json,.txt,text/csv,application/json,text/plain" hidden></label></div>
  ${msg}${warn}
  <div class="actions col">${r && r.ok ? '<button class="btn" data-act="import-go">이 데이터로 구단 고르기</button>' : ''}<button class="btn ghost" data-act="import-template">CSV 양식 복사</button><button class="btn ghost" data-act="close">닫기</button></div>`;
}
export const csvTemplate = () => CSV_TEMPLATE;

export function backupSheet(text) {
  return `<header class="sheet-h"><div><h2>백업 / 복원</h2><span class="mute">iOS가 웹 데이터를 지울 수 있어서 가끔 백업해 두세요.</span></div></header>
  <label class="lab">백업 데이터</label><textarea id="bk-out" readonly rows="4">${esc(text)}</textarea>
  <div class="actions"><button class="btn" data-act="bk-copy">복사</button><button class="btn ghost" data-act="bk-file">파일로 저장</button></div>
  <label class="lab">복원</label><textarea id="bk-in" rows="3" placeholder="백업 데이터를 붙여넣으세요"></textarea>
  <div class="actions"><button class="btn ghost" data-act="bk-restore">붙여넣은 데이터로 복원</button><label class="btn ghost filebtn">파일에서 복원<input type="file" id="bk-file" accept=".json,.txt,application/json,text/plain" hidden></label></div>
  <div class="actions"><button class="btn" data-act="close">닫기</button></div>`;
}
export function devSheet(s) {
  const sc = s.dev.timeScale;
  const b = (l, a, x = '') => `<button class="btn ghost small" data-act="${a}" ${x}>${l}</button>`;
  return `<header class="sheet-h"><div><h2>개발자 메뉴</h2><span class="mute">테스트용. 사용하면 저장 데이터에 표시됩니다.</span></div></header>
  <label class="lab">시간 배속 (현재 x${sc})</label><div class="seg">${[1, 10, 60, 900].map((x) => `<button class="${sc === x ? 'on' : ''}" data-act="dev-scale" data-x="${x}">x${x}</button>`).join('')}</div>
  <label class="lab">자금 / 선수</label><div class="actions wrap">${b('+10억', 'dev-money', 'data-v="100000"')}${b('+100억', 'dev-money', 'data-v="1000000"')}${b('능력치 +2', 'dev-boost')}${b('전원 회복', 'dev-heal')}</div>
  <label class="lab">진행</label><div class="actions wrap">${b('시즌 끝까지', 'dev-end')}</div>
  <div class="actions"><button class="btn" data-act="close">닫기</button></div>`;
}

// 중계 중에는 경기 전 스냅샷(ui.before)을 보여 주어 승패가 미리 드러나지 않게 한다
export function displayState(s, ui) { return ui.live && ui.before ? { ...ui.before, latest: s.latest } : s; }
