import * as G from './game.js';
import { createStore, exportText, importText } from './storage.js';
import { parsePackText, applyPack } from './pack.js';
import { displayState, importSheet, csvTemplate, navHTML, homeView, squadView, tacticsView, leagueView, clubView, playerSheet, slotPicker, backupSheet, devSheet, leagueSelectView, clubSelectView, eventLine, errText, badgeCount } from './views.js';
import { fmtClock, fmtMoney } from './util.js';

const $ = (sel) => document.querySelector(sel);

function safeStorage() {
  try { const t = '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; }
  catch { const mem = new Map(); return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }; }
}
const store = createStore(safeStorage());
const seed = () => (Date.now() ^ 0x9e3779b9) >>> 0;
let s = store.load();
const ui = { pack: null, packText: '', packResult: null, tab: 'home', pos: 'ALL', sort: 'pos', lseg: 'table', ldiv: null, cseg: 'info', msub: 'buy', sheet: null, live: null, report: null, setup: s ? null : 'league', autopilot: true, squadCache: null, backupAge: '' };
const persist = () => { if (s && s.phase !== 'setup') store.save(s); };

// ───────── 렌더 ─────────
function backupAgeText() {
  if (!s || !s.lastBackupAt) return '';
  const d = Math.floor((Date.now() - s.lastBackupAt) / 86400000);
  return d <= 0 ? '오늘' : `${d}일 전`;
}
function render() {
  const view = $('#view');
  if (!s || s.phase === 'setup') {
    view.innerHTML = ui.setup === 'club' && s ? clubSelectView(s, ui) : leagueSelectView();
    $('#nav').innerHTML = ''; $('#nav').hidden = true; $('#season').textContent = '';
    return;
  }
  $('#nav').hidden = false;
  ui.backupAge = backupAgeText();
  ui.backupNudge = !ui.nudgeDismissed && s.totals.games >= 10 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > 7 * 86400000);
  if (ui.tab === 'tactics') { const t = G.userTeam(s); ui.squadCache = G.squadFor(s, t); }
  const V = { home: homeView, squad: squadView, tactics: tacticsView, league: leagueView, club: clubView };
  view.innerHTML = V[ui.tab](shownState(), ui, Date.now());
  $('#nav').innerHTML = navHTML(ui.tab, badgeCount(s));
  $('#season').textContent = `${G.seasonLabel(s)} · ${G.divCfg(s, G.userTeam(s).div).name}`;
}
function openSheet(html) { $('#sheetbody').innerHTML = html; $('#sheet').hidden = false; document.body.classList.add('noscroll'); }
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('noscroll'); ui.sheet = null; }
function refreshSheet() {
  if (ui.sheet?.type === 'player') { const h = playerSheet(s, ui.sheet.pid, ui.sheet.src); if (h) $('#sheetbody').innerHTML = h; else closeSheet(); }
}
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2000); }

// ───────── 중계 연출 ─────────
// 중계 중에는 경기 전 상태(ui.before)를 보여 주고, 끝난 뒤에야 결과를 반영한다
const snap = () => JSON.parse(JSON.stringify(s));
const shownState = () => displayState(s, ui);
function stopLive() { if (ui.live) clearInterval(ui.live.timer); ui.live = null; ui.before = null; }
function startLive(before) {
  stopLive();
  ui.before = before || null;
  if (!s.latest || !s.latest.events) return;
  ui.live = { min: 0, timer: setInterval(stepLive, 85) };
}
function stepLive() {
  if (!ui.live) return;
  ui.live.min++;
  const e = s.latest;
  if (ui.live.min >= 90) { stopLive(); render(); return; }
  if (ui.tab === 'home' && $('#match')) {
    let sc = [0, 0];
    for (const x of e.events) if (x.t === 'goal' && x.min <= ui.live.min) sc = x.score;
    $('#mscore').textContent = `${sc[0]} : ${sc[1]}`;
    $('#mmin').textContent = `${ui.live.min}분`;
    $('#mevents').innerHTML = e.events.filter((x) => x.min <= ui.live.min).reverse().map((x) => eventLine(s, e, x)).join('');
  }
}

