// 데이터 팩: 사용자가 직접 가져오는 구단/선수 데이터(CSV 또는 JSON). 앱에는 실제 선수·구단 데이터가 들어 있지 않다.
// 이유와 구하는 방법은 docs/soccer/REAL-DATA.md. 가져온 데이터는 이 기기 안에만 저장된다.
import { LEAGUES, colorFor } from './league.js';
import { genPlayer, wageOf } from './player.js';
import { SQUAD_PLAN, SQUAD_MAX } from './data.js';
import { caOf } from './player.js';
import { clamp } from './util.js';

export const PACK_FORMAT = 'soccer-pack';
export const MAX_PACK_BYTES = 6 * 1024 * 1024;

const COUNTRY_ALIAS = { epl: 'epl', en: 'epl', eng: 'epl', england: 'epl', 잉글랜드: 'epl', bl: 'bl', de: 'bl', ger: 'bl', germany: 'bl', 독일: 'bl', kl: 'kl', kr: 'kl', kor: 'kl', korea: 'kl', 한국: 'kl' };
export const POS_MAP = {
  GK: 'GK', G: 'GK', 골키퍼: 'GK',
  DC: 'DC', CB: 'DC', DF: 'DC', D: 'DC', 센터백: 'DC', 수비수: 'DC',
  DL: 'DL', LB: 'DL', LWB: 'DL', WBL: 'DL', 좌측풀백: 'DL', DR: 'DR', RB: 'DR', RWB: 'DR', WBR: 'DR', 우측풀백: 'DR',
  DM: 'DM', CDM: 'DM', 수비형미드: 'DM',
  MC: 'MC', CM: 'MC', MF: 'MC', M: 'MC', 미드필더: 'MC',
  ML: 'ML', LM: 'ML', LW: 'ML', LF: 'ML', LWF: 'ML', 좌윙: 'ML', MR: 'MR', RM: 'MR', RW: 'MR', RF: 'MR', RWF: 'MR', 우윙: 'MR',
  AM: 'AM', CAM: 'AM', AMC: 'AM', 공격형미드: 'AM',
  ST: 'ST', FW: 'ST', CF: 'ST', SS: 'ST', F: 'ST', 스트라이커: 'ST', 공격수: 'ST',
};

// ───────── 변환 규칙(공식 환산표는 없다. 근사치이며 docs에 근거를 적었다) ─────────
export const caFromOvr = (ovr) => clamp(Math.round(2.9 * (ovr - 45) + 50), 20, 195); // 게임 OVR(1~99) -> CA
export const caFromValue = (valueM) => clamp(Math.round(62 + 20 * Math.log(valueM + 1)), 25, 195); // 시장가치(백만 단위) -> CA
const expValueM = (ca) => Math.max(0, Math.exp((ca - 62) / 20) - 1);
// 어린 선수의 시장가치가 현재 능력으로 설명되는 값보다 높을수록 "잠재력 프리미엄(이슈)"이 큰 것
export function hypeFromValue(age, valueM, ca) {
  if (age > 23 || !(valueM > 0)) return undefined;
  const ratio = (valueM + 0.5) / (expValueM(ca) + 0.5);
  return ratio > 8 ? 4 : ratio > 4 ? 3 : ratio > 2.5 ? 2 : ratio > 1.5 ? 1 : 0;
}
export function ageFromBirth(birth, asOf = '2026-10-08') {
  const b = new Date(birth), a = new Date(asOf);
  if (isNaN(b) || isNaN(a)) return NaN;
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  const m = a.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && a.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

// ───────── CSV ─────────
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
  const divs = [new Map(), new Map()];
  for (const r of rows) {
    const c = COUNTRY_ALIAS[String(r.country || '').trim().toLowerCase()] || COUNTRY_ALIAS[String(r.country || '').trim()];
    if (c) country = country || c;
    const di = Number(r.division || r.div || 1) === 2 ? 1 : 0;
    const club = r.club || r['구단'];
    if (!club) continue;
    if (!divs[di].has(club)) divs[di].set(club, { name: club, rank: num(r.rank), rep: num(r.rep), players: [] });
    const cl = divs[di].get(club);
    if (r.rank !== undefined && r.rank !== '') cl.rank = num(r.rank);
    if (r.rep !== undefined && r.rep !== '') cl.rep = num(r.rep);
    if (r.name || r['선수']) {
      cl.players.push({ name: r.name || r['선수'], pos: r.pos || r['포지션'], birth: r.birth || r['생년월일'] || undefined, age: num(r.age || r['나이']), ovr: num(r.ovr), ca: num(r.ca), value: num(r.value || r.value_m), hype: num(r.hype), pa: num(r.pa), contract_end: num(r.contract_end) });
    }
  }
  return { format: PACK_FORMAT, version: 1, name, asOf, country, divisions: divs.map((m) => [...m.values()]) };
}

