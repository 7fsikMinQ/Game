// 상태 -> HTML 문자열. DOM을 건드리지 않는 순수 함수라서 Node에서 테스트할 수 있다.
import { esc, fmtMoney, fmtAvg, fmtPct, fmtIP, fmtEra, fmtClock } from './util.js';
import { ovrOf, statKeys, STAT_LABEL, teamOvr } from './league.js';
import { POS_LABEL } from './data.js';
import { standings, userTeam, USER_ID, FAC_INFO, FAC_MAX, facCost, trainCost, intervalMs, INTERVAL_CHOICES } from './game.js';

const ICONS = {
  home: '<path d="M12 3.5 20.5 12 12 20.5 3.5 12z"/>',
  roster: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.9.3 5 2.6 5 5.8"/>',
  table: '<path d="M5 20V11M12 20V4M19 20v-6M3 20h18"/>',
  club: '<path d="M3 21h18M5 21V9.5L12 4l7 5.5V21M10 21v-6h4v6"/>',
};
export const TABS = [
  ['home', '경기'],
  ['roster', '선수단'],
  ['table', '순위'],
  ['club', '구단'],
];

export const navHTML = (tab) =>
  TABS.map(
    ([id, label]) =>
      `<button class="tab${id === tab ? ' on' : ''}" data-act="tab" data-tab="${id}" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[id]}</svg><span>${label}</span></button>`,
  ).join('');

const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);

// ───────── 스코어보드 ─────────
// vm = { awayName, homeName, away:[], home:[], hitsA, hitsH, live? }
export function boardHTML(vm) {
  const n = Math.max(9, vm.away.length, vm.home.length);
  const cols = Array.from({ length: n }, (_, i) => i);
  const cell = (v) => (v === null || v === undefined ? '<td class="x">·</td>' : `<td${v > 0 ? ' class="run"' : ''}>${v}</td>`);
  const row = (name, arr, hits, mine) =>
    `<tr${mine ? ' class="me"' : ''}><th>${esc(name)}</th>${cols.map((i) => (i < arr.length ? cell(arr[i]) : '<td class="x"></td>')).join('')}<td class="tot">${sum(arr)}</td><td class="tot">${hits}</td></tr>`;
  return `<div class="board" role="table" aria-label="스코어보드"><table>
    <thead><tr><th></th>${cols.map((i) => `<td>${i + 1}</td>`).join('')}<td class="tot">R</td><td class="tot">H</td></tr></thead>
    <tbody>${row(vm.awayName, vm.away, vm.hitsA, vm.awayMine)}${row(vm.homeName, vm.home, vm.hitsH, vm.homeMine)}</tbody>
  </table></div>`;
}

export function boardFromEntry(s, e) {
  return {
    awayName: s.teams[e.awayId].name,
    homeName: s.teams[e.homeId].name,
    away: e.line.away,
    home: e.line.home,
    hitsA: e.hits.away,
    hitsH: e.hits.home,
    awayMine: e.awayId === USER_ID,
    homeMine: e.homeId === USER_ID,
  };
}

// 중계 연출: 앞에서부터 n개의 플레이까지만 반영한 스코어보드.
export function boardFromPlays(s, e, n) {
  const away = [];
  const home = [];
  let ha = 0;
  let hh = 0;
  for (const p of e.plays.slice(0, n)) {
    const arr = p.half === 0 ? away : home;
    while (arr.length < p.inn) arr.push(0);
    arr[p.inn - 1] += p.runs;
    if (p.hit) p.half === 0 ? ha++ : hh++;
  }
  return { ...boardFromEntry(s, e), away, home, hitsA: ha, hitsH: hh };
}

export function playLine(s, e, p) {
  return `<li class="${p.runs ? 'score' : ''}"><b>${p.inn}회${p.half ? '말' : '초'}</b><span>${esc(p.text)}</span></li>`;
}

// ───────── 경기 탭 ─────────
export function nextMatchup(s) {
  let fx = null;
  let label = '';
  if (s.phase === 'regular') {
    fx = s.schedule[s.roundIdx].find((f) => f.h === USER_ID || f.a === USER_ID);
    label = `정규 ${s.roundIdx + 1}/${s.schedule.length}`;
  } else if (s.phase === 'playoffs') {
    fx = s.playoff.rounds[s.playoff.round].find((f) => f.h === USER_ID || f.a === USER_ID);
    label = s.playoff.round === 0 ? '포스트시즌 준결승' : '포스트시즌 결승';
  }
  if (!fx) return null;
  const home = fx.h === USER_ID;
  return { label, oppId: home ? fx.a : fx.h, home };
}