// ───────── 시간 흐름 ─────────
function mergeReport(rep, extra = {}) {
  const r = ui.report || { games: 0, w: 0, d: 0, l: 0, money: 0, skipped: 0, seasons: 0 };
  ui.report = { games: r.games + rep.games, w: r.w + rep.w, d: r.d + rep.d, l: r.l + rep.l, money: r.money + rep.money, skipped: r.skipped + (rep.skipped || 0), seasons: r.seasons + (rep.seasons || 0), ...extra };
}
function tick() {
  if (!s || s.phase === 'setup') return;
  const now = Date.now();
  const due = s.nextGameAt ? now - s.nextGameAt : -1;
  const before = due >= 0 && document.visibilityState === 'visible' ? snap() : null;
  const rep = advance(now);
  if (rep.games > 0 || rep.phaseChanged || rep.seasons) {
    persist();
    if (rep.games === 1 && !rep.seasons && due < 5000 && document.visibilityState === 'visible') startLive(before);
    else if (rep.games > 0) { stopLive(); mergeReport(rep); }
    if (!ui.sheet) render();
    return;
  }
  const cd = $('#cd');
  if (cd && s.nextGameAt) {
    const left = Math.max(0, s.nextGameAt - now);
    cd.textContent = fmtClock(left);
    const bar = $('#cdbar');
    if (bar) bar.style.width = `${Math.min(100, (1 - left / G.intervalMs(s)) * 100).toFixed(1)}%`;
  }
}
const advance = (now) => G.advance(s, now);

