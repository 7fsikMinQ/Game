// 두 칸(A/B)에 번갈아 저장한다. 쓰다 꺼져도 직전 칸은 온전하다. 칸마다 체크섬이 있어 깨졌으면 반대 칸으로 복구한다.
// 저장 크기를 줄이려고 선수 능력치를 배열로 접고 기본값은 생략한다(복원하면 완전히 같은 상태).
const KEYS = ['bb.save.a', 'bb.save.b'];
const FORMAT = 'baseball-save';
const H = ['con', 'pow', 'eye', 'spd', 'fld'];
const P = ['stf', 'ctl', 'sta'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}
const DEFAULTS = { inj: 0, fat: 0, rest: 5, fx: 0, hype: 0, s: null, lock: 0, ext: 0, act: 1 };
function packPlayer(p) {
  const keys = p.role === 'H' ? H : P;
  const o = { ...p, a: keys.map((k) => p[k]) };
  for (const k of H.concat(P)) delete o[k];
  for (const k in DEFAULTS) if (JSON.stringify(o[k]) === JSON.stringify(DEFAULTS[k])) delete o[k];
  return o;
}
function unpackPlayer(o) {
  const keys = o.role === 'H' ? H : P;
  const p = { ...o };
  keys.forEach((k, i) => (p[k] = o.a[i]));
  delete p.a;
  for (const k in DEFAULTS) if (!(k in p)) p[k] = DEFAULTS[k];
  return p;
}
export function compact(state) {
  const o = { ...state, teams: state.teams.map((t) => ({ ...t, players: t.players.map(packPlayer) })) };
  o.market = { free: state.market.free.map(packPlayer), foreign: state.market.foreign.map(packPlayer) };
  if (state.sched) o.sched = { idx: state.sched.idx, rounds: state.sched.rounds.map((r) => r.flat()) };
  if (state.offseason) {
    const d = state.offseason.draft;
    o.offseason = { ...state.offseason, draft: d ? { ...d, pool: d.pool.map(packPlayer) } : d };
  }
  return o;
}
export function inflate(o) {
  const state = { ...o, teams: o.teams.map((t) => ({ ...t, players: t.players.map(unpackPlayer) })) };
  state.market = { free: o.market.free.map(unpackPlayer), foreign: o.market.foreign.map(unpackPlayer) };
  if (o.sched) state.sched = { idx: o.sched.idx, rounds: o.sched.rounds.map((r) => { const out = []; for (let i = 0; i < r.length; i += 2) out.push([r[i], r[i + 1]]); return out; }) };
  if (o.offseason) {
    const d = o.offseason.draft;
    state.offseason = { ...o.offseason, draft: d ? { ...d, pool: d.pool.map(unpackPlayer) } : d };
  }
  return state;
}

export function pack(state, seq) {
  const data = JSON.stringify(compact(state));
  return JSON.stringify({ f: FORMAT, seq, savedAt: Date.now(), sum: hash(data), data });
}
export function unpack(text) {
  try {
    const o = JSON.parse(text);
    if (o.f !== FORMAT || typeof o.data !== 'string' || hash(o.data) !== o.sum) return null;
    const raw = JSON.parse(o.data);
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.teams) || typeof raw.v !== 'number' || raw.game !== 'baseball' || raw.v < 2) return null;
    return { state: inflate(raw), seq: o.seq | 0, savedAt: o.savedAt };
  } catch { return null; }
}

export function createStore(storage) {
  let seq = 0;
  const read = (k) => { try { return storage.getItem(k); } catch { return null; } };
  return {
    load() {
      const found = KEYS.map((k) => unpack(read(k))).filter(Boolean).sort((a, b) => b.seq - a.seq);
      if (!found.length) return null;
      seq = found[0].seq;
      return found[0].state;
    },
    save(state) {
      seq++;
      try { storage.setItem(KEYS[seq % 2], pack(state, seq)); return true; } catch { return false; }
    },
    clear() { try { KEYS.forEach((k) => storage.removeItem(k)); } catch { /* 지울 수 없어도 무시 */ } seq = 0; },
  };
}
export const exportText = (state) => pack(state, 0);
export function importText(text) { const r = unpack(String(text).trim()); return r ? r.state : null; }