const streakText = (n) => (n >= 2 ? `${n}연승` : n <= -2 ? `${-n}연패` : '-');

export function homeView(s, ui, now) {
  if (s.phase === 'offseason') return offseasonView(s, ui);
  const me = userTeam(s);
  const st = standings(s);
  const rank = st.find((r) => r.id === USER_ID).rank;
  const mu = nextMatchup(s);
  // 중계 중에는 방금 경기 결과가 먼저 보이지 않게 직전 기록으로 보여준다.
  const hide = ui.live && s.latest ? s.latest : null;
  const shownW = me.w - (hide && hide.season === s.season && hide.label.startsWith('정규') && hide.won ? 1 : 0);
  const shownL = me.l - (hide && hide.season === s.season && hide.label.startsWith('정규') && !hide.won ? 1 : 0);
  const shownMoney = s.money - (hide ? hide.income : 0);
  const iv = intervalMs(s);
  const left = Math.max(0, s.nextGameAt - now);
  const pct = Math.min(100, Math.max(0, (1 - left / iv) * 100));
  const phaseLabel = s.phase === 'regular' ? `정규시즌 ${s.roundIdx}/${s.schedule.length}` : '포스트시즌';
  const live = ui.live;
  const entry = s.latest;
  let board = '';
  if (entry) {
    board = live ? boardFromPlays(s, entry, live.shown) : boardFromEntry(s, entry);
  }
  const report = ui.report
    ? `<section class="card report"><div><b>자리를 비운 동안</b><p>${ui.report.games}경기 진행 · ${ui.report.wins}승 ${ui.report.losses}패 · 자금 ${ui.report.money >= 0 ? '+' : ''}${fmtMoney(ui.report.money)}${ui.report.skipped ? `<br><span class="mute">최대 ${ui.report.games}경기까지만 반영됩니다.</span>` : ''}</p></div><button class="btn small ghost" data-act="dismiss-report">확인</button></section>`
    : '';
  const recent = s.history.games.slice(live ? 1 : 0, live ? 7 : 6);
  return `
  ${report}
  <section class="head">
    <div><span class="eyebrow">시즌 ${s.season} · ${phaseLabel}</span>
    <h2>${esc(me.name)}</h2></div>
    <div class="rec"><b>${shownW}</b>승 <b>${shownL}</b>패</div>
  </section>
  <section class="stats4">
    <div><span>순위</span><b>${live ? '-' : rank + '위'}</b></div>
    <div><span>승률</span><b>${fmtPct(shownW, shownL)}</b></div>
    <div><span>흐름</span><b>${live ? '-' : streakText(s.streak)}</b></div>
    <div><span>자금</span><b>${fmtMoney(shownMoney)}</b></div>
  </section>
  <section class="card next">
    <div class="row between"><span class="eyebrow">다음 경기${mu ? ` · ${mu.label}` : ''}</span><span class="clock" id="cd">${fmtClock(left)}</span></div>
    <div class="bar"><i id="cdbar" style="width:${pct.toFixed(1)}%"></i></div>
    <p class="vs">${mu ? `${mu.home ? '홈' : '원정'} · vs <b>${esc(s.teams[mu.oppId].name)}</b>` : ''}</p>
  </section>
  <section>
    <h3>${live ? '중계 중' : '최근 경기'}</h3>
    <div id="board">${entry ? boardHTML(board) : '<p class="empty">첫 경기를 기다리는 중입니다.</p>'}</div>
    ${entry && !live ? `<p class="meta" id="boardmeta">${entry.label} · ${entry.won ? '승' : '패'} ${entry.us}:${entry.them}${entry.walkoff ? ' · 끝내기' : ''} · 승 ${esc(entry.wp)} / 패 ${esc(entry.lp)}</p>` : ''}
    ${live ? `<ol class="plays" id="plays">${entry.plays.slice(0, live.shown).map((p) => playLine(s, entry, p)).reverse().join('')}</ol><button class="btn small ghost" data-act="skip-live">건너뛰기</button>` : entry ? `<ol class="plays" id="plays">${entry.key.map((p) => playLine(s, entry, p)).join('') || '<li class="mute">득점 장면이 없었습니다.</li>'}</ol>` : ''}
  </section>
  ${recent.length ? `<section><h3>경기 기록</h3><ul class="list results">${recent.map((g) => resultRow(s, g)).join('')}</ul></section>` : ''}`;
}

