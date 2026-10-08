// 게임 상태와 규칙. 화면/브라우저에 의존하지 않아서 Node에서 그대로 테스트한다.
import { createRng } from './rng.js';
import { createLeague, makeSchedule, genPlayer, ovrOf, statKeys, teamOvr } from './league.js';
import { simulateGame } from './sim.js';
import { clamp } from './util.js';

export const VERSION = 1;
export const USER_ID = 0;
export const INTERVAL_CHOICES = [5, 10, 20, 30]; // 분
export const MAX_CATCHUP = 200; // 한 번에 몰아서 처리할 최대 경기 수
export const FAC_MAX = 10;
const FAC_BASE = { stadium: 2500, camp: 2000, scout: 1800 };
export const FAC_INFO = {
  stadium: { name: '구장', desc: '홈경기 입장 수입 +20% / 레벨' },
  camp: { name: '훈련장', desc: '훈련 비용 -6% / 레벨, 시즌 후 성장 보너스' },
  scout: { name: '스카우트', desc: '신인 드래프트 후보의 능력과 잠재력 상승' },
};

export const intervalMs = (s) => (s.intervalMin * 60 * 1000) / (s.dev.timeScale || 1);

export function newGame(seed, now) {
  const rng = createRng(seed);
  const { teams, nextId } = createLeague(rng);
  const s = {
    v: VERSION,
    seed,
    rng: 0,
    nextPid: nextId,
    createdAt: now,
    season: 1,
    phase: 'regular', // regular | playoffs | offseason
    teams,
    schedule: makeSchedule(teams.map((t) => t.id)),
    roundIdx: 0,
    playoff: null,
    offseason: null,
    regularRank: 0,
    intervalMin: 10,
    nextGameAt: now + 10 * 60 * 1000,
    lastSeen: now,
    money: 1500,
    hype: 30,
    streak: 0,
    fac: { stadium: 0, camp: 0, scout: 0 },
    history: { games: [], champions: [] },
    latest: null,
    seq: 0,
    totals: { games: 0, wins: 0, earned: 0 },
    dev: { timeScale: 1, used: false },
  };
  s.rng = rng.state();
  return s;
}

export const userTeam = (s) => s.teams[USER_ID];
export const findPlayer = (s, id) => {
  for (const t of s.teams) {
    const p = t.players.find((x) => x.id === id);
    if (p) return p;
  }
  return null;
};

function withRng(s, fn) {
  const rng = createRng(s.rng);
  const out = fn(rng);
  s.rng = rng.state();
  return out;
}
const ctxOf = (s, rng) => ({ rng, nextId: () => s.nextPid++, used: new Set(s.teams.flatMap((t) => t.players.map((p) => p.name))) });

// ───────── 순위 ─────────
export function standings(s) {
  const rows = s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, w: t.w, l: t.l, rs: t.rs, ra: t.ra }));
  rows.sort((a, b) => b.w - a.w || b.rs - b.ra - (a.rs - a.ra) || a.id - b.id);
  const lead = rows[0];
  rows.forEach((r, i) => {
    r.rank = i + 1;
    r.gb = (lead.w - r.w + (r.l - lead.l)) / 2;
  });
  return rows;
}

// ───────── 수입 ─────────
function gameIncome(s, isHome, won) {
  const gate = 560 * (0.6 + s.hype / 100) * (1 + 0.2 * s.fac.stadium) * (isHome ? 1 : 0.35);
  const sponsor = won ? 120 : 0;
  const cost = 100 + 15 * (s.fac.stadium + s.fac.camp + s.fac.scout);
  return Math.round(gate + sponsor - cost);
}

// ───────── 경기 진행 ─────────
function playFixture(s, rng, fx, featured) {
  const home = s.teams[fx.h];
  const away = s.teams[fx.a];
  const res = simulateGame(home, away, rng, { log: featured });
  home.rs += res.hs;
  home.ra += res.as;
  away.rs += res.as;
  away.ra += res.hs;
  home.rot++;
  away.rot++;
  return res;
}

