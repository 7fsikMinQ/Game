import { newGame, advance, train, upgradeFacility, setIntervalMin, renameTeam, renamePlayer, draftPick, startNextSeason, dev, userTeam, intervalMs } from './game.js';
import { createStore, exportText, importText } from './storage.js';
import { navHTML, homeView, rosterView, tableView, clubView, playerSheet, backupSheet, devSheet, boardHTML, boardFromPlays, playLine } from './views.js';
import { fmtClock, fmtMoney } from './util.js';
import { STAT_LABEL } from './league.js';

const $ = (sel) => document.querySelector(sel);

function safeStorage() {
  try {
    const t = '__t';
    localStorage.setItem(t, '1');
    localStorage.removeItem(t);
    return localStorage;
  } catch {
    const mem = new Map();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  }
}

const store = createStore(safeStorage());
let s = store.load() || newGame((Date.now() ^ 0x9e3779b9) >>> 0, Date.now());
const ui = { tab: 'home', seg: 'H', sheet: null, live: null, report: null, pick: null };

const persist = () => store.save(s);

// ───────── 렌더 ─────────
const VIEWS = { home: homeView, roster: rosterView, table: tableView, club: clubView };
function render() {
  $('#view').innerHTML = VIEWS[ui.tab](s, ui, Date.now());
  $('#nav').innerHTML = navHTML(ui.tab);
  $('#season').textContent = `시즌 ${s.season}`;
}

function openSheet(html) {
  $('#sheetbody').innerHTML = html;
  $('#sheet').hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() {
  $('#sheet').hidden = true;
  document.body.classList.remove('noscroll');
  ui.sheet = null;
}
function refreshSheet() {
  if (ui.sheet?.type === 'player') $('#sheetbody').innerHTML = playerSheet(s, ui.sheet.pid);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1800);
}

// ───────── 중계 연출 ─────────
function stopLive() {
  if (ui.live) clearInterval(ui.live.timer);
  ui.live = null;
}
function startLive() {
  stopLive();
  const entry = s.latest;
  if (!entry || !entry.plays) return;
  ui.live = { shown: 0, timer: setInterval(stepLive, 420) };
}
function stepLive() {
  if (!ui.live) return;
  const entry = s.latest;
  ui.live.shown++;
  if (ui.live.shown >= entry.plays.length) {
    stopLive();
    render();
    return;
  }
  if (ui.tab === 'home' && $('#board')) {
    $('#board').innerHTML = boardHTML(boardFromPlays(s, entry, ui.live.shown));
    $('#plays').innerHTML = entry.plays.slice(0, ui.live.shown).map((p) => playLine(s, entry, p)).reverse().join('');
  }
}

// ───────── 시간 흐름 ─────────
function tick() {
  const now = Date.now();
  const due = s.nextGameAt ? now - s.nextGameAt : -1;
  const rep = advance(s, now);
  if (rep.games > 0 || rep.phaseChanged) {
    persist();
    if (rep.games === 1 && due < 5000 && document.visibilityState === 'visible') {
      startLive();
    } else if (rep.games > 0) {
      stopLive();
      const r = ui.report || { games: 0, wins: 0, losses: 0, money: 0, skipped: 0 };
      ui.report = { games: r.games + rep.games, wins: r.wins + rep.wins, losses: r.losses + rep.losses, money: r.money + rep.money, skipped: r.skipped + rep.skipped };
    }
    if (!ui.sheet) render();
    return;
  }
  const cd = $('#cd');
  if (cd && s.nextGameAt) {
    const left = Math.max(0, s.nextGameAt - now);
    cd.textContent = fmtClock(left);
    const bar = $('#cdbar');
    if (bar) bar.style.width = `${Math.min(100, (1 - left / intervalMs(s)) * 100).toFixed(1)}%`;
  }
}

// ───────── 동작 ─────────
const ERR = { money: '자금이 부족합니다', cap: '잠재력 한계에 도달했습니다', max: '최대 레벨입니다' };

function ask(msg, def = '') {
  try {
    return window.prompt(msg, def);
  } catch {
    return null;
  }
}

