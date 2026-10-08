import { SURNAMES, GIVEN_A, GIVEN_B, TEAM_DEFS, POSITIONS } from './data.js';
import { clamp, avg } from './util.js';

export const HIT_STATS = ['con', 'pow', 'eye', 'spd', 'def'];
export const PIT_STATS = ['stf', 'ctl', 'sta'];
export const STAT_LABEL = { con: '컨택', pow: '파워', eye: '선구', spd: '주력', def: '수비', stf: '구위', ctl: '제구', sta: '체력' };

export function ovrOf(p) {
  if (p.role === 'H') return Math.round(p.con * 0.32 + p.pow * 0.28 + p.eye * 0.18 + p.spd * 0.1 + p.def * 0.12);
  return Math.round(p.stf * 0.45 + p.ctl * 0.35 + p.sta * 0.2);
}
export const statKeys = (p) => (p.role === 'H' ? HIT_STATS : PIT_STATS);

const clampStat = (v) => clamp(Math.round(v), 25, 95);

function genName(rng, used) {
  for (let i = 0; i < 50; i++) {
    const n = rng.pick(SURNAMES) + rng.pick(GIVEN_A) + rng.pick(GIVEN_B);
    if (!used.has(n)) {
      used.add(n);
      return n;
    }
  }
  return rng.pick(SURNAMES) + rng.pick(GIVEN_A) + rng.pick(GIVEN_B);
}

// ctx = { rng, nextId(), used:Set }
export function genPlayer(ctx, { role, pos, ovr, age, potBonus }) {
  const { rng } = ctx;
  const p = { id: ctx.nextId(), name: genName(rng, ctx.used), role, pos, age: age ?? rng.int(19, 36), s: null };
  if (role === 'H') {
    const tilt = rng.int(0, 2);
    const t = [{ pow: 7, spd: -7 }, { con: 6, pow: -5 }, { spd: 8, pow: -6 }][tilt];
    for (const k of HIT_STATS) p[k] = clampStat(ovr + rng.normal(0, 7) + (t[k] || 0));
  } else {
    for (const k of PIT_STATS) p[k] = clampStat(ovr + rng.normal(0, 7) + (k === 'sta' && role === 'RP' ? -8 : 0));
  }
  const top = Math.max(...statKeys(p).map((k) => p[k]));
  const youth = p.age <= 24 ? 8 : p.age <= 28 ? 3 : 0;
  p.pot = clamp(Math.max(top, ovrOf(p) + rng.int(2, 14) + youth + (potBonus || 0)), top, 99);
  return p;
}

function genTeam(ctx, id, name, mean) {
  const { rng } = ctx;
  const players = [];
  POSITIONS.forEach((pos) => players.push(genPlayer(ctx, { role: 'H', pos, ovr: mean + rng.normal(0, 6) })));
  for (let i = 0; i < 5; i++) players.push(genPlayer(ctx, { role: 'SP', pos: 'SP', ovr: mean + rng.normal(0, 6) }));
  for (let i = 0; i < 3; i++) players.push(genPlayer(ctx, { role: 'RP', pos: 'RP', ovr: mean - 2 + rng.normal(0, 6) }));
  return { id, name, color: TEAM_DEFS[id % TEAM_DEFS.length].color, players, w: 0, l: 0, rs: 0, ra: 0, rot: 0 };
}

export function createLeague(rng, count = 8) {
  let counter = 1;
  const ctx = { rng, nextId: () => counter++, used: new Set() };
  const teams = [];
  for (let i = 0; i < count; i++) {
    const d = TEAM_DEFS[i % TEAM_DEFS.length];
    const mean = i === 0 ? 53 : clamp(55 + rng.normal(0, 2.5), 49, 61);
    teams.push(genTeam(ctx, i, `${d.city} ${d.mascot}`, mean));
  }
  return { teams, nextId: counter };
}

export const teamOvr = (team) => {
  const h = team.players.filter((p) => p.role === 'H').map(ovrOf);
  const sp = team.players.filter((p) => p.role === 'SP').map(ovrOf);
  const rp = team.players.filter((p) => p.role === 'RP').map(ovrOf);
  const bat = avg(h), start = avg(sp), pen = avg(rp);
  return { bat, sp: start, rp: pen, total: bat * 0.5 + start * 0.35 + pen * 0.15 };
};

// 타순: 2번째로 좋은 타자가 1번, 가장 좋은 타자가 3번.
export function getLineup(team) {
  const hit = team.players.filter((p) => p.role === 'H').sort((a, b) => ovrOf(b) - ovrOf(a));
  const slots = [1, 3, 0, 2, 4, 5, 6, 7, 8];
  return slots.map((i) => hit[i]);
}
export const getRotation = (team) => team.players.filter((p) => p.role === 'SP');
export const getBullpen = (team) => team.players.filter((p) => p.role === 'RP');

// 라운드 로빈(서클 방식). 같은 상대와 cycles번 만나고, 사이클마다 홈/원정이 바뀐다.
export function makeSchedule(ids, cycles = 6) {
  const n = ids.length;
  const arr = ids.slice();
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) round.push([arr[i], arr[n - 1 - i]]);
    rounds.push(round);
    arr.splice(1, 0, arr.pop());
  }
  const out = [];
  for (let c = 0; c < cycles; c++) {
    for (const round of rounds) {
      out.push(
        round.map(([x, y]) => {
          const flip = (ids.indexOf(x) < ids.indexOf(y) ? 0 : 1) ^ (c % 2);
          return flip ? { h: y, a: x } : { h: x, a: y };
        }),
      );
    }
  }
  return out;
}