function resultRow(s, g) {
  return `<li><span class="tag ${g.won ? 'w' : 'l'}">${g.won ? '승' : '패'}</span><span class="grow">${g.home ? '' : '@ '}${esc(s.teams[g.oppId].name)}<small>${g.season}시즌 · ${g.label}</small></span><b class="num">${g.us}:${g.them}</b><span class="num mute">${g.income >= 0 ? '+' : ''}${g.income}</span></li>`;
}

function offseasonView(s, ui) {
  const o = s.offseason;
  const c = s.history.champions[0];
  const me = userTeam(s);
  const candidates = o.candidates
    .map((p, i) => `<li><button class="rowbtn" data-act="cand" data-i="${i}" ${o.drafted ? 'disabled' : ''}><span class="ovr">${ovrOf(p)}</span><span class="grow">${esc(p.name)}<small>${POS_LABEL[p.role === 'H' ? 'DH' : p.role]} · ${p.age}세 · 잠재력 ${p.pot}</small></span></button></li>`)
    .join('');
  const pick = ui.pick;
  let picker = '';
  if (pick != null && !o.drafted) {
    const cand = o.candidates[pick];
    const pool = me.players.filter((p) => (p.role === 'H') === (cand.role === 'H')).sort((a, b) => ovrOf(a) - ovrOf(b));
    picker = `<div class="card"><p><b>${esc(cand.name)}</b>을(를) 영입하고 내보낼 선수를 고르세요.</p><ul class="list">${pool
      .map((p) => `<li><button class="rowbtn" data-act="replace" data-pid="${p.id}"><span class="ovr">${ovrOf(p)}</span><span class="grow">${esc(p.name)}<small>${POS_LABEL[p.pos]} · ${p.age}세</small></span></button></li>`)
      .join('')}</ul><button class="btn ghost small" data-act="cand-cancel">취소</button></div>`;
  }
  return `
  <section class="head"><div><span class="eyebrow">시즌 ${s.season} 종료</span><h2>오프시즌</h2></div><div class="rec"><b>${me.w}</b>승 <b>${me.l}</b>패</div></section>
  <section class="card">
    <div class="kv"><span>우승</span><b>${esc(c.name)}</b></div>
    <div class="kv"><span>정규시즌 순위</span><b>${c.rank}위</b></div>
    <div class="kv"><span>시즌 보상</span><b>+${fmtMoney(o.bonus)}</b></div>
    <div class="kv"><span>자금</span><b>${fmtMoney(s.money)}</b></div>
  </section>
  <section><h3>신인 드래프트 ${o.drafted ? '<small class="mute">완료</small>' : ''}</h3>
    <p class="mute">한 명을 영입하면 같은 계열(타자/투수) 선수 한 명이 팀을 떠납니다. 건너뛰어도 됩니다.</p>
    <ul class="list">${candidates}</ul>${picker}</section>
  <section class="actions">
    <button class="btn" data-act="next-season">다음 시즌 시작</button>
    ${o.drafted ? '' : '<button class="btn ghost" data-act="auto-next">자동 드래프트하고 시작</button>'}
  </section>
  <p class="mute small">다음 시즌이 시작되면 모든 선수의 나이와 능력치가 변합니다.</p>`;
}

// ───────── 선수단 탭 ─────────
function hitLine(p) {
  const x = p.s;
  return x ? `타율 ${fmtAvg(x.h, x.ab)} · 홈런 ${x.hr} · 타점 ${x.rbi}` : '기록 없음';
}
function pitLine(p) {
  const x = p.s;
  return x && x.g ? `ERA ${fmtEra(x.er, x.outs)} · ${fmtIP(x.outs)}이닝 · ${x.w}승 ${x.l}패 · K ${x.k}` : '기록 없음';
}
export const playerLine = (p) => (p.role === 'H' ? hitLine(p) : pitLine(p));

