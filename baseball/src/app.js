import * as G from './game.js';
import { createStore, exportText, importText } from './storage.js';
import { parsePackText, applyPack } from './pack.js';
import { navHTML, homeView, rosterView, leagueView, marketView, clubView, playerSheet, slotPicker, tradeSheet, backupSheet, importSheet, devSheet, leagueSelectView, clubSelectView, matchPanel, boardFromPlays, errText, badgeCount, csvTemplate } from './views.js';
import { fmtClock, fmtMoney } from './util.js';

const $ = (sel) => document.querySelector(sel);

function safeStorage() {
  try { const t = '__t'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return localStorage; }
  catch { const mem = new Map(); return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }; }
}
const store = createStore(safeStorage());
const seed = () => (Date.now() ^ 0x9e3779b9) >>> 0;
let s = store.load();
const ui = { tab: 'home', rseg: 'H', lseg: 'table', cseg: 'fin', msub: 'trade', frole: 'ALL', sheet: null, live: null, report: null, setup: s ? null : 'league', autopilot: true, trade: null, packText: '', packResult: null, backupAge: '' };
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
  ui.backupNudge = !ui.nudgeDismissed && s.totals.games >= 20 && (!s.lastBackupAt || Date.now() - s.lastBackupAt > 7 * 86400000);
  const V = { home: homeView, roster: rosterView, league: leagueView, market: marketView, club: clubView };
  view.innerHTML = V[ui.tab](s, ui, Date.now());
  $('#nav').innerHTML = navHTML(ui.tab, badgeCount(s));
  $('#season').textContent = `${G.seasonLabel(s)} · ${G.Lof(s).name}`;
}
function openSheet(html, keep = false) {
  const el = $('#sheetbody');
  const top = keep ? el.scrollTop : 0;
  el.innerHTML = html;
  el.scrollTop = top;
  $('#sheet').hidden = false;
  document.body.classList.add('noscroll');
}
function closeSheet() { $('#sheet').hidden = true; document.body.classList.remove('noscroll'); ui.sheet = null; ui.trade = null; }
function refreshSheet() {
  if (ui.sheet?.type === 'player') { const h = playerSheet(s, ui.sheet.pid, ui.sheet.src); if (h) openSheet(h, true); else closeSheet(); }
  else if (ui.sheet?.type === 'trade' && ui.trade) openSheet(tradeSheet(s, ui), true);
}
let toastTimer;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 2200); }

// ───────── 중계 연출 ─────────
function stopLive() { if (ui.live) clearInterval(ui.live.timer); ui.live = null; }
function startLive() {
  stopLive();
  if (!s.latest || !s.latest.plays || !s.latest.plays.length) return;
  ui.live = { shown: 0, timer: setInterval(stepLive, 140) };
}
function stepLive() {
  if (!ui.live) return;
  const e = s.latest;
  ui.live.shown++;
  if (ui.live.shown >= e.plays.length) { stopLive(); render(); return; }
  if (ui.tab === 'home' && $('#match')) $('#match').innerHTML = matchPanel(s, e, ui.live, boardFromPlays(s, e, ui.live.shown));
}

