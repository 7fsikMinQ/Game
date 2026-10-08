// 게임 상태와 규칙. 화면/브라우저에 의존하지 않아서 Node에서 그대로 테스트한다.
import { createRng } from './rng.js';
import { LEAGUES } from './data.js';
import { createLeague, fitPayroll, makeSchedule, startBracket, nextRound, seriesHome, seriesOver, seriesRecord, ROUND_NAME } from './league.js';
import { simulateGame, ENV, blankBat } from './sim.js';
import { autoRoster, validateRoster, counts, buildLineup, battingOrder } from './roster.js';
import { ovrOf, marketWage, ageUp, genPlayer, retireAge, valueOf } from './player.js';
import { Lof, userTeam, withRng, ctxOf, addNews, payroll, capPayroll, annualRevenue, annualOpex, budgetOf, teamOvr, winPct, findPlayer, seasonLabel, seasonYear } from './core.js';
import * as M from './market.js';
import { applyPack, realPack } from './pack.js';
import { clamp, r2, fmtMoney } from './util.js';

export const VERSION = 2;
export const INTERVAL_CHOICES = [5, 10, 20, 30];
export const MAX_CATCHUP = 200;
export const FAC_MAX = 8;
export const FAC_INFO = {
  stadium: { name: '구장·마케팅', desc: '수입 +4% / 레벨' },
  camp: { name: '훈련 시설', desc: '젊은 선수 성장 +0.15 / 레벨' },
  scout: { name: '스카우트', desc: '다른 팀 선수·신인 잠재력 추정 오차 감소' },
  medical: { name: '의료팀', desc: '부상 회복 +7% 빠르게 / 레벨' },
};
export const intervalMs = (s) => (s.intervalMin * 60 * 1000) / (s.dev.timeScale || 1);
export { withRng, Lof, userTeam, findPlayer, seasonLabel, seasonYear, payroll, capPayroll, annualRevenue, budgetOf, teamOvr, winPct, ovrOf };
export * from './market.js';

// ───────── 새 게임 ─────────
export function newGame(seed, now, country = 'mlb', { real = false } = {}) {
  const rng = createRng(seed);
  const { teams, nextId } = createLeague(rng, country);
  const L = LEAGUES[country];
  const s = {
    game: 'baseball', v: VERSION, seed, rng: 0, nextPid: nextId, createdAt: now, country, userId: -1, season: 1, phase: 'setup',
    teams, sched: null, playoff: null, offseason: null,
    intervalMin: 10, nextGameAt: null, lastSeen: now, money: 0, fac: { stadium: 0, camp: 0, scout: 0, medical: 0 },
    settings: { autopilot: true, autoRoster: true },
    market: { free: [], foreign: [] }, offers: [], news: [], history: { games: [], seasons: [] }, latest: null, seq: 0,
    streak: [], totals: { games: 0, wins: 0, earned: 0 }, dev: { timeScale: 1, used: false }, lastBackupAt: 0, over: 0,
  };
  if (real) {
    applyPack(s, realPack(country), rng, ctxOf(s, rng));
    s.teams.forEach((t) => fitPayroll(L, L.teams[t.id], t.players));
  }
  for (const t of teams) autoRoster(t, L);
  s.market.free = M.genFreePool(s, rng, 30);
  s.market.foreign = M.genForeignPool(s, rng, 12);
  s.rng = rng.state();
  return s;
}
export function chooseClub(s, id, now, { autopilot = true } = {}) {
  const L = Lof(s);
  s.userId = id;
  const t = userTeam(s);
  s.settings.autopilot = autopilot;
  s.money = r2(annualRevenue(s, t) * L.startCash);
  withRng(s, (rng) => { s.sched = { rounds: makeSchedule(L, rng), idx: 0 }; });
  s.phase = 'regular';
  s.nextGameAt = now + intervalMs(s);
  s.lastSeen = now;
  addNews(s, 'info', `${t.name} 감독으로 부임했습니다`);
  return true;
}