export function rosterView(s, ui) {
  const me = userTeam(s);
  const seg = ui.seg;
  const list = me.players.filter((p) => (seg === 'H' ? p.role === 'H' : p.role !== 'H')).sort((a, b) => (seg === 'H' ? 0 : a.role === b.role ? 0 : a.role === 'SP' ? -1 : 1));
  const mine = teamOvr(me);
  const all = s.teams.map(teamOvr);
  const rankOf = (k) => 1 + all.filter((t) => t[k] > mine[k] + 1e-9).length;
  return `
  <section class="head"><div><span class="eyebrow">전력</span><h2>선수단</h2></div></section>
  <section class="stats4">
    <div><span>타선</span><b>${mine.bat.toFixed(1)}</b><small>${rankOf('bat')}위</small></div>
    <div><span>선발</span><b>${mine.sp.toFixed(1)}</b><small>${rankOf('sp')}위</small></div>
    <div><span>불펜</span><b>${mine.rp.toFixed(1)}</b><small>${rankOf('rp')}위</small></div>
    <div><span>종합</span><b>${mine.total.toFixed(1)}</b><small>${rankOf('total')}위</small></div>
  </section>
  <div class="seg" role="tablist"><button class="${seg === 'H' ? 'on' : ''}" data-act="seg" data-seg="H">타자</button><button class="${seg === 'P' ? 'on' : ''}" data-act="seg" data-seg="P">투수</button></div>
  <ul class="list roster">${list
    .map(
      (p) => `<li><button class="rowbtn" data-act="player" data-pid="${p.id}"><span class="ovr">${ovrOf(p)}</span><span class="grow">${esc(p.name)}<small>${POS_LABEL[p.pos]} · ${p.age}세 · ${playerLine(p)}</small></span><span class="chev" aria-hidden="true">›</span></button></li>`,
    )
    .join('')}</ul>
  <p class="mute small">숫자는 종합 능력치입니다. 선수를 눌러 훈련시킬 수 있습니다.</p>`;
}

export function playerSheet(s, pid) {
  const p = userTeam(s).players.find((x) => x.id === pid);
  if (!p) return '';
  const rows = statKeys(p)
    .map((k) => {
      const full = p[k] >= p.pot;
      const cost = trainCost(s, p, k);
      const can = !full && s.money >= cost;
      return `<div class="stat"><span class="lab">${STAT_LABEL[k]}</span><div class="meter"><i style="width:${p[k]}%"></i><u style="left:${p.pot}%"></u></div><b class="num">${p[k]}</b>
      <button class="btn small${can ? '' : ' off'}" data-act="train" data-pid="${p.id}" data-stat="${k}" ${full ? 'disabled' : ''}>${full ? '한계' : fmtMoney(cost)}</button></div>`;
    })
    .join('');
  return `
  <header class="sheet-h"><div><h2>${esc(p.name)}</h2><span class="mute">${POS_LABEL[p.pos]} · ${p.age}세</span></div><div class="big"><b>${ovrOf(p)}</b><small>잠재 ${p.pot}</small></div></header>
  <div class="stats">${rows}</div>
  <p class="meta">${playerLine(p)}</p>
  <p class="mute small">막대의 가는 선이 잠재력(한계)입니다. 보유 자금 ${fmtMoney(s.money)}</p>
  <div class="actions"><button class="btn ghost" data-act="rename-player" data-pid="${p.id}">이름 변경</button><button class="btn" data-act="close">닫기</button></div>`;
}

// ───────── 순위 탭 ─────────
export function tableView(s) {
  const st = standings(s);
  const cut = s.phase === 'offseason' ? 0 : 4;
  const rows = st
    .map(
      (r) => `<tr class="${r.id === USER_ID ? 'me' : ''}${r.rank === cut ? ' cut' : ''}"><td class="rk">${r.rank}</td><td class="nm"><i style="background:${r.color}"></i>${esc(r.name)}</td><td>${r.w}</td><td>${r.l}</td><td>${fmtPct(r.w, r.l)}</td><td>${r.gb === 0 ? '-' : r.gb}</td><td>${r.rs - r.ra > 0 ? '+' : ''}${r.rs - r.ra}</td></tr>`,
    )
    .join('');
  const champs = s.history.champions;
  return `
  <section class="head"><div><span class="eyebrow">시즌 ${s.season}</span><h2>순위</h2></div></section>
  <div class="tablewrap"><table class="standings"><thead><tr><th></th><th class="nm">팀</th><th>승</th><th>패</th><th>승률</th><th>차</th><th>득실</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="mute small">상위 4팀이 포스트시즌(단판 토너먼트)에 진출합니다. 승수가 같으면 득실차로 정합니다.</p>
  <section><h3>역대 우승</h3>${
    champs.length
      ? `<ul class="list">${champs.map((c) => `<li><span class="grow">시즌 ${c.season}<small>내 순위 ${c.rank}위 (${c.w}승 ${c.l}패)</small></span><b>${esc(c.name)}</b></li>`).join('')}</ul>`
      : '<p class="empty">아직 끝난 시즌이 없습니다.</p>'
  }</section>`;
}