function recordUserGame(s, res, fx, label) {
  const isHome = fx.h === USER_ID;
  const us = isHome ? res.hs : res.as;
  const them = isHome ? res.as : res.hs;
  const won = us > them;
  const income = gameIncome(s, isHome, won);
  s.money += income;
  s.totals.earned += income;
  s.totals.games++;
  if (won) s.totals.wins++;
  s.hype = clamp(s.hype + (won ? 1.5 : -1), 0, 100);
  s.streak = won ? Math.max(1, s.streak + 1) : Math.min(-1, s.streak - 1);
  s.seq++;
  const oppId = isHome ? fx.a : fx.h;
  const entry = { seq: s.seq, season: s.season, label, oppId, home: isHome, us, them, won, income, line: res.line, hits: res.hits, innings: res.innings, walkoff: res.walkoff, wp: res.wp, lp: res.lp, sp: res.sp, awayId: res.awayId, homeId: res.homeId, key: res.plays.filter((p) => p.runs > 0) };
  s.history.games.unshift(entry);
  s.history.games.length = Math.min(s.history.games.length, 30);
  s.latest = { ...entry, plays: res.plays };
}

function applyWinLoss(s, res) {
  const w = s.teams[res.winnerId];
  const l = s.teams[res.winnerId === res.homeId ? res.awayId : res.homeId];
  w.w++;
  l.l++;
}

function playRegularRound(s, rng) {
  const round = s.schedule[s.roundIdx];
  for (const fx of round) {
    const featured = fx.h === USER_ID || fx.a === USER_ID;
    const res = playFixture(s, rng, fx, featured);
    applyWinLoss(s, res);
    if (featured) recordUserGame(s, res, fx, `정규 ${s.roundIdx + 1}/${s.schedule.length}`);
  }
  s.roundIdx++;
  if (s.roundIdx >= s.schedule.length) startPlayoffs(s);
}

function startPlayoffs(s) {
  const order = standings(s);
  s.regularRank = order.find((r) => r.id === USER_ID).rank;
  const seeds = order.slice(0, 4).map((r) => r.id);
  s.phase = 'playoffs';
  s.playoff = { seeds, round: 0, rounds: [[{ h: seeds[0], a: seeds[3] }, { h: seeds[1], a: seeds[2] }]], userLost: -1, champion: null };
}

const ROUND_NAMES = ['준결승', '결승'];

function playPlayoffRound(s, rng) {
  const po = s.playoff;
  const fixtures = po.rounds[po.round];
  const winners = [];
  for (const fx of fixtures) {
    const featured = fx.h === USER_ID || fx.a === USER_ID;
    const res = playFixture(s, rng, fx, featured);
    winners.push(res.winnerId);
    if (featured) {
      recordUserGame(s, res, fx, `포스트시즌 ${ROUND_NAMES[po.round]}`);
      if (res.winnerId !== USER_ID) po.userLost = po.round;
    }
  }
  if (winners.length === 1) {
    po.champion = winners[0];
    finishSeason(s, rng);
    return;
  }
  const [x, y] = winners.sort((a, b) => po.seeds.indexOf(a) - po.seeds.indexOf(b));
  po.rounds.push([{ h: x, a: y }]);
  po.round++;
}

const userInRound = (s) => s.playoff.rounds[s.playoff.round].some((fx) => fx.h === USER_ID || fx.a === USER_ID);

function tickOnce(s, rng) {
  if (s.phase === 'regular') playRegularRound(s, rng);
  else if (s.phase === 'playoffs') playPlayoffRound(s, rng);
  // 내 팀이 탈락했거나 진출하지 못했으면 나머지 포스트시즌은 즉시 끝낸다.
  while (s.phase === 'playoffs' && !userInRound(s)) playPlayoffRound(s, rng);
}

function finishSeason(s, rng) {
  const po = s.playoff;
  let bonus = 500;
  if (po.champion === USER_ID) bonus = 12000;
  else if (po.userLost === 1) bonus = 5000;
  else if (po.seeds.includes(USER_ID)) bonus = 2000;
  s.money += bonus;
  s.totals.earned += bonus;
  if (po.champion === USER_ID) s.hype = clamp(s.hype + 15, 0, 100);
  s.history.champions.unshift({ season: s.season, teamId: po.champion, name: s.teams[po.champion].name, rank: s.regularRank, w: userTeam(s).w, l: userTeam(s).l });
  s.phase = 'offseason';
  s.nextGameAt = null;
  s.offseason = { bonus, candidates: makeCandidates(s, rng), drafted: false };
}