// ───────── 순위 ─────────
export function standings(s) {
  const rows = s.teams.map((t) => ({ id: t.id, name: t.name, short: t.short, color: t.color, div: t.div, w: t.w, l: t.l, d: t.d || 0, rs: t.rs, ra: t.ra, pct: winPct(t) }));
  const cmp = (a, b) => b.pct - a.pct || b.rs - b.ra - (a.rs - a.ra) || a.id - b.id;
  const sortGB = (arr) => {
    arr.sort(cmp);
    const lead = arr[0];
    arr.forEach((r, i) => { r.rank = i + 1; r.gb = (lead.w - r.w + (r.l - lead.l)) / 2; });
    return arr;
  };
  return sortGB(rows);
}
export function standingsOf(s, filter) {
  const st = s.teams.map((t) => ({ id: t.id, name: t.name, short: t.short, color: t.color, div: t.div, w: t.w, l: t.l, d: t.d || 0, rs: t.rs, ra: t.ra, pct: winPct(t) })).filter(filter);
  st.sort((a, b) => b.pct - a.pct || b.rs - b.ra - (a.rs - a.ra) || a.id - b.id);
  const lead = st[0];
  st.forEach((r, i) => { r.rank = i + 1; r.gb = lead ? (lead.w - r.w + (r.l - lead.l)) / 2 : 0; });
  return st;
}
const isAL = (t) => t.id < 15;
function playoffSeeds(s) {
  const L = Lof(s);
  if (L.id === 'kbo') {
    const st = standings(s);
    return { seeds: st.slice(0, 5).map((r) => r.id) };
  }
  const out = {};
  for (const lg of ['AL', 'NL']) {
    const teams = s.teams.filter((t) => (lg === 'AL') === isAL(t));
    const rows = standingsOf(s, (r) => teams.some((t) => t.id === r.id));
    const winners = [];
    for (let d = lg === 'AL' ? 0 : 3; d < (lg === 'AL' ? 3 : 6); d++) winners.push(rows.find((r) => r.div === d));
    winners.sort((a, b) => b.pct - a.pct || b.rs - b.ra - (a.rs - a.ra) || a.id - b.id);
    const rest = rows.filter((r) => !winners.includes(r)).slice(0, 3);
    out[lg] = [...winners, ...rest].map((r) => r.id);
  }
  return out;
}
const recordOf = (s) => (id) => winPct(s.teams[id]) + s.teams[id].id * 1e-9;

// ───────── 일일 정비 ─────────
function dailyUpkeep(s, rng) {
  const L = Lof(s);
  const med = 1 + 0.07 * s.fac.medical;
  for (const t of s.teams) {
    let dirty = false;
    const mine = t.id === s.userId;
    for (const p of t.players) {
      if (p.inj > 0) {
        p.inj = Math.max(0, p.inj - (mine ? med : 1));
        if (p.inj > 0 && p.inj < 1) p.inj = 0;
        if (p.inj <= 0) dirty = true;
      }
      if (p.fat > 0) p.fat = Math.max(0, p.fat - 12);
      p.rest++;
      if (p.act && p.inj > 3) dirty = true;
    }
    if (dirty && (!mine || s.settings.autoRoster)) autoRoster(t, L);
  }
}

// ───────── 경기 ─────────
function envOf(s, playoff) {
  const e = ENV[s.country];
  return playoff ? { ...e, maxInn: 15, ghost: e.ghost } : e;
}
function applyResult(s, res) {
  const home = s.teams[res.homeId], away = s.teams[res.awayId];
  home.rs += res.hs; home.ra += res.as; away.rs += res.as; away.ra += res.hs;
  if (res.tie) { home.d = (home.d || 0) + 1; away.d = (away.d || 0) + 1; }
  else { const w = s.teams[res.winnerId], l = res.winnerId === res.homeId ? away : home; w.w++; l.l++; }
}
function recordUser(s, res, label, extra = {}) {
  const L = Lof(s);
  const isHome = res.homeId === s.userId;
  const us = isHome ? res.hs : res.as, them = isHome ? res.as : res.hs;
  const res3 = res.tie ? 0 : us > them ? 1 : -1;
  const t = userTeam(s);
  const rev = annualRevenue(s, t), cost = payroll(t) + annualOpex(s, t);
  const games = L.games;
  const net = r2((rev - cost) / games + (extra.po && isHome ? rev * 0.004 : 0));
  s.money = r2(s.money + net);
  s.totals.earned = r2(s.totals.earned + net);
  s.totals.games++;
  if (res3 === 1) s.totals.wins++;
  s.streak.push(res3 === 1 ? 'W' : res3 === 0 ? 'D' : 'L');
  if (s.streak.length > 10) s.streak.shift();
  s.seq++;
  const entry = {
    seq: s.seq, season: s.season, label, oppId: isHome ? res.awayId : res.homeId, home: isHome, us, them, res: res3, net,
    line: res.line, hits: res.hits, innings: res.innings, walkoff: res.walkoff, wp: res.wp, lp: res.lp, sv: res.sv, sp: res.sp, awayId: res.awayId, homeId: res.homeId,
    key: res.plays ? res.plays.filter((p) => p.runs > 0) : [],
  };
  s.history.games.unshift(entry);
  s.history.games.length = Math.min(s.history.games.length, 30);
  s.latest = { ...entry, plays: res.plays };
  for (const inj of res.inj) if (inj.team === s.userId) addNews(s, 'injury', `${inj.name} 부상 (약 ${inj.n}일)`);
  return res3;
}

