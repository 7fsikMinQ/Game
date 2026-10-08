// 데이터 팩: 사용자가 직접 가져오는 선수 데이터(CSV 또는 JSON). 앱에는 실제 선수 데이터가 들어 있지 않다.
// 이유와 구하는 방법은 docs/baseball/REAL-DATA.md. 가져온 데이터는 이 기기 안에만 저장된다.
import { LEAGUES } from './data.js';
import { genPlayer, ovrOf, marketWage } from './player.js';
import { clamp } from './util.js';

export const PACK_FORMAT = 'baseball-pack';
export const MAX_PACK_BYTES = 6 * 1024 * 1024;
const EN = {
  mlb: ['New York Yankees', 'Boston Red Sox', 'Toronto Blue Jays', 'Baltimore Orioles', 'Tampa Bay Rays', 'Detroit Tigers', 'Cleveland Guardians', 'Kansas City Royals', 'Minnesota Twins', 'Chicago White Sox', 'Houston Astros', 'Seattle Mariners', 'Texas Rangers', 'Los Angeles Angels', 'Athletics', 'Philadelphia Phillies', 'New York Mets', 'Atlanta Braves', 'Miami Marlins', 'Washington Nationals', 'Milwaukee Brewers', 'Chicago Cubs', 'Cincinnati Reds', 'St. Louis Cardinals', 'Pittsburgh Pirates', 'Los Angeles Dodgers', 'San Diego Padres', 'San Francisco Giants', 'Arizona Diamondbacks', 'Colorado Rockies'],
  kbo: ['LG Twins', 'Hanwha Eagles', 'SSG Landers', 'Samsung Lions', 'NC Dinos', 'KT Wiz', 'Lotte Giants', 'KIA Tigers', 'Doosan Bears', 'Kiwoom Heroes'],
};
const norm = (x) => String(x || '').toLowerCase().replace(/[\s.\-_]/g, '');
export function teamKeys(country) {
  const L = LEAGUES[country];
  const m = new Map();
  L.teams.forEach((t, i) => {
    const keys = [t.name, t.short, EN[country][i], EN[country][i].split(' ').slice(-1)[0], t.name.split(' ').slice(-1)[0]];
    for (const k of keys) { const n = norm(k); if (n && !m.has(n)) m.set(n, i); }
  });
  return m;
}
const COUNTRY_ALIAS = { mlb: 'mlb', us: 'mlb', usa: 'mlb', 미국: 'mlb', kbo: 'kbo', kr: 'kbo', kor: 'kbo', korea: 'kbo', 한국: 'kbo' };
export const POS_MAP = {
  C: 'C', 포수: 'C', '1B': '1B', '1루수': '1B', '2B': '2B', '2루수': '2B', '3B': '3B', '3루수': '3B', SS: 'SS', 유격수: 'SS',
  LF: 'LF', 좌익수: 'LF', CF: 'CF', 중견수: 'CF', RF: 'RF', 우익수: 'RF', OF: 'CF', IF: '2B', DH: 'DH', 지명타자: 'DH', UT: '2B', INF: '2B', 내야수: '2B', 외야수: 'CF', 타자: 'DH',
  SP: 'SP', 선발: 'SP', P: 'RP', RP: 'RP', CP: 'RP', CL: 'RP', 구원: 'RP', 마무리: 'RP', 투수: 'SP', LHP: 'SP', RHP: 'SP',
};
export function ageFromBirth(birth, asOf = '2026-10-08') {
  const b = new Date(birth), a = new Date(asOf);
  if (isNaN(b) || isNaN(a)) return NaN;
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  const m = a.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && a.getUTCDate() < b.getUTCDate())) age--;
  return age;
}
// MLB The Show 류의 40~99 OVR을 이 게임 스케일로 환산(근사). 문서에 근거를 적었다.
export const ovrFromShow = (show) => clamp(Math.round(0.9 * (show - 40) + 33), 25, 95);

export function parseCSV(text) {
  const t = String(text).replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] || '';
  const delim = first.includes('\t') ? '\t' : ',';
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
const num = (x) => (x === '' || x == null ? undefined : Number(x));