// ───────── 동작 ─────────
function ask(msg, def = '') { try { return window.prompt(msg, def); } catch { return null; } }
async function shareBackup() {
  const text = exportText(s);
  const name = `soccer-save-${new Date().toISOString().slice(0, 10)}.json`;
  s.lastBackupAt = Date.now(); persist();
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '축구 구단 백업' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function restoreFrom(text) {
  const next = importText(text);
  if (!next) return toast('올바른 백업 데이터가 아닙니다');
  if (!window.confirm('현재 진행 상황이 백업 데이터로 바뀝니다. 계속할까요?')) return;
  stopLive(); s = next; ui.setup = null; if (s.phase !== 'setup') advance(Date.now());
  persist(); closeSheet(); ui.tab = 'home'; render(); toast('복원했습니다');
}
let brandTaps = [];
function brandTap() {
  const now = Date.now();
  brandTaps = brandTaps.filter((t) => now - t < 3000).concat(now);
  if (brandTaps.length >= 7 && s && s.phase !== 'setup') { brandTaps = []; ui.sheet = { type: 'dev' }; openSheet(devSheet(s)); }
}
const done = (r, okMsg, after) => { if (!r.ok) return toast(errText(r)); persist(); if (okMsg) toast(okMsg); if (after) after(); refreshSheet(); render(); };
const M = (n) => fmtMoney(n);

function act(name, d) {
  const now = Date.now();
  switch (name) {
    // 시작
    case 'pick-league': s = G.newGame(seed(), now, d.id); ui.pack = null; ui.setup = 'club'; render(); break;
    case 'import-open': ui.sheet = { type: 'import' }; openSheet(importSheet({ text: ui.packText, result: ui.packResult })); break;
    case 'import-check': { ui.packText = $('#pk-in').value; ui.packResult = parsePackText(ui.packText); openSheet(importSheet({ text: ui.packText, result: ui.packResult })); break; }
    case 'import-template': (navigator.clipboard ? navigator.clipboard.writeText(csvTemplate()) : Promise.reject()).then(() => toast('양식을 복사했습니다'), () => toast('복사하지 못했습니다')); break;
    case 'import-go': {
      const pack = ui.packResult && ui.packResult.pack;
      if (!pack) break;
      s = G.newGame(seed(), now, pack.country);
      G.withRng(s, (rng) => applyPack(s, pack, rng, { rng, nextId: () => s.nextPid++, used: new Set(s.teams.flatMap((t) => t.players.map((p) => p.name))) }));
      ui.pack = pack; ui.setup = 'club'; closeSheet(); render(); window.scrollTo(0, 0);
      break;
    }
    case 'back-league': s = null; ui.setup = 'league'; render(); break;
    case 'setup-auto': ui.autopilot = !ui.autopilot; render(); break;
    case 'pick-club': G.chooseClub(s, +d.id, now); s.settings.autopilot = ui.autopilot; ui.setup = null; ui.tab = 'home'; persist(); render(); window.scrollTo(0, 0); break;
    // 탭/목록
    case 'tab': ui.tab = d.tab; render(); window.scrollTo(0, 0); break;
    case 'pos': ui.pos = d.v; render(); break;
    case 'sort': ui.sort = d.v; render(); break;
    case 'lseg': ui.lseg = d.v; render(); break;
    case 'ldiv': ui.ldiv = +d.v; render(); break;
    case 'cseg': ui.cseg = d.v; render(); break;
    case 'msub': ui.msub = d.v; render(); break;
    case 'goto-market': ui.tab = 'club'; ui.cseg = 'market'; render(); window.scrollTo(0, 0); break;
    case 'goto-offers': ui.tab = 'club'; ui.cseg = 'market'; render(); window.scrollTo(0, 0); break;
    case 'player': ui.sheet = { type: 'player', pid: +d.pid, src: d.src || 'own' }; openSheet(playerSheet(s, +d.pid, d.src || 'own')); break;
    case 'close': closeSheet(); render(); break;
    // 전술
    case 'slot': ui.sheet = { type: 'slot', i: +d.i }; openSheet(slotPicker(s, +d.i)); break;
    case 'set-slot': G.setSlot(s, +d.i, +d.pid); persist(); closeSheet(); render(); break;
    case 'form': G.setFormation(s, d.id); persist(); render(); break;
    case 'ment': G.setTactic(s, { mentality: d.v }); persist(); render(); break;
    case 'press': G.setTactic(s, { pressing: d.v }); persist(); render(); break;
    case 'auto': G.setAuto(s, !G.userTeam(s).auto); persist(); render(); break;
    case 'focus': G.setTrainFocus(s, d.v); persist(); render(); break;
    // 진행 / 건너뛰기
    case 'play': {
      stopLive();
      const before = +d.n === 1 ? snap() : null;
      const rep = G.playNow(s, +d.n, now);
      if (!rep.games) { toast('진행할 경기가 없습니다. 오프시즌에서 다음 시즌을 시작하세요'); render(); break; }
      persist();
      if (+d.n === 1 && rep.games === 1) { ui.report = null; startLive(before); }
      else { ui.report = null; mergeReport(rep); toast(`${rep.games}라운드 진행`); }
      render(); window.scrollTo(0, 0);
      break;
    }
    case 'skip-live': stopLive(); render(); break;
    case 'dismiss-report': ui.report = null; render(); break;
    case 'dismiss-nudge': ui.nudgeDismissed = true; render(); break;
    case 'next-season': case 'auto-next': G.startNextSeason(s, now, { auto: name === 'auto-next' }); persist(); ui.tab = 'home'; render(); window.scrollTo(0, 0); break;
    // 구단
    case 'fac': { const r = G.upgradeFacility(s, d.key); done(r, '시설을 업그레이드했습니다'); break; }
    case 'interval': G.setIntervalMin(s, +d.min, now); persist(); render(); break;
    case 'setting': G.setSetting(s, d.key, !s.settings[d.key]); persist(); render(); break;
    case 'rename-team': { const n = ask('구단 이름 (16자까지)', G.userTeam(s).name); if (n && G.renameTeam(s, n)) { persist(); render(); } break; }
    case 'backup': ui.sheet = { type: 'backup' }; openSheet(backupSheet(exportText(s))); break;
    case 'bk-copy': s.lastBackupAt = Date.now(); persist(); (navigator.clipboard ? navigator.clipboard.writeText(exportText(s)) : Promise.reject()).then(() => toast('복사했습니다'), () => { $('#bk-out').select(); toast('텍스트를 직접 복사하세요'); }); break;
    case 'bk-file': shareBackup(); break;
    case 'bk-restore': restoreFrom($('#bk-in').value); break;
    case 'reset':
      if (window.confirm('모든 진행 상황이 사라집니다. 새로 시작할까요?')) { stopLive(); store.clear(); s = null; ui.setup = 'league'; ui.report = null; ui.tab = 'home'; closeSheet(); render(); }
      break;
    // 선수 거래
    case 'buy': done(G.buyPlayer(s, +d.pid), '영입했습니다', closeSheet); break;
    case 'sign': done(G.signFree(s, +d.pid), '계약했습니다', closeSheet); break;
    case 'sell': { const p = G.findPlayer(s, +d.pid); if (p && window.confirm(`${p.name} 선수를 ${M(G.sellPrice(p))}에 매각할까요?`)) done(G.sellPlayer(s, +d.pid), '매각했습니다', closeSheet); break; }
    case 'release': { const p = G.findPlayer(s, +d.pid); if (p && window.confirm(`${p.name} 선수를 방출할까요? (위약금 ${M(G.releaseCost(p))})`)) done(G.releasePlayer(s, +d.pid), '방출했습니다', closeSheet); break; }
    case 'loan-in': done(G.loanIn(s, +d.pid), '임대 영입했습니다', closeSheet); break;
    case 'loan-out': done(G.loanOut(s, +d.pid), '임대 보냈습니다', closeSheet); break;
    case 'recall': done(G.recallLoan(s, +d.pid), '복귀시켰습니다', closeSheet); break;
    case 'buy-option': done(G.buyOption(s, +d.pid), '완전 영입했습니다'); break;
    case 'list': G.listPlayer(s, +d.pid); persist(); toast('이적 등록했습니다. 제안이 오면 알려드립니다'); refreshSheet(); break;
    case 'unlist': G.unlistPlayer(s, +d.pid); persist(); refreshSheet(); break;
    case 'accept-offer': done(G.acceptOffer(s, +d.id), '제안을 수락했습니다'); break;
    case 'reject-offer': G.rejectOffer(s, +d.id); persist(); render(); break;
    case 'renew': done(G.renewPlayer(s, +d.pid, 3), '재계약했습니다'); break;
    case 'youth-yes': done(G.acceptYouth(s, +d.pid), '영입했습니다', closeSheet); break;
    case 'youth-no': G.rejectYouth(s, +d.pid); persist(); closeSheet(); render(); break;
    // 개발자 메뉴
    case 'dev-scale': G.dev.setScale(s, +d.x, now); persist(); openSheet(devSheet(s)); break;
    case 'dev-money': G.dev.addMoney(s, +d.v); persist(); toast(`자금 +${M(+d.v)}`); break;
    case 'dev-boost': G.dev.boost(s, 2); persist(); toast('능력치 +2'); break;
    case 'dev-heal': G.dev.heal(s); persist(); toast('전원 회복'); break;
    case 'dev-end': stopLive(); G.dev.toOffseason(s, now); persist(); closeSheet(); render(); break;
  }
}

const guard = (fn) => (...args) => { try { return fn(...args); } catch (err) { console.error(err); window.__lastError = String(err && err.stack || err); try { toast('문제가 발생했습니다. 설정 > 백업 후 새로 시작해 보세요'); } catch { /* 토스트도 못 띄우면 콘솔 로그만 남는다 */ } } };
document.addEventListener('click', guard((e) => {
  if (e.target.closest('#brand')) return brandTap();
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) act(el.dataset.act, el.dataset);
}));
document.addEventListener('change', (e) => {
  if (e.target.id === 'bk-file' && e.target.files[0]) e.target.files[0].text().then(restoreFrom);
  if (e.target.id === 'pk-file' && e.target.files[0]) e.target.files[0].text().then((t) => { ui.packText = t.length > 200000 ? '' : t; ui.packResult = parsePackText(t); openSheet(importSheet({ text: ui.packText, result: ui.packResult })); });
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); else persist(); });
window.addEventListener('pagehide', persist);

// ───────── 시작 ─────────
function boot() {
  if (s && s.phase !== 'setup') {
    const first = advance(Date.now());
    if (first.games > 0 || first.seasons) { persist(); mergeReport(first); }
  }
  $('#busy').hidden = true;
  render();
}
// 오래 비웠다 열면 계산에 몇 초 걸릴 수 있어서, 먼저 안내 화면을 그린 뒤 계산한다
const backlog = s && s.phase !== 'setup' && s.nextGameAt ? (Date.now() - s.nextGameAt) / G.intervalMs(s) : 0;
if (backlog > 8) { $('#busy').hidden = false; setTimeout(guard(boot), 60); } else guard(boot)();
setInterval(guard(tick), 1000);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__sc = { get state() { return s; }, tick, G };