async function shareBackup() {
  const text = exportText(s);
  const name = `baseball-save-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '야구단 백업' });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function restoreFrom(text) {
  const next = importText(text);
  if (!next) return toast('올바른 백업 데이터가 아닙니다');
  if (!window.confirm('현재 진행 상황이 백업 데이터로 바뀝니다. 계속할까요?')) return;
  stopLive();
  s = next;
  advance(s, Date.now());
  persist();
  closeSheet();
  ui.tab = 'home';
  render();
  toast('복원했습니다');
}

let brandTaps = [];
function brandTap() {
  const now = Date.now();
  brandTaps = brandTaps.filter((t) => now - t < 3000).concat(now);
  if (brandTaps.length >= 7) {
    brandTaps = [];
    ui.sheet = { type: 'dev' };
    openSheet(devSheet(s));
  }
}

function act(name, d, el) {
  const now = Date.now();
  switch (name) {
    case 'tab':
      ui.tab = d.tab;
      render();
      window.scrollTo(0, 0);
      break;
    case 'seg':
      ui.seg = d.seg;
      render();
      break;
    case 'player':
      ui.sheet = { type: 'player', pid: +d.pid };
      openSheet(playerSheet(s, +d.pid));
      break;
    case 'close':
      closeSheet();
      render();
      break;
    case 'train': {
      const r = train(s, +d.pid, d.stat);
      if (!r.ok) return toast(ERR[r.err] || '할 수 없습니다');
      persist();
      toast(`${STAT_LABEL[d.stat]} +1 (-${fmtMoney(r.cost)})`);
      refreshSheet();
      break;
    }
    case 'fac': {
      const r = upgradeFacility(s, d.key);
      if (!r.ok) return toast(ERR[r.err] || '할 수 없습니다');
      persist();
      toast('시설을 업그레이드했습니다');
      render();
      break;
    }
    case 'interval':
      setIntervalMin(s, +d.min, now);
      persist();
      render();
      break;
    case 'rename-team': {
      const n = ask('팀 이름 (14자까지)', userTeam(s).name);
      if (n && renameTeam(s, n)) {
        persist();
        render();
      }
      break;
    }
    case 'rename-player': {
      const p = userTeam(s).players.find((x) => x.id === +d.pid);
      const n = ask('선수 이름 (8자까지)', p ? p.name : '');
      if (n && renamePlayer(s, +d.pid, n)) {
        persist();
        refreshSheet();
        render();
      }
      break;
    }
    case 'backup':
      ui.sheet = { type: 'backup' };
      openSheet(backupSheet(exportText(s)));
      break;
    case 'bk-copy':
      (navigator.clipboard ? navigator.clipboard.writeText(exportText(s)) : Promise.reject()).then(
        () => toast('복사했습니다'),
        () => {
          const t = $('#bk-out');
          t.select();
          toast('텍스트를 직접 복사하세요');
        },
      );
      break;
    case 'bk-file':
      shareBackup();
      break;
    case 'bk-restore':
      restoreFrom($('#bk-in').value);
      break;
    case 'reset':
      if (window.confirm('모든 진행 상황이 사라집니다. 새로 시작할까요?')) {
        stopLive();
        store.clear();
        s = newGame((Date.now() ^ 0x9e3779b9) >>> 0, now);
        persist();
        ui.tab = 'home';
        ui.report = null;
        render();
      }
      break;
    case 'dismiss-report':
      ui.report = null;
      render();
      break;
    case 'skip-live':
      stopLive();
      render();
      break;
    case 'cand':
      ui.pick = +d.i;
      render();
      break;
    case 'cand-cancel':
      ui.pick = null;
      render();
      break;
    case 'replace': {
      const r = draftPick(s, ui.pick, +d.pid);
      ui.pick = null;
      if (r.ok) {
        persist();
        toast(`${r.in.name} 영입`);
      }
      render();
      break;
    }
    case 'next-season':
    case 'auto-next':
      startNextSeason(s, now, { autoDraft: name === 'auto-next' });
      ui.pick = null;
      persist();
      render();
      window.scrollTo(0, 0);
      break;
    // 개발자 메뉴
    case 'dev-scale':
      dev.setScale(s, +d.x, now);
      persist();
      openSheet(devSheet(s));
      break;
    case 'dev-money':
      dev.addMoney(s, +d.v);
      persist();
      toast(`자금 +${fmtMoney(+d.v)}`);
      break;
    case 'dev-boost':
      dev.boost(s, 5);
      persist();
      toast('능력치 +5');
      break;
    case 'dev-skip':
      stopLive();
      dev.skipGames(s, +d.n);
      persist();
      toast(`${d.n}경기 진행`);
      break;
    case 'dev-end':
      stopLive();
      dev.toOffseason(s);
      persist();
      closeSheet();
      render();
      break;
  }
}

document.addEventListener('click', (e) => {
  if (e.target.closest('#brand')) return brandTap();
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) act(el.dataset.act, el.dataset, el);
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'bk-file' && e.target.files[0]) e.target.files[0].text().then(restoreFrom);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') tick();
  else persist();
});
window.addEventListener('pagehide', persist);

// ───────── 시작 ─────────
const first = advance(s, Date.now());
if (first.games > 0) {
  persist();
  ui.report = { games: first.games, wins: first.wins, losses: first.losses, money: first.money, skipped: first.skipped };
}
render();
setInterval(tick, 1000);

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
// 테스트/디버깅용
window.__bb = { get state() { return s; }, tick };