function makeCandidates(s, rng) {
  const ctx = ctxOf(s, rng);
  const sc = s.fac.scout;
  const roles = ['H', 'SP', rng.pick(['H', 'SP', 'RP'])];
  return roles.map((role) =>
    genPlayer(ctx, { role, pos: role === 'H' ? 'DH' : role, ovr: clamp(44 + sc * 2.5 + rng.normal(0, 6), 35, 85), age: rng.int(19, 22), potBonus: 8 + sc * 2 }),
  );
}

// 시간이 흐른 만큼 경기를 진행한다. 호출 간격이 길어도 결과는 같다(결정적).
export function advance(s, now) {
  const rep = { games: 0, wins: 0, losses: 0, money: 0, phaseChanged: false, skipped: 0 };
  const startPhase = s.phase;
  const moneyBefore = s.money;
  if (s.phase !== 'offseason' && s.nextGameAt != null) {
    const iv = intervalMs(s);
    if (s.nextGameAt - now > iv * 1.01) s.nextGameAt = now + iv; // 시계가 뒤로 갔을 때
    if (now >= s.nextGameAt) {
      let due = Math.floor((now - s.nextGameAt) / iv) + 1;
      const run = Math.min(due, MAX_CATCHUP);
      withRng(s, (rng) => {
        for (let i = 0; i < run && s.phase !== 'offseason'; i++) {
          const before = s.seq;
          tickOnce(s, rng);
          rep.games++;
          if (s.seq !== before) s.history.games[0].won ? rep.wins++ : rep.losses++;
        }
      });
      if (s.phase !== 'offseason') {
        if (due > MAX_CATCHUP) {
          rep.skipped = due - MAX_CATCHUP;
          s.nextGameAt = now + iv;
        } else s.nextGameAt += run * iv;
      }
    }
  }
  s.lastSeen = now;
  rep.money = s.money - moneyBefore;
  rep.phaseChanged = s.phase !== startPhase;
  return rep;
}

// ───────── 오프시즌 ─────────
export function draftPick(s, candIdx, replaceId) {
  const o = s.offseason;
  if (s.phase !== 'offseason' || !o || o.drafted) return { ok: false, err: 'state' };
  const cand = o.candidates[candIdx];
  const team = userTeam(s);
  const old = team.players.find((p) => p.id === replaceId);
  if (!cand || !old) return { ok: false, err: 'notfound' };
  if ((cand.role === 'H') !== (old.role === 'H')) return { ok: false, err: 'role' };
  cand.role = old.role;
  cand.pos = old.pos;
  team.players[team.players.indexOf(old)] = cand;
  o.drafted = true;
  return { ok: true, in: cand, out: old };
}

function progress(p, rng, campLv) {
  const age = p.age;
  const [lo, hi] = age <= 23 ? [0, 5] : age <= 27 ? [-1, 3] : age <= 31 ? [-2, 2] : age <= 34 ? [-4, 1] : [-5, 0];
  for (const k of statKeys(p)) {
    let d = rng.int(lo, hi);
    if (campLv && d >= 0 && rng.chance(campLv * 0.06)) d++;
    p[k] = clamp(p[k] + d, 25, p.pot);
  }
  if (age >= 29) p.pot = Math.max(Math.max(...statKeys(p).map((k) => p[k])), p.pot - rng.int(0, 2));
}