function stepRegular(s, rng, rep) {
  const L = Lof(s);
  const env = envOf(s, false);
  let userPlayed = false;
  while (!userPlayed && s.sched.idx < s.sched.rounds.length) {
    const round = s.sched.rounds[s.sched.idx];
    for (const [h, a] of round) {
      const feat = h === s.userId || a === s.userId;
      const res = simulateGame(s.teams[h], s.teams[a], rng, { log: feat, env, userId: s.userId });
      applyResult(s, res);
      if (feat) {
        const r = recordUser(s, res, `정규 ${userTeam(s).w + userTeam(s).l + (userTeam(s).d || 0)}/${L.games}`);
        userPlayed = true;
        rep.games++;
        if (r === 1) rep.w++; else if (r === 0) rep.d++; else rep.l++;
      }
    }
    s.sched.idx++;
    dailyUpkeep(s, rng);
    M.genOffers(s, rng);
  }
  if (s.sched.idx >= s.sched.rounds.length) startPlayoffs(s);
  return true;
}

function startPlayoffs(s) {
  const seeds = playoffSeeds(s);
  const t = userTeam(s);
  const st = standings(s);
  s.regularRank = st.find((r) => r.id === s.userId).rank;
  s.regularRec = { w: t.w, l: t.l, d: t.d || 0 };
  const po = startBracket(s.country, seeds);
  const all = s.country === 'kbo' ? po.seeds : [...po.seeds.AL, ...po.seeds.NL];
  po.userIn = all.includes(s.userId);
  po.userRound = -1;
  s.playoff = po;
  s.phase = 'playoffs';
  if (!po.userIn) addNews(s, 'season', '정규시즌 종료. 아쉽게 포스트시즌에 진출하지 못했습니다');
  else addNews(s, 'season', '포스트시즌 진출!');
}

function userInRound(s) {
  const po = s.playoff;
  return po.rounds[po.round].some((sr) => !seriesOver(sr) && (sr.a === s.userId || sr.b === s.userId));
}
function stepPlayoff(s, rng, rep) {
  const po = s.playoff;
  const env = envOf(s, true);
  for (const sr of po.rounds[po.round]) {
    if (seriesOver(sr)) continue;
    const home = seriesHome(sr);
    const away = home === sr.a ? sr.b : sr.a;
    const feat = sr.a === s.userId || sr.b === s.userId;
    let res = simulateGame(s.teams[home], s.teams[away], rng, { log: feat, env, userId: s.userId });
    if (res.tie) { res = { ...res, tie: false, winnerId: rng.chance(0.5) ? home : away }; }
    applyResultPO(s, res);
    seriesRecord(sr, res.winnerId === sr.a ? 0 : 1);
    if (feat) {
      const r = recordUser(s, res, `${ROUND_NAME[s.country][po.round]} ${sr.g}차전`, { po: true });
      rep.games++;
      if (r === 1) rep.w++; else rep.l++;
      if (seriesOver(sr)) { po.userRound = po.round; if (sr.win !== s.userId) po.userOut = true; }
    }
  }
  if (po.rounds[po.round].every(seriesOver)) {
    const nxt = nextRound(s.country, po, recordOf(s));
    if (nxt) { po.rounds.push(nxt); po.round++; } else { finishSeason(s, rng); return true; }
  }
  return true;
}
function applyResultPO(s, res) {
  // 포스트시즌 점수는 정규시즌 기록에 넣지 않는다.
}

function tickOnce(s, rng, rep) {
  if (s.phase === 'regular') stepRegular(s, rng, rep);
  else if (s.phase === 'playoffs') {
    stepPlayoff(s, rng, rep);
    // 내 팀이 탈락했거나 진출하지 못했으면 나머지 포스트시즌은 즉시 끝낸다.
    while (s.phase === 'playoffs' && !userInRound(s)) stepPlayoff(s, rng, rep);
  }
  return true;
}