export function csvToPack(text, { name = '가져온 데이터', asOf = '2026-10-08' } = {}) {
  const rows = parseCSV(text);
  let country = null;
  const teams = new Map();
  for (const r of rows) {
    const c = COUNTRY_ALIAS[String(r.country || r.league || '').trim().toLowerCase()] || COUNTRY_ALIAS[String(r.country || r.league || '').trim()];
    if (c) country = country || c;
    const team = r.team || r['구단'];
    if (!team) continue;
    if (!teams.has(team)) teams.set(team, { team, players: [] });
    const nm = r.name || r['선수'];
    if (nm) teams.get(team).players.push({ name: nm, pos: r.pos || r['포지션'], birth: r.birth || r['생년월일'] || undefined, age: num(r.age || r['나이']), ovr: num(r.ovr), show: num(r.show), pot: num(r.pot), hype: num(r.hype), salary: num(r.salary || r['연봉']), years: num(r.years), fx: r.fx || r['외국인'] || undefined });
  }
  return { format: PACK_FORMAT, version: 1, name, asOf, country, teams: [...teams.values()] };
}
export const CSV_TEMPLATE = `league,team,name,pos,birth,ovr,pot,hype,salary,years,fx
mlb,Yankees,샘플 타자,RF,1999-05-12,80,80,0,35,5,
mlb,Yankees,샘플 투수,SP,1996-08-30,74,74,0,25,3,
mlb,Yankees,샘플 신예,SS,2007-02-20,50,78,3,0.8,3,
kbo,LG,샘플 외인,SP,1995-03-02,72,72,0,15,1,1
`;

export function validatePack(pack) {
  const errors = [], warnings = [];
  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['데이터를 읽을 수 없습니다'], warnings, stats: { teams: 0, players: 0 } };
  if (pack.format !== PACK_FORMAT) errors.push(`format 이 "${PACK_FORMAT}" 이어야 합니다`);
  const L = LEAGUES[pack.country];
  if (!L) errors.push('league(country) 는 mlb / kbo 중 하나여야 합니다');
  if (!Array.isArray(pack.teams) || !pack.teams.length) errors.push('teams 가 비어 있습니다');
  let teams = 0, players = 0;
  if (!errors.length) {
    const keys = teamKeys(pack.country);
    const seen = new Set();
    for (const c of pack.teams) {
      teams++;
      if (!c || typeof c.team !== 'string') { errors.push('이름이 없는 구단이 있습니다'); continue; }
      const idx = keys.get(norm(c.team));
      if (idx === undefined) { warnings.push(`알 수 없는 구단: ${c.team} (건너뜀)`); continue; }
      if (seen.has(idx)) warnings.push(`${c.team}: 같은 구단이 두 번 나옵니다`);
      seen.add(idx);
      const ps = Array.isArray(c.players) ? c.players : [];
      if (ps.length > 70) errors.push(`${c.team}: 선수가 너무 많습니다(${ps.length})`);
      if (ps.length && ps.length < 20) warnings.push(`${c.team}: 선수 ${ps.length}명 — 나머지는 가상 선수로 둡니다`);
      for (const p of ps) {
        players++;
        if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24) { errors.push(`${c.team}: 이름이 잘못된 선수가 있습니다`); continue; }
        const age = p.birth ? ageFromBirth(p.birth, pack.asOf) : p.age;
        if (!(age >= 16 && age <= 46)) warnings.push(`${p.name}: 나이를 알 수 없어 27세로 둡니다`);
        if (!POS_MAP[String(p.pos || '').trim().toUpperCase()] && !POS_MAP[String(p.pos || '').trim()]) warnings.push(`${p.name}: 포지션 "${p.pos ?? ''}"을(를) 몰라 DH/RP로 둡니다`);
        if (p.ovr !== undefined && !(p.ovr >= 20 && p.ovr <= 99)) errors.push(`${p.name}: ovr 은 20~99`);
        if (p.show !== undefined && !(p.show >= 20 && p.show <= 99)) errors.push(`${p.name}: show 는 20~99`);
        if (p.pot !== undefined && !(p.pot >= 20 && p.pot <= 99)) errors.push(`${p.name}: pot 은 20~99`);
        if (p.hype !== undefined && ![0, 1, 2, 3, 4].includes(p.hype)) errors.push(`${p.name}: hype 는 0~4`);
      }
    }
  }
  if (players > 4000) errors.push('선수가 너무 많습니다(최대 4000명)');
  return { ok: errors.length === 0, errors: errors.slice(0, 12), warnings: warnings.slice(0, 12), stats: { teams, players, moreErrors: Math.max(0, errors.length - 12) } };
}
export function parsePackText(text) {
  const t = String(text);
  if (t.length > MAX_PACK_BYTES) return { ok: false, errors: ['파일이 너무 큽니다(6MB 초과)'], warnings: [], stats: { teams: 0, players: 0 } };
  const s = t.trim();
  let pack;
  try { pack = s.startsWith('{') ? JSON.parse(s) : csvToPack(s); }
  catch { return { ok: false, errors: ['JSON/CSV 형식이 올바르지 않습니다'], warnings: [], stats: { teams: 0, players: 0 } }; }
  const v = validatePack(pack);
  return { ...v, pack: v.ok ? pack : null };
}