// ───────── 시간 흐름 ─────────
function mergeReport(rep) {
  const r = ui.report || { games: 0, w: 0, d: 0, l: 0, money: 0, skipped: 0, seasons: 0 };
  ui.report = { games: r.games + rep.games, w: r.w + rep.w, d: r.d + (rep.d || 0), l: r.l + rep.l, money: r.money + rep.money, skipped: r.skipped + (rep.skipped || 0), seasons: r.seasons + (rep.seasons || 0) };
}
function tick() {
  if (!s || s.phase === 'setup') return;
  const now = Date.now();
  const due = s.nextGameAt ? now - s.nextGameAt : -1;
  const rep = G.advance(s, now);
  if (rep.games > 0 || rep.phaseChanged || rep.seasons) {
    persist();
    if (rep.games === 1 && !rep.seasons && due < 5000 && document.visibilityState === 'visible') startLive();
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

// ───────── 동작 ─────────
function ask(msg, def = '') { try { return window.prompt(msg, def); } catch { return null; } }
async function shareBackup() {
  const text = exportText(s);
  const name = `baseball-save-${new Date().toISOString().slice(0, 10)}.json`;
  s.lastBackupAt = Date.now(); persist();
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: '야구단 백업' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function restoreFrom(text) {
  const next = importText(text);
  if (!next) return toast('올바른 백업 데이터가 아닙니다');
  if (!window.confirm('현재 진행 상황이 백업 데이터로 바뀝니다. 계속할까요?')) return;
  stopLive(); s = next; ui.setup = null; if (s.phase !== 'setup') G.advance(s, Date.now());
  persist(); closeSheet(); ui.tab = 'home'; render(); toast('복원했습니다');
}
let brandTaps = [];
function brandTap() {
  const now = Date.now();
  brandTaps = brandTaps.filter((t) => now - t < 3000).concat(now);
  if (brandTaps.length >= 7 && s && s.phase !== 'setup') { brandTaps = []; ui.sheet = { type: 'dev' }; openSheet(devSheet(s)); }
}
const done = (r, okMsg, after) => { if (!r.ok) return toast(errText(r)); persist(); if (okMsg) toast(okMsg); if (after) after(); refreshSheet(); render(); };
const M = (v) => fmtMoney(s.country, v);
const player = (pid) => G.userTeam(s).players.find((p) => p.id === pid) || G.findPlayer(s, pid)?.p;
const go = (tab, extra = {}) => { Object.assign(ui, extra, { tab }); closeSheet(); render(); window.scrollTo(0, 0); };

function act(name, d) {
  const now = Date.now();
  switch (name) {
    // 시작
    case 'pick-league': s = G.newGame(seed(), now, d.id); ui.setup = 'club'; render(); break;
    case 'import-open': ui.sheet = { type: 'import' }; openSheet(importSheet({ text: ui.packText, result: ui.packResult })); break;
    case 'import-check': { ui.packText = $('#pk-in').value; ui.packResult = parsePackText(ui.packText); openSheet(importSheet({ text: ui.packText, result: ui.packResult })); break; }
    case 'import-template': (navigator.clipboard ? navigator.clipboard.writeText(csvTemplate()) : Promise.reject()).then(() => toast('양식을 복사했습니다'), () => toast('복사하지 못했습니다')); break;
    case 'import-go': {
      const pack = ui.packResult && ui.packResult.pack;
      if (!pack) break;
      s = G.newGame(seed(), now, pack.country);
      G.withRng(s, (rng) => applyPack(s, pack, rng, { rng, nextId: () => s.nextPid++, used: new Set(s.teams.flatMap((t) => t.players.map((p) => p.name))), L: G.Lof(s), lang: s.country === 'kbo' ? 'kr' : 'en' }));
      ui.setup = 'club'; closeSheet(); render(); window.scrollTo(0, 0);
      break;
    }
    case 'back-league': s = null; ui.setup = 'league'; render(); break;
    case 'setup-auto': ui.autopilot = !ui.autopilot; render(); break;
    case 'pick-club': G.chooseClub(s, +d.id, now, { autopilot: ui.autopilot }); ui.setup = null; ui.tab = 'home'; persist(); render(); window.scrollTo(0, 0); break;
    // 탭/목록
    case 'tab': ui.tab = d.tab; render(); window.scrollTo(0, 0); break;
    case 'rseg': ui.rseg = d.v; render(); break;
    case 'lseg': ui.lseg = d.v; render(); break;
    case 'llg': ui.llg = d.v; render(); break;
    case 'cseg': ui.cseg = d.v; render(); break;
    case 'msub': ui.msub = d.v; render(); break;
    case 'frole': ui.frole = d.v; render(); break;
    case 'goto-offers': go('market', { msub: 'offers' }); break;
    case 'goto-draft': go('market', { msub: 'draft' }); break;
    case 'goto-fa': go('market', { msub: 'fa' }); break;
    case 'player': ui.sheet = { type: 'player', pid: +d.pid, src: d.src || 'own' }; openSheet(playerSheet(s, +d.pid, d.src || 'own')); break;
    case 'close': closeSheet(); render(); break;
    // 라인업 / 엔트리
    case 'slot': ui.sheet = { type: 'slot', pos: d.pos }; openSheet(slotPicker(s, d.pos)); break;
    case 'set-slot': G.setLineupSlot(s, d.pos, +d.pid); persist(); closeSheet(); render(); break;
    case 'auto-lineup': G.setAutoLineup(s, !G.userTeam(s).auto); persist(); render(); break;
    case 'promote': done(G.setActive(s, +d.pid, true), '1군으로 올렸습니다', closeSheet); break;
    case 'demote': done(G.setActive(s, +d.pid, false), '2군으로 내렸습니다', closeSheet); break;
    case 'auto-roster': G.autoRoster(G.userTeam(s), G.Lof(s)); persist(); toast('엔트리를 정리했습니다'); render(); break;
    // 진행 / 건너뛰기
    case 'play': {
      stopLive();
      const rep = G.playNow(s, +d.n, now);
      if (!rep.games) { toast(s.phase === 'offseason' ? '오프시즌입니다. 다음 시즌을 시작하세요' : '진행할 경기가 없습니다'); render(); break; }
      persist();
      if (+d.n === 1 && rep.games === 1) { ui.report = null; startLive(); }
      else { ui.report = null; mergeReport(rep); toast(`${rep.games}경기 진행`); }
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
    case 'setting': s.settings[d.key] = !s.settings[d.key]; persist(); render(); break;
    case 'rename-team': { const n = ask('구단 이름 (14자까지)', G.userTeam(s).name); if (n && G.renameTeam(s, n)) { persist(); render(); } break; }
    case 'backup': ui.sheet = { type: 'backup' }; openSheet(backupSheet(exportText(s))); break;
    case 'bk-copy': s.lastBackupAt = Date.now(); persist(); (navigator.clipboard ? navigator.clipboard.writeText(exportText(s)) : Promise.reject()).then(() => toast('복사했습니다'), () => { $('#bk-out').select(); toast('텍스트를 직접 복사하세요'); }); break;
    case 'bk-file': shareBackup(); break;
    case 'bk-restore': restoreFrom($('#bk-in').value); break;
    case 'reset':
      if (window.confirm('모든 진행 상황이 사라집니다. 새로 시작할까요?')) { stopLive(); store.clear(); s = null; ui.setup = 'league'; ui.report = null; ui.tab = 'home'; closeSheet(); render(); }
      break;
    // 계약 / 시장
    case 'extend': done(G.extend(s, +d.pid, +d.y), '재계약했습니다', closeSheet); break;
    case 'release': { const p = player(+d.pid); if (p && window.confirm(`${p.name} 선수를 방출할까요? (위약금 ${M(G.releaseCost(s, p))})`)) done(G.release(s, +d.pid), '방출했습니다', closeSheet); break; }
    case 'sign': done(G.signFA(s, +d.pid, +d.y, d.src), '계약했습니다. 2군에 합류합니다', closeSheet); break;
    case 'draft-pick': G.withRng(s, (rng) => done(G.draftPickUser(s, +d.pid, rng), '지명했습니다', closeSheet)); break;
    case 'draft-run': G.withRng(s, (rng) => G.draftAIRun(s, rng)); persist(); render(); break;
    case 'draft-auto': G.withRng(s, (rng) => G.draftAuto(s, rng)); persist(); toast('지명을 마쳤습니다'); render(); break;
    case 'accept-offer': done(G.acceptOffer(s, +d.id), '트레이드가 성사되었습니다'); break;
    case 'reject-offer': s.offers = s.offers.filter((o) => o.id !== +d.id); persist(); render(); break;
    case 'trade-open': ui.trade = { teamId: +d.tid, give: new Set(), get: new Set() }; ui.sheet = { type: 'trade' }; openSheet(tradeSheet(s, ui)); break;
    case 'trade-with': { closeSheet(); go('market', { msub: 'trade' }); toast('시장 → 트레이드에서 상대 구단을 고르세요'); break; }
    case 'trade-with-ai': ui.trade = { teamId: +d.tid, give: new Set(), get: new Set([+d.pid]) }; ui.sheet = { type: 'trade' }; openSheet(tradeSheet(s, ui)); break;
    case 'trade-toggle': {
      const set = d.side === 'give' ? ui.trade.give : ui.trade.get;
      const id = +d.pid;
      if (set.has(id)) set.delete(id); else if (set.size < 3) set.add(id); else toast('최대 3명까지입니다');
      openSheet(tradeSheet(s, ui), true);
      break;
    }
    case 'trade-go': { const r = G.trade(s, ui.trade.teamId, [...ui.trade.give], [...ui.trade.get]); if (r.ok) { closeSheet(); persist(); toast('트레이드가 성사되었습니다'); render(); } else { toast(errText(r)); openSheet(tradeSheet(s, ui), true); } break; }
    // 개발자 메뉴
    case 'dev-scale': G.dev.setScale(s, +d.x, now); persist(); openSheet(devSheet(s)); break;
    case 'dev-money': G.dev.addMoney(s, +d.v); persist(); toast(`자금 +${M(+d.v)}`); render(); break;
    case 'dev-boost': G.dev.boost(s, 5); persist(); toast('능력치 +5'); render(); break;
    case 'dev-10': stopLive(); G.dev.skipGames(s, 10); persist(); closeSheet(); render(); break;
    case 'dev-end': stopLive(); G.dev.toOffseason(s); persist(); closeSheet(); render(); break;
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
    const first = G.advance(s, Date.now());
    if (first.games > 0 || first.seasons) { persist(); mergeReport(first); }
  }
  $('#busy').hidden = true;
  render();
}
const backlog = s && s.phase !== 'setup' && s.nextGameAt ? (Date.now() - s.nextGameAt) / G.intervalMs(s) : 0;
if (backlog > 8) { $('#busy').hidden = false; setTimeout(guard(boot), 60); } else guard(boot)();
setInterval(guard(tick), 1000);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(() => {});
window.__bb = { get state() { return s; }, tick, G, ui };