// ───────── 시즌 종료 ─────────
function bestOf(s, pick) {
  let best = null;
  for (const t of s.teams) for (const p of t.players) { const v = pick(p); if (v != null && (!best || v > best.v)) best = { v, name: p.name, team: t.short }; }
  return best;
}
export function leaders(s) {
  return {
    hr: bestOf(s, (p) => (p.s && p.role === 'H' ? p.s.hr : null)),
    avg: bestOf(s, (p) => (p.s && p.role === 'H' && p.s.pa >= 3.1 * 100 && p.s.ab ? p.s.h / p.s.ab : null)),
    rbi: bestOf(s, (p) => (p.s && p.role === 'H' ? p.s.rbi : null)),
    w: bestOf(s, (p) => (p.s && p.role === 'P' ? p.s.w : null)),
    k: bestOf(s, (p) => (p.s && p.role === 'P' ? p.s.k : null)),
    sv: bestOf(s, (p) => (p.s && p.role === 'P' ? p.s.sv : null)),
    era: bestOf(s, (p) => (p.s && p.role === 'P' && p.s.outs >= 3 * 100 ? -(p.s.er * 27) / p.s.outs : null)),
  };
}

// MLB 사치세: 초과액을 $20M 구간별로 나눠 연속 초과 연차(1/2/3+)에 따른 세율 적용
export function cbtTax(L, pay, consecutive) {
  let over = pay - L.cbt, tax = 0;
  const k = Math.min(2, consecutive);
  for (const [width, rates] of L.cbtBands) {
    const part = Math.min(over, width);
    if (part <= 0) break;
    tax += part * rates[k];
    over -= part;
  }
  return r2(tax);
}

function finishSeason(s, rng) {
  const L = Lof(s);
  const po = s.playoff;
  const t = userTeam(s);
  const champ = s.teams[po.champion];
  const lead = leaders(s);
  let bonus = 0;
  const rev = annualRevenue(s, t);
  if (po.userIn) bonus = rev * (po.champion === s.userId ? 0.1 : po.userRound >= 2 ? 0.05 : 0.02);
  bonus = r2(bonus);
  s.money = r2(s.money + bonus);
  // 세금 / 경쟁균형세
  let penalty = 0, penaltyName = '';
  if (L.id === 'mlb') {
    const pay = payroll(t);
    if (pay > L.cbt) { penalty = cbtTax(L, pay, t.over || 0); penaltyName = '사치세(CBT)'; t.over = (t.over || 0) + 1; } else t.over = 0;
  } else {
    const cp = capPayroll(t);
    if (cp > L.cap) { penalty = r2((cp - L.cap) * L.capRates[Math.min(2, t.over || 0)]); penaltyName = '야구발전기금(경쟁균형세)'; t.over = (t.over || 0) + 1; } else t.over = 0;
  }
  s.money = r2(s.money - penalty);
  // 팬 / 인기
  for (const tm of s.teams) {
    const pct = winPct(tm);
    tm.fan = clamp(tm.fan + (pct - 0.5) * 40 + (tm.id === po.champion ? 6 : 0) + (50 - tm.fan) * 0.05, 15, 95);
  }
  const pos = standings(s);
  const hist = {
    season: s.season, year: seasonYear(s), champion: champ.name, championId: champ.id, rank: s.regularRank, w: s.regularRec.w, l: s.regularRec.l, d: s.regularRec.d,
    po: po.userIn ? (po.champion === s.userId ? '우승' : `${ROUND_NAME[s.country][po.userRound]} 탈락`) : '진출 실패', bonus, penalty, penaltyName, lead,
    payroll: payroll(t), pays: pos.length,
  };
  s.history.seasons.unshift(hist);
  s.history.seasons.length = Math.min(s.history.seasons.length, 20);
  addNews(s, 'season', `${seasonLabel(s)} 종료: ${champ.name} 우승`);
  if (penalty) addNews(s, 'finance', `${penaltyName} ${fmtMoney(s.country, penalty)} 납부`);

  // 계약 연차 정리 → 만료 선수
  const expiring = [];
  for (const tm of s.teams) {
    for (const p of tm.players.slice()) {
      if (p.act) p.svc++;
      p.yrs--;
      if (p.yrs > 0) continue;
      if (p.svc < L.faAt) { // 구단이 보유권을 가진 선수: 연봉 재조정 후 자동 갱신
        p.sal = r2(Math.max(L.minSal, p.svc < L.arbAt ? p.sal * 1.05 + (ovrOf(p) > 55 ? 0.05 * L.wage.base : 0) : marketWage(L, ovrOf(p), p.age) * 0.6));
        p.yrs = 1;
        continue;
      }
      if (tm.id === s.userId) { expiring.push(p.id); continue; }
      const v = valueOf(p);
      const room = budgetOf(s, tm) - payroll(tm);
      const want = marketWage(L, ovrOf(p), p.age) * 1.05;
      if (room > want * 0.5 && rng.chance(clamp(0.25 + v / 80, 0.2, 0.85))) { p.sal = r2(Math.max(L.minSal, want)); p.yrs = rng.int(1, M.maxYears(p)); }
      else { tm.players.splice(tm.players.indexOf(p), 1); p.act = 0; p.yrs = 0; s.market.free.push(p); }
    }
  }
  s.market.free = s.market.free.filter((p) => ovrOf(p) >= 36).slice(-160);
  s.market.free.push(...M.genFreePool(s, rng, 16));
  s.market.foreign = M.genForeignPool(s, rng, 12);
  s.phase = 'offseason';
  s.nextGameAt = null;
  s.offseason = { expiring, draft: M.makeDraft(s, rng), notes: [], hist };
  s.offers = [];
}