// s 는 newGame(seed, now, pack.country) 직후의 월드. 구단 선수를 팩 내용으로 바꾼다.
export function applyPack(s, pack, rng, ctx) {
  const L = LEAGUES[s.country];
  const keys = teamKeys(s.country);
  const stats = { teams: 0, players: 0 };
  for (const c of pack.teams) {
    const idx = keys.get(norm(c.team));
    if (idx === undefined) continue;
    const t = s.teams[idx];
    const ps = (c.players || []).filter((p) => p && p.name).slice(0, 70);
    if (!ps.length) continue;
    stats.teams++;
    const free = t.players.slice();
    const mean = free.filter((p) => p.act).reduce((a, p) => a + ovrOf(p), 0) / Math.max(1, free.filter((p) => p.act).length);
    for (const cp of ps) {
      const pos = POS_MAP[String(cp.pos || '').trim().toUpperCase()] || POS_MAP[String(cp.pos || '').trim()] || 'DH';
      const role = pos === 'SP' || pos === 'RP' ? 'P' : 'H';
      let age = cp.birth ? ageFromBirth(cp.birth, pack.asOf) : cp.age;
      if (!(age >= 16 && age <= 46)) age = 27;
      const fx = cp.fx === undefined || cp.fx === '' ? 0 : /^(2|asia|아시아)/i.test(String(cp.fx)) ? 2 : /^(1|y|true|외|foreign)/i.test(String(cp.fx)) ? 1 : 0;
      let ovr = cp.ovr ?? (cp.show !== undefined ? ovrFromShow(cp.show) : undefined);
      if (ovr === undefined && cp.salary > 0) ovr = clamp(Math.round(50 + Math.log(Math.max(cp.salary, L.minSal) / L.wage.base) / L.wage.k), 30, 90);
      if (ovr === undefined) ovr = clamp(Math.round(mean - 4 + rng.normal(0, 8)), 30, 85);
      const p = genPlayer(ctx, { role, pos, ovr, age, hype: age <= 23 ? cp.hype ?? 0 : 0, pot: cp.pot, name: String(cp.name).trim().slice(0, 24), fx, act: 1, exact: true });
      if (cp.salary > 0) p.sal = Math.max(L.minSal, Math.round(cp.salary * 100) / 100);
      if (cp.years > 0) p.yrs = clamp(Math.round(cp.years), 1, 8);
      // 같은 포지션 → 같은 역할 순으로 가상 선수를 대체(가장 비슷한 능력의 선수)
      const same = free.filter((q) => q.pos === pos), role2 = free.filter((q) => q.role === role);
      const pool = same.length ? same : role2;
      if (!pool.length) continue;
      pool.sort((a, b) => Math.abs(ovrOf(a) - ovr) - Math.abs(ovrOf(b) - ovr));
      const v = pool[0];
      free.splice(free.indexOf(v), 1);
      p.act = v.act;
      t.players[t.players.indexOf(v)] = p;
      stats.players++;
    }
  }
  s.pack = { name: pack.name || '가져온 데이터', asOf: pack.asOf || null, teams: stats.teams, players: stats.players };
  return stats;
}
export { marketWage };