export const CSV_TEMPLATE = `country,division,club,rank,name,pos,birth,ovr,value,hype
epl,1,샘플 FC,1,김샘플,ST,2001-04-12,82,45,0
epl,1,샘플 FC,1,이예시,GK,1994-09-30,78,12,0
epl,1,샘플 FC,1,박신예,AM,2008-02-20,66,18,3
epl,1,샘플 FC,1,,,,,,
epl,1,다른 FC,2,최테스트,DC,1998-11-03,76,22,0
`;

// ───────── 검증 ─────────
export function validatePack(pack) {
  const errors = [], warnings = [];
  if (!pack || typeof pack !== 'object') return { ok: false, errors: ['데이터를 읽을 수 없습니다'], warnings, stats: { clubs: 0, players: 0 } };
  if (pack.format !== PACK_FORMAT) errors.push(`format 이 "${PACK_FORMAT}" 이어야 합니다`);
  const L = LEAGUES[pack.country];
  if (!L) errors.push('country 는 epl / bl / kl 중 하나여야 합니다');
  if (!Array.isArray(pack.divisions) || !pack.divisions.length) errors.push('divisions 가 비어 있습니다');
  let clubs = 0, players = 0;
  if (!errors.length) {
    pack.divisions.slice(0, 2).forEach((d, di) => {
      if (!Array.isArray(d)) { errors.push(`${di + 1}부 목록이 배열이 아닙니다`); return; }
      if (d.length > L.divs[di].n) errors.push(`${L.divs[di].name}는 ${L.divs[di].n}팀까지입니다 (${d.length}팀 입력됨)`);
      else if (d.length < L.divs[di].n) warnings.push(`${L.divs[di].name}: ${d.length}/${L.divs[di].n}팀 — 나머지는 가상 구단으로 채웁니다`);
      const names = new Set();
      for (const c of d) {
        clubs++;
        if (!c || typeof c.name !== 'string' || !c.name.trim()) { errors.push('이름이 없는 구단이 있습니다'); continue; }
        if (c.name.length > 24) errors.push(`구단 이름이 너무 깁니다: ${c.name.slice(0, 12)}…`);
        if (names.has(c.name)) errors.push(`구단 이름이 겹칩니다: ${c.name}`);
        names.add(c.name);
        const ps = Array.isArray(c.players) ? c.players : [];
        if (ps.length && ps.length < 22) warnings.push(`${c.name}: 선수 ${ps.length}명 — 부족한 자리는 가상 선수로 보충합니다`);
        if (ps.length > 60) errors.push(`${c.name}: 선수가 너무 많습니다(${ps.length})`);
        for (const p of ps) {
          players++;
          if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 24) { errors.push(`${c.name}: 이름이 잘못된 선수가 있습니다`); continue; }
          const age = p.birth ? ageFromBirth(p.birth, pack.asOf) : p.age;
          if (!(age >= 15 && age <= 45)) warnings.push(`${p.name}: 나이를 알 수 없어 25세로 둡니다`);
          if (!POS_MAP[String(p.pos || '').trim().toUpperCase()] && !POS_MAP[String(p.pos || '').trim()]) warnings.push(`${p.name}: 포지션 "${p.pos ?? ''}"을(를) 몰라 MC로 둡니다`);
          for (const k of ['ovr', 'ca', 'pa']) if (p[k] !== undefined && !(p[k] >= 1 && p[k] <= (k === 'ovr' ? 99 : 200))) errors.push(`${p.name}: ${k} 값이 범위를 벗어났습니다`);
          if (p.hype !== undefined && ![0, 1, 2, 3, 4].includes(p.hype)) errors.push(`${p.name}: hype 는 0~4 여야 합니다`);
        }
      }
    });
  }
  if (players > 4000) errors.push('선수가 너무 많습니다(최대 4000명)');
  return { ok: errors.length === 0, errors: errors.slice(0, 12), warnings: warnings.slice(0, 12), stats: { clubs, players, moreErrors: Math.max(0, errors.length - 12) } };
}

export function parsePackText(text) {
  const t = String(text);
  if (t.length > MAX_PACK_BYTES) return { ok: false, errors: ['파일이 너무 큽니다(6MB 초과)'], warnings: [], stats: { clubs: 0, players: 0 } };
  const s = t.trim();
  let pack;
  try { pack = s.startsWith('{') ? JSON.parse(s) : csvToPack(s); }
  catch { return { ok: false, errors: ['JSON/CSV 형식이 올바르지 않습니다'], warnings: [], stats: { clubs: 0, players: 0 } }; }
  const v = validatePack(pack);
  return { ...v, pack: v.ok ? pack : null };
}