// ───────── 시간 흐름 ─────────
function stepOnce(s, rng, rep) {
  if (s.phase === 'regular' || s.phase === 'playoffs') return tickOnce(s, rng, rep);
  return false;
}
export function advance(s, now) {
  const rep = { games: 0, w: 0, d: 0, l: 0, money: 0, seasons: 0, skipped: 0, phaseChanged: false };
  if (s.phase === 'setup') return rep;
  const before = s.money, startPhase = s.phase;
  if (s.nextGameAt != null) {
    const iv = intervalMs(s);
    if (s.nextGameAt - now > iv * 1.01) s.nextGameAt = now + iv;
    if (now >= s.nextGameAt) {
      const due = Math.floor((now - s.nextGameAt) / iv) + 1;
      const run = Math.min(due, MAX_CATCHUP);
      let done = 0;
      withRng(s, (rng) => {
        for (; done < run; done++) {
          s.lastSeen = s.nextGameAt + done * iv;
          if (!stepOnce(s, rng, rep)) break;
          if (s.phase === 'offseason') {
            if (s.settings.autopilot) { startNextSeason(s, s.lastSeen, { auto: true, rng }); rep.seasons++; }
            else break;
          }
        }
      });
      if (s.phase === 'offseason') s.nextGameAt = null;
      else if (due > MAX_CATCHUP) { rep.skipped = due - MAX_CATCHUP; s.nextGameAt = now + iv; }
      else s.nextGameAt += run * iv;
    }
  }
  s.lastSeen = now;
  rep.money = r2(s.money - before);
  rep.phaseChanged = s.phase !== startPhase;
  return rep;
}
// 지금 바로 n경기(내 경기 기준) 진행. 시즌이 끝나면(오프시즌) 멈춘다.
export function playNow(s, n, now) {
  const rep = { games: 0, w: 0, d: 0, l: 0, money: 0, seasons: 0, skipped: 0 };
  if (s.phase !== 'regular' && s.phase !== 'playoffs') return rep;
  const before = s.money;
  withRng(s, (rng) => { for (let i = 0; i < n && (s.phase === 'regular' || s.phase === 'playoffs'); i++) stepOnce(s, rng, rep); });
  s.lastSeen = now;
  s.nextGameAt = s.phase === 'regular' || s.phase === 'playoffs' ? now + intervalMs(s) : null;
  rep.money = r2(s.money - before);
  return rep;
}
export const gamesLeft = (s) => {
  const L = Lof(s);
  const t = userTeam(s);
  return Math.max(0, L.games - (t.w + t.l + (t.d || 0)));
};
export const nextOpponent = (s) => {
  if (s.phase === 'regular' && s.sched) {
    for (let i = s.sched.idx; i < Math.min(s.sched.rounds.length, s.sched.idx + 8); i++) {
      const fx = s.sched.rounds[i].find(([h, a]) => h === s.userId || a === s.userId);
      if (fx) return { h: fx[0], a: fx[1], home: fx[0] === s.userId };
    }
  }
  if (s.phase === 'playoffs') {
    const sr = s.playoff.rounds[s.playoff.round].find((x) => !seriesOver(x) && (x.a === s.userId || x.b === s.userId));
    if (sr) { const h = seriesHome(sr); return { h, a: h === sr.a ? sr.b : sr.a, home: h === s.userId, sr }; }
  }
  return null;
};

