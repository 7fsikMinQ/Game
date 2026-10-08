// 어시스턴트 감독(AI): 베스트 11, 로테이션, 포메이션 추천. AI 구단도 같은 로직을 쓴다.
import { FORMATIONS } from './data.js';
import { effAt, caOf, famOf } from './player.js';
import { lineStrength, power, condFactor } from './strength.js';

const FILL_ORDER = ['GK', 'DC', 'ST', 'DM', 'MC', 'AM', 'DL', 'DR', 'ML', 'MR'];
export const formOf = (id) => FORMATIONS.find((f) => f.id === id) || FORMATIONS[0];

// manual: { 슬롯번호: 선수id } (사용자 지정). 못 뛰는 선수/중복은 어시스턴트가 대신 채운다.
export function pickSquad(team, formId, manual = null) {
  const form = formOf(formId);
  const slots = form.slots;
  const order = slots.map((s, i) => i).sort((a, b) => FILL_ORDER.indexOf(slots[a].r) - FILL_ORDER.indexOf(slots[b].r));
  const used = new Set();
  const chosen = new Array(slots.length);
  const ok = (p) => !p.out && !p.suspend && !used.has(p.id);
  if (manual) {
    for (const i of order) {
      const p = team.players.find((x) => x.id === manual[i]);
      if (p && ok(p) && (slots[i].r === 'GK') === (p.pos === 'GK')) { chosen[i] = p; used.add(p.id); }
    }
  }
  for (const i of order) {
    if (chosen[i]) continue;
    const role = slots[i].r;
    let best = null, bs = -1;
    for (const p of team.players) {
      if (!ok(p)) continue;
      if (role !== 'GK' && p.pos === 'GK') continue;
      if (role === 'GK' && p.pos !== 'GK') continue;
      const sc = effAt(p, role) * (0.93 + 0.07 * (p.cond / 100)); // 지친 선수는 약간 불리 = 자동 로테이션
      if (sc > bs) { bs = sc; best = p; }
    }
    if (!best) { // 부상자까지 동원
      for (const p of team.players) if (!used.has(p.id) && (role === 'GK') === (p.pos === 'GK') && effAt(p, role) > bs) { bs = effAt(p, role); best = p; }
    }
    if (!best) for (const p of team.players) if (!used.has(p.id)) { best = p; break; }
    chosen[i] = best;
    used.add(best.id);
  }
  const bench = [];
  const gk = team.players.filter((p) => p.pos === 'GK' && !used.has(p.id) && !p.out && !p.suspend).sort((a, b) => caOf(b) - caOf(a))[0];
  if (gk) { bench.push(gk); used.add(gk.id); }
  const rest = team.players.filter((p) => !used.has(p.id) && !p.out && !p.suspend && p.pos !== 'GK').sort((a, b) => caOf(b) - caOf(a));
  bench.push(...rest.slice(0, 6));
  return { form, xi: chosen.map((p, i) => ({ p, slot: slots[i] })), bench };
}

export function entriesOf(xi, mor = 70) {
  return xi.map(({ p, slot }) => ({ p, line: slot.l, f: famOf(p, slot.r) * condFactor(0.55 + 0.45 * (p.cond / 100), p.mor ?? mor) }));
}

export const squadPower = (sq) => power(lineStrength(entriesOf(sq.xi)));

// 모든 포메이션을 같은 기준으로 평가해서 순위를 낸다.
export function rankFormations(team) {
  return FORMATIONS.map((f) => {
    const sq = pickSquad(team, f.id);
    const s = lineStrength(entriesOf(sq.xi));
    return { id: f.id, name: f.name, power: power(s), s };
  }).sort((a, b) => b.power - a.power);
}
export const bestFormation = (team) => rankFormations(team)[0].id;