// ───────── 적용 ─────────
const hash = (str) => { let h = 0; for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0; return Math.abs(h); };

function convertPlayer(ctx, team, cp, asOf, meanCA, rng) {
  const pos = POS_MAP[String(cp.pos || '').trim().toUpperCase()] || POS_MAP[String(cp.pos || '').trim()] || 'MC';
  let age = cp.birth ? ageFromBirth(cp.birth, asOf) : cp.age;
  if (!(age >= 15 && age <= 45)) age = 25;
  let ca = cp.ca ?? (cp.ovr !== undefined ? caFromOvr(cp.ovr) : cp.value !== undefined ? caFromValue(cp.value) : undefined);
  const known = ca !== undefined;
  if (!known) ca = clamp(Math.round(meanCA + rng.normal(0, 11)), 30, 170);
  const hype = cp.pa !== undefined ? undefined : cp.hype ?? (known && cp.value !== undefined ? hypeFromValue(age, cp.value, ca) : undefined);
  const p = genPlayer(ctx, { pos, ca, age, pa: cp.pa, hype, name: String(cp.name).trim().slice(0, 24) });
  if (cp.pa !== undefined && cp.hype !== undefined && cp.hype > 0) p.hype = cp.hype;
  p.w = wageOf(p);
  if (cp.contract_end) p.ctr = clamp(Math.round(cp.contract_end) - 2026, 1, 5);
  return p;
}

// s 는 newGame(seed, now, pack.country) 직후의 월드. 구단 이름·평판·선수를 팩 내용으로 바꾼다.
export function applyPack(s, pack, rng, ctx) {
  const L = LEAGUES[s.country];
  const stats = { clubs: 0, players: 0 };
  pack.divisions.slice(0, 2).forEach((clubs, di) => {
    const dc = L.divs[di];
    const teams = s.divs[di].ids.map((i) => s.teams[i]).sort((a, b) => b.rep - a.rep); // 평판 순(강팀 먼저)
    // 팩의 구단을 순위 순으로 정렬: rank 가 있으면 그 순서, 없으면 입력 순서(뒤로)
    const mid = (clubs.length + 1) / 2; // 순위를 모르는 구단은 중간으로 본다(입력 순서는 유지)
    const idx = clubs.map((c, i) => ({ c, i, r: c.rank ?? mid + i * 0.001 })).sort((a, b) => a.r - b.r).map((x) => x.c);
    idx.forEach((c, k) => {
      const t = teams[k];
      if (!t) return;
      stats.clubs++;
      t.name = String(c.name).trim().slice(0, 24);
      t.color = colorFor(hash(t.name));
      const ps = (c.players || []).filter((p) => p && p.name);
      if (c.rep !== undefined) t.rep = clamp(c.rep, dc.rep[0] - 6, dc.rep[1] + 6);
      if (ps.length >= 1) {
        const mean = dc.caBase + (t.rep - dc.rep[0]) * dc.caSlope;
        const list = ps.slice(0, 60).map((cp) => convertPlayer(ctx, t, cp, pack.asOf || '2026-10-08', mean, rng));
        // 부족한 자리는 가상 선수로 보충: 포지션 구성(SQUAD_PLAN) 기준, 골키퍼는 최소 2명
        const have = {};
        for (const q of list) have[q.pos] = (have[q.pos] || 0) + 1;
        const fill = (pos) => list.push(genPlayer(ctx, { pos, ca: clamp(Math.round(mean - 18 + rng.normal(0, 6)), 30, 140), age: rng.int(19, 30) }));
        while ((have.GK || 0) < 2) { fill('GK'); have.GK = (have.GK || 0) + 1; }
        for (const pos of SQUAD_PLAN) { if (list.length >= 22) break; if (have[pos] > 0) { have[pos]--; continue; } fill(pos); }
        list.sort((a, b) => caOf(b) - caOf(a));
        t.players = list.slice(0, SQUAD_MAX);
        stats.players += ps.length;
        if (c.rep === undefined && ps.length >= 14) { // 실제 선수를 충분히 넣었을 때만 평균 능력에서 평판을 역산 → 수입/연봉 균형 유지(부분 입력은 순위 기반 평판 유지)
          const avgCA = t.players.reduce((a, p) => a + caOf(p), 0) / t.players.length;
          t.rep = clamp(Math.round((dc.rep[0] + (avgCA - dc.caBase) / dc.caSlope) * 10) / 10, dc.rep[0] - 6, dc.rep[1] + 6);
        }
      }
    });
  });
  s.pack = { name: pack.name || '가져온 데이터', asOf: pack.asOf || null, clubs: stats.clubs, players: stats.players };
  return stats;
}