// ───────── 오프시즌 → 다음 시즌 ─────────
function aiOffseasonMoves(s, rng) {
  const L = Lof(s);
  // FA 시장: 가치가 높은 순으로 예산 여유가 있는 팀이 영입
  const pool = s.market.free.slice().sort((a, b) => valueOf(b) - valueOf(a));
  for (const p of pool) {
    if (ovrOf(p) < 45) continue;
    const ask = r2(marketWage(L, ovrOf(p), p.age) * 1.08);
    const cand = rng.shuffle(s.teams.filter((t) => t.id !== s.userId && (!p.fx || M.foreignCount(t, p.fx) < M.FOREIGN_MAX[p.fx]))).filter((t) => budgetOf(s, t) - payroll(t) >= ask);
    if (!cand.length) continue;
    // 같은 역할의 가장 약한 1군급 선수보다 나을 때만
    const t = cand.sort((a, b) => budgetOf(s, b) - payroll(b) - (budgetOf(s, a) - payroll(a)))[0];
    const same = t.players.filter((q) => q.role === p.role && q.act).sort((a, b) => ovrOf(a) - ovrOf(b))[0];
    if (same && ovrOf(same) >= ovrOf(p)) continue;
    s.market.free.splice(s.market.free.indexOf(p), 1);
    p.sal = Math.max(L.minSal, ask); p.yrs = rng.int(1, M.maxYears(p)); p.act = 0;
    if (t.players.length >= M.rosterMax(s)) {
      const drop = t.players.filter((q) => !q.act && q.role === p.role && !needed(t, q)).sort((a, b) => valueOf(a) - valueOf(b))[0] || t.players.filter((q) => !q.act && !needed(t, q)).sort((a, b) => valueOf(a) - valueOf(b))[0];
      if (!drop) { s.market.free.push(p); continue; }
      t.players.splice(t.players.indexOf(drop), 1); drop.yrs = 0; if (ovrOf(drop) >= 40) s.market.free.push(drop);
    }
    t.players.push(p);
  }
  if (L.foreign) {
    for (const t of s.teams) {
      if (t.id === s.userId) continue;
      for (const fx of [1, 2]) {
        while (M.foreignCount(t, fx) < M.FOREIGN_MAX[fx]) {
          const c = s.market.foreign.filter((p) => p.fx === fx).sort((a, b) => ovrOf(b) - ovrOf(a))[0];
          if (!c) break;
          s.market.foreign.splice(s.market.foreign.indexOf(c), 1);
          c.sal = r2(Math.min(marketWage(L, ovrOf(c), c.age) * 1.05, fx === 2 ? M.ASIA_CAP : 1e9)); c.yrs = rng.int(1, 2); c.act = 0;
          t.players.push(c);
        }
      }
    }
  }
}

// 팀 구성을 위해 꼭 남겨야 하는 선수(포수 2명, 선발 6명까지)
const needed = (t, p) => (p.pos === 'C' && t.players.filter((q) => q.pos === 'C').length <= 2) || (p.pos === 'SP' && t.players.filter((q) => q.pos === 'SP').length <= 6);

function fillAndTrim(s, t, rng, ctx) {
  const L = Lof(s);
  const mean = teamOvr(t).total - 6;
  const need = (role, n, pos) => {
    while (t.players.filter((p) => p.role === role).length < n) {
      const pp = typeof pos === 'function' ? pos() : pos;
      const p = genPlayer(ctx, { role, pos: pp, ovr: mean - 10 + rng.normal(0, 5), age: rng.int(21, 27), act: 0 });
      p.sal = L.minSal; p.yrs = 1; p.svc = 0;
      t.players.push(p);
    }
  };
  need('H', L.nH + 4, () => rng.pick(['C', '2B', 'SS', 'CF', '1B', '3B', 'LF', 'RF']));
  if (!t.players.some((p) => p.pos === 'C')) need('H', t.players.filter((p) => p.role === 'H').length + 1, 'C');
  need('P', L.active - L.nH + 4, () => rng.pick(['SP', 'RP', 'RP']));
  while (t.players.filter((p) => p.pos === 'SP').length < L.nSP + 1) { const p = genPlayer(ctx, { role: 'P', pos: 'SP', ovr: mean - 6 + rng.normal(0, 5), age: rng.int(21, 28), act: 0 }); p.sal = L.minSal; p.yrs = 1; p.svc = 0; t.players.push(p); }
  const max = M.rosterMax(s);
  if (t.players.length > max) {
    const worst = t.players.slice().sort((a, b) => valueOf(a) - valueOf(b)).filter((p) => !p.act);
    while (t.players.length > max && worst.length) { const p = worst.shift(); if (needed(t, p)) continue; t.players.splice(t.players.indexOf(p), 1); p.yrs = 0; if (t.id !== s.userId) continue; s.market.free.push(p); }
  }
}