export function startNextSeason(s, now, { autoDraft = false } = {}) {
  if (s.phase !== 'offseason') return false;
  withRng(s, (rng) => {
    const ctx = ctxOf(s, rng);
    if (autoDraft && !s.offseason.drafted) {
      const team = userTeam(s);
      const best = s.offseason.candidates.map((c, i) => ({ c, i })).sort((a, b) => ovrOf(b.c) - ovrOf(a.c))[0];
      const pool = team.players.filter((p) => (p.role === 'H') === (best.c.role === 'H')).sort((a, b) => ovrOf(a) - ovrOf(b));
      if (ovrOf(best.c) > ovrOf(pool[0])) draftPick(s, best.i, pool[0].id);
    }
    for (const t of s.teams) {
      t.players.forEach((p, idx) => {
        p.age++;
        p.s = null;
        progress(p, rng, t.id === USER_ID ? s.fac.camp : 0);
        if (p.age >= 38) {
          const rookie = genPlayer(ctx, { role: p.role, pos: p.pos, ovr: 50 + rng.normal(0, 5), age: rng.int(19, 22) });
          t.players[idx] = rookie;
        }
      });
      if (t.id !== USER_ID) {
        // AI 팀은 매 시즌 가장 약한 선수를 신인으로 교체한다.
        const worst = t.players.slice().sort((a, b) => ovrOf(a) - ovrOf(b))[0];
        const rookie = genPlayer(ctx, { role: worst.role, pos: worst.pos, ovr: 52 + rng.normal(0, 6), age: rng.int(19, 22), potBonus: 6 });
        if (ovrOf(rookie) > ovrOf(worst)) t.players[t.players.indexOf(worst)] = rookie;
      }
      t.w = t.l = t.rs = t.ra = 0;
    }
  });
  s.season++;
  s.phase = 'regular';
  s.schedule = makeSchedule(s.teams.map((t) => t.id));
  s.roundIdx = 0;
  s.playoff = null;
  s.offseason = null;
  s.streak = 0;
  s.regularRank = 0;
  s.nextGameAt = now + intervalMs(s);
  s.lastSeen = now;
  return true;
}

// ───────── 투자 ─────────
export const trainCost = (s, p, stat) => Math.round((Math.pow(p[stat], 2.2) / 10) * (1 - 0.06 * s.fac.camp));

export function train(s, pid, stat) {
  const p = userTeam(s).players.find((x) => x.id === pid);
  if (!p || !statKeys(p).includes(stat)) return { ok: false, err: 'notfound' };
  if (p[stat] >= p.pot) return { ok: false, err: 'cap' };
  const cost = trainCost(s, p, stat);
  if (s.money < cost) return { ok: false, err: 'money', cost };
  s.money -= cost;
  p[stat]++;
  return { ok: true, cost };
}

export const facCost = (key, lv) => Math.round(FAC_BASE[key] * Math.pow(1.75, lv));

export function upgradeFacility(s, key) {
  if (!(key in FAC_BASE)) return { ok: false, err: 'notfound' };
  const lv = s.fac[key];
  if (lv >= FAC_MAX) return { ok: false, err: 'max' };
  const cost = facCost(key, lv);
  if (s.money < cost) return { ok: false, err: 'money', cost };
  s.money -= cost;
  s.fac[key]++;
  return { ok: true, cost };
}

export function setIntervalMin(s, min, now) {
  if (!INTERVAL_CHOICES.includes(min)) return false;
  s.intervalMin = min;
  if (s.phase !== 'offseason') s.nextGameAt = now + intervalMs(s);
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
  const n = String(name).trim().slice(0, 8);
  if (!p || !n) return false;
  p.name = n;
  return true;
}

// ───────── 개발자 메뉴 ─────────
export const dev = {
  setScale(s, scale, now) {
    s.dev.used = true;
    s.dev.timeScale = scale;
    if (s.phase !== 'offseason') s.nextGameAt = now + intervalMs(s);
  },
  addMoney(s, amount) {
    s.dev.used = true;
    s.money += amount;
  },
  boost(s, n) {
    s.dev.used = true;
    for (const p of userTeam(s).players) {
      for (const k of statKeys(p)) p[k] = clamp(p[k] + n, 25, 99);
      p.pot = Math.max(p.pot, ...statKeys(p).map((k) => p[k]));
    }
  },
  skipGames(s, n) {
    s.dev.used = true;
    withRng(s, (rng) => {
      for (let i = 0; i < n && s.phase !== 'offseason'; i++) tickOnce(s, rng);
    });
    if (s.phase !== 'offseason') s.nextGameAt = Date.now() + intervalMs(s);
  },
  toOffseason(s) {
    s.dev.used = true;
    withRng(s, (rng) => {
      while (s.phase !== 'offseason') tickOnce(s, rng);
    });
  },
};

export { teamOvr, ovrOf };