// ───────── 구단 탭 ─────────
export function clubView(s) {
  const fac = Object.keys(FAC_INFO)
    .map((k) => {
      const lv = s.fac[k];
      const max = lv >= FAC_MAX;
      const cost = facCost(k, lv);
      const can = !max && s.money >= cost;
      return `<li><div class="grow"><b>${FAC_INFO[k].name}</b> <span class="mute">Lv ${lv}</span><small>${FAC_INFO[k].desc}</small></div><button class="btn small${can ? '' : ' off'}" data-act="fac" data-key="${k}" ${max ? 'disabled' : ''}>${max ? '최대' : fmtMoney(cost)}</button></li>`;
    })
    .join('');
  const total = s.totals;
  return `
  <section class="head"><div><span class="eyebrow">${esc(userTeam(s).name)}</span><h2>구단</h2></div></section>
  <section class="card">
    <div class="kv"><span>보유 자금</span><b>${fmtMoney(s.money)}</b></div>
    <div class="kv"><span>인기</span><b>${Math.round(s.hype)} / 100</b></div>
    <div class="kv"><span>통산</span><b>${total.wins}승 ${total.games - total.wins}패</b></div>
    <div class="kv"><span>누적 수입</span><b>${fmtMoney(total.earned)}</b></div>
  </section>
  <section><h3>시설 투자</h3><ul class="list fac">${fac}</ul></section>
  <section><h3>설정</h3>
    <div class="field"><span>경기 간격</span><div class="seg">${INTERVAL_CHOICES.map((m) => `<button class="${s.intervalMin === m ? 'on' : ''}" data-act="interval" data-min="${m}">${m}분</button>`).join('')}</div></div>
    <div class="actions col">
      <button class="btn ghost" data-act="rename-team">팀 이름 변경</button>
      <button class="btn ghost" data-act="backup">백업 / 복원</button>
      <button class="btn ghost danger" data-act="reset">새로 시작</button>
    </div>
  </section>
  <p class="mute small">앱을 닫아도 시간은 흐릅니다. 다시 열면 그동안의 경기가 한꺼번에 반영됩니다(최대 200경기).${s.dev.used ? '<br>개발자 메뉴를 사용한 저장 데이터입니다.' : ''}</p>`;
}

export function backupSheet(text) {
  return `
  <header class="sheet-h"><div><h2>백업 / 복원</h2><span class="mute">iOS가 웹 데이터를 지울 수 있어서 가끔 백업해 두세요.</span></div></header>
  <label class="lab">백업 데이터</label>
  <textarea id="bk-out" readonly rows="4">${esc(text)}</textarea>
  <div class="actions"><button class="btn" data-act="bk-copy">복사</button><button class="btn ghost" data-act="bk-file">파일로 저장</button></div>
  <label class="lab">복원</label>
  <textarea id="bk-in" rows="3" placeholder="백업 데이터를 붙여넣으세요"></textarea>
  <div class="actions"><button class="btn ghost" data-act="bk-restore">붙여넣은 데이터로 복원</button><label class="btn ghost filebtn">파일에서 복원<input type="file" id="bk-file" accept=".json,.txt,application/json,text/plain" hidden></label></div>
  <div class="actions"><button class="btn" data-act="close">닫기</button></div>`;
}

export function devSheet(s) {
  const sc = s.dev.timeScale;
  const b = (label, act, extra = '') => `<button class="btn ghost small" data-act="${act}" ${extra}>${label}</button>`;
  return `
  <header class="sheet-h"><div><h2>개발자 메뉴</h2><span class="mute">테스트용. 사용하면 저장 데이터에 표시됩니다.</span></div></header>
  <label class="lab">시간 배속 (현재 x${sc})</label>
  <div class="seg">${[1, 10, 60, 600].map((x) => `<button class="${sc === x ? 'on' : ''}" data-act="dev-scale" data-x="${x}">x${x}</button>`).join('')}</div>
  <label class="lab">자금 / 능력치</label>
  <div class="actions wrap">${b('+1,000만', 'dev-money', 'data-v="1000"')}${b('+1억', 'dev-money', 'data-v="10000"')}${b('+10억', 'dev-money', 'data-v="100000"')}${b('능력치 +5', 'dev-boost')}</div>
  <label class="lab">진행</label>
  <div class="actions wrap">${b('10경기 즉시', 'dev-skip', 'data-n="10"')}${b('시즌 끝까지', 'dev-end')}</div>
  <div class="actions"><button class="btn" data-act="close">닫기</button></div>`;
}