export function startNextSeason(s, now, { auto = false, rng: rngIn = null } = {}) {
  if (s.phase !== 'offseason') return false;
  const L = Lof(s);
  const run = (rng) => {
    const ctx = ctxOf(s, rng);
    const o = s.offseason;
    if (auto) autoOffseasonUser(s, rng);
    if (o.draft && !o.draft.done) M.draftAuto(s, rng);
    // 사용자 만료 선수: 재계약하지 않았으면 FA로
    for (const t of [userTeam(s)]) {
      for (const p of t.players.slice()) {
        if (p.yrs > 0) continue;
        t.players.splice(t.players.indexOf(p), 1); p.act = 0; p.yrs = 0;
        s.market.free.push(p);
        addNews(s, 'contract', `${p.name} 계약 만료로 팀을 떠났습니다`);
      }
    }
    aiOffseasonMoves(s, rng);
    // 나이, 성장, 은퇴
    for (const t of s.teams) {
      const mine = t.id === s.userId;
      for (const p of t.players.slice()) {
        const bonus = (mine ? 0.15 * s.fac.camp : 0) * (p.age <= 26 ? 1 : 0);
        ageUp(p, rng, bonus);
        p.s = null; p.fat = 0; p.rest = 5; p.lock = 0;
        p.inj = Math.max(0, p.inj - 40);
        if (p.age >= retireAge(p) || (p.age >= 37 && ovrOf(p) < 42 && rng.chance(0.5))) {
          t.players.splice(t.players.indexOf(p), 1);
          if (mine) addNews(s, 'contract', `${p.name} 은퇴 (${p.age}세)`);
        }
      }
      fillAndTrim(s, t, rng, ctx);
      t.w = t.l = t.d = t.rs = t.ra = 0;
      if (!mine || s.settings.autoRoster || validateRoster(t, L).length) autoRoster(t, L);
    }
    s.market.free = s.market.free.filter((p) => ovrOf(p) >= 36);
    s.market.free.forEach((p) => { p.age = p.age; });
    s.sched = { rounds: makeSchedule(L, rng), idx: 0 };
  };
  if (rngIn) run(rngIn); else withRng(s, run);
  s.season++;
  s.phase = 'regular';
  s.playoff = null;
  s.offseason = null;
  s.offers = [];
  s.streak = [];
  s.regularRank = 0;
  s.nextGameAt = now + intervalMs(s);
  s.lastSeen = now;
  return true;
}

// 어시스턴트: 사용자 구단의 오프시즌을 대신 처리
export function autoOffseasonUser(s, rng) {
  const t = userTeam(s);
  const o = s.offseason;
  // 만료 선수 재계약: 쓸 만한 선수는 예산 안에서
  for (const id of o.expiring.slice()) {
    const p = t.players.find((x) => x.id === id);
    if (!p || p.yrs > 0) continue;
    const room = budgetOf(s, t) * 1.2 - payroll(t);
    const q = M.extendQuote(s, p, 2);
    const better = t.players.filter((x) => x.role === p.role && x.act && x !== p && x.yrs > 0 && ovrOf(x) >= ovrOf(p)).length;
    if (ovrOf(p) >= 48 && better < (p.pos === 'SP' ? 5 : p.role === 'H' ? 9 : 10) && q <= room + 0.0001) M.extend(s, p.id, p.age >= 33 ? 1 : 2);
  }
  // 빈 자리는 가성비 FA로
  const free = s.market.free.slice().sort((a, b) => valueOf(b) - valueOf(a));
  for (const p of free) {
    if (t.players.length >= M.rosterMax(s) - 2) break;
    const ask = M.askSalary(s, p);
    if (ask > budgetOf(s, t) * 1.2 - payroll(t)) continue;
    const same = t.players.filter((q) => q.role === p.role && q.act).sort((a, b) => ovrOf(a) - ovrOf(b))[0];
    if (same && ovrOf(same) + 3 < ovrOf(p)) M.signFA(s, p.id, 2);
  }
}

// ───────── 시설 / 설정 ─────────
export const facCost = (s, key, lv) => r2(annualRevenue(s, userTeam(s), { stadium: 0 }) * 0.02 * Math.pow(1.55, lv));
export function upgradeFacility(s, key) {
  if (!(key in FAC_INFO)) return { ok: false, err: 'notfound' };
  const lv = s.fac[key];
  if (lv >= FAC_MAX) return { ok: false, err: 'max' };
  const cost = facCost(s, key, lv);
  if (s.money < cost) return { ok: false, err: 'money', cost };
  s.money = r2(s.money - cost);
  s.fac[key]++;
  return { ok: true, cost };
}
export function setIntervalMin(s, min, now) {
  if (!INTERVAL_CHOICES.includes(min)) return false;
  s.intervalMin = min;
  if (s.phase === 'regular' || s.phase === 'playoffs') s.nextGameAt = now + intervalMs(s);
  return true;
}
export function renameTeam(s, name) {
  const n = String(name).trim().slice(0, 14);
  if (!n) return false;
  userTeam(s).name = n;
  return true;
}
export function renamePlayer(s, pid, name) {
  const p = userTeam(s).players.find((x) => x.id === pid);
  const n = String(name).trim().slice(0, 14);
  if (!p || !n) return false;
  p.name = n;
  return true;
}
export function setLineupSlot(s, pos, pid) {
  const t = userTeam(s);
  if (!t.lineup) t.lineup = {};
  if (pid == null) delete t.lineup[pos]; else t.lineup[pos] = pid;
  t.auto = false;
}
export function setAutoLineup(s, on) { const t = userTeam(s); t.auto = !!on; if (on) t.lineup = null; }

// ───────── 개발자 메뉴 ─────────
export const dev = {
  setScale(s, scale, now) { s.dev.used = true; s.dev.timeScale = scale; if (s.nextGameAt != null) s.nextGameAt = now + intervalMs(s); },
  addMoney(s, amount) { s.dev.used = true; s.money = r2(s.money + amount); },
  boost(s, n) {
    s.dev.used = true;
    for (const p of userTeam(s).players) {
      const keys = p.role === 'H' ? ['con', 'pow', 'eye', 'spd', 'fld'] : ['stf', 'ctl', 'sta'];
      for (const k of keys) p[k] = clamp(p[k] + n, 20, 99);
      p.pot = Math.max(p.pot, ovrOf(p));
    }
  },
  skipGames(s, n) { s.dev.used = true; playNow(s, n, Date.now()); },
  toOffseason(s) { s.dev.used = true; withRng(s, (rng) => { const rep = { games: 0, w: 0, d: 0, l: 0 }; let g = 0; while ((s.phase === 'regular' || s.phase === 'playoffs') && g++ < 400) stepOnce(s, rng, rep); }); },
};
export { counts, validateRoster, blankBat };

// ───────── 화면용 계산 ─────────
export function preview(s) {
  const nx = nextOpponent(s);
  if (!nx) return null;
  const a = teamOvr(s.teams[nx.h]).total, b = teamOvr(s.teams[nx.a]).total;
  const pHome = 1 / (1 + Math.exp(-(0.13 * (a - b) + 0.14)));
  return { home: pHome, user: nx.home ? pHome : 1 - pHome };
}
const KINDS = {
  hr: ['홈런', (p) => (p.role === 'H' && p.s ? p.s.hr : null), (v) => v],
  rbi: ['타점', (p) => (p.role === 'H' && p.s ? p.s.rbi : null), (v) => v],
  avg: ['타율', (p) => (p.role === 'H' && p.s && p.s.pa >= 60 && p.s.ab ? p.s.h / p.s.ab : null), (v) => v.toFixed(3).replace(/^0/, '')],
  w: ['다승', (p) => (p.role === 'P' && p.s ? p.s.w : null), (v) => v],
  k: ['탈삼진', (p) => (p.role === 'P' && p.s ? p.s.k : null), (v) => v],
  sv: ['세이브', (p) => (p.role === 'P' && p.s ? p.s.sv : null), (v) => v],
  era: ['평균자책', (p) => (p.role === 'P' && p.s && p.s.outs >= 60 ? -(p.s.er * 27) / p.s.outs : null), (v) => (-v).toFixed(2)],
};
export const LEADER_KINDS = Object.keys(KINDS);
export function topList(s, kind, n = 5) {
  const [label, pick, fmt] = KINDS[kind];
  const rows = [];
  for (const t of s.teams) for (const p of t.players) { const v = pick(p); if (v != null && v !== 0) rows.push({ p, t, v }); }
  rows.sort((a, b) => b.v - a.v);
  return { label, rows: rows.slice(0, n).map((r) => ({ id: r.p.id, name: r.p.name, team: r.t.short, text: fmt(r.v), mine: r.t.id === s.userId })) };
}
export function rotationInfo(s) {
  const t = userTeam(s);
  const sp = t.players.filter((p) => p.pos === 'SP' && p.act).sort((a, b) => a.id - b.id);
  return sp.map((p) => ({ p, ready: p.inj <= 0 && p.rest >= 4 }));
}
export function nextStarterOf(s, id) {
  const t = s.teams[id];
  const ok = t.players.filter((p) => p.pos === 'SP' && p.act && p.inj <= 0).sort((a, b) => b.rest - a.rest || a.id - b.id);
  return ok[0] || null;
}
export function lineupOf(s) { return battingOrder(buildLineup(userTeam(s), true)); }
export const roleCounts = (s) => counts(userTeam(s));
export { buildLineup, battingOrder, autoRoster };
