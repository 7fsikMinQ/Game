// 이적 협상: 시즌 활약·컨디션·계약 기간에 따라 몸값이 변하고, 구단마다 흥정 여지가 다르다.
// 난수를 쓰지 않는다(구단 번호로 성향을 정함). 같은 상태에서는 항상 같은 답을 한다.
import { valueOf, caOf } from './player.js';
import { clamp } from './util.js';

const r100 = (x) => Math.round(x / 100) * 100;
const hash = (a, b) => (Math.imul(a + 1, 2654435761) ^ Math.imul(b + 7, 40503)) >>> 0;
const h01 = (a, b) => (hash(a, b) % 1000) / 1000;

export const PATIENCE = 3;       // 무리한 제안을 이만큼 하면 협상이 결렬된다
export const BREAK_ROUNDS = 3;   // 결렬되면 이 라운드 동안 협상 불가
export const stanceOf = (t) => 0.95 + 0.15 * h01(t.id, 1);  // 구단 호가 성향 0.95~1.10
export const flexOf = (t) => 0.06 + 0.10 * h01(t.id, 2);    // 깎아 줄 수 있는 폭 6~16%

// 몸값에 반영되는 요인 (곱셈). 화면에도 그대로 보여 준다.
export function factorsOf(p) {
  const f = [];
  const x = p.s;
  if (x && x.app >= 4) {
    const r = x.rt / x.app;
    const m = clamp(1 + (r - 6.3) * 0.15, 0.85, 1.25);
    if (Math.abs(m - 1) >= 0.02) f.push({ k: 'form', label: m > 1 ? `시즌 활약 좋음 (평점 ${r.toFixed(1)})` : `시즌 활약 부진 (평점 ${r.toFixed(1)})`, mul: m });
  }
  if (p.out > 0) f.push({ k: 'inj', label: `부상 ${p.out}라운드`, mul: 1 - Math.min(0.3, 0.04 * p.out) });
  else if (p.cond < 70) f.push({ k: 'cond', label: '컨디션 저하', mul: 0.97 });
  if (!p.loan && p.ctr <= 1) f.push({ k: 'ctr', label: '계약 1년 이하', mul: 0.8 });
  else if (!p.loan && p.ctr === 2) f.push({ k: 'ctr', label: '계약 2년', mul: 0.93 });
  return f;
}
export const factorMul = (p) => factorsOf(p).reduce((a, f) => a * f.mul, 1);

// 구단 사정: 팀 최고 선수는 잘 안 판다
const isStar = (t, p) => t.players.every((x) => x === p || caOf(x) <= caOf(p));

// 영입 호가와 최저선(이 금액 이상이면 판다)
export function quoteBuy(t, p) {
  const star = isStar(t, p);
  const ask = r100(valueOf(p) * 1.2 * factorMul(p) * stanceOf(t) * (star ? 1.1 : 1));
  const flex = flexOf(t) * (star ? 0.5 : 1);
  return { ask, reserve: r100(ask * (1 - flex)), star };
}

const fresh = () => ({ pat: PATIENCE, until: 0, counter: 0, at: 0 });
export function negOf(s, pid) {
  s.neg = s.neg || {};
  const n = s.neg[pid] || (s.neg[pid] = fresh());
  if (n.until && (s.tick || 0) >= n.until) Object.assign(n, fresh());
  return n;
}
const fail = (s, n) => {
  n.pat--;
  if (n.pat <= 0) { n.until = (s.tick || 0) + BREAK_ROUNDS; return true; }
  return false;
};

// 영입 입찰: accepted / counter / rejected / broken
export function judgeBid(s, q, pid, bid) {
  const n = negOf(s, pid);
  if (n.until && (s.tick || 0) < n.until) return { status: 'broken', left: n.until - (s.tick || 0) };
  if (bid >= q.reserve) return { status: 'accepted', price: bid };
  if (bid >= q.reserve * 0.85) {
    const counter = Math.min(q.ask, r100(Math.max(q.reserve, (bid + q.ask) / 2)));
    n.counter = counter; n.at = s.tick || 0;
    return fail(s, n) ? { status: 'broken', left: BREAK_ROUNDS } : { status: 'counter', counter };
  }
  return fail(s, n) ? { status: 'broken', left: BREAK_ROUNDS } : { status: 'rejected' };
}

// 매각: 사려는 구단(라운드마다 달라짐)이 낼 수 있는 상한
export function buyerFor(s, p, tradeVal) {
  const ai = s.teams.filter((t) => t.id !== s.userId);
  let best = null;
  for (let i = 0; i < 4; i++) {
    const t = ai[hash(p.id + (s.tick || 0) * 31, i) % ai.length];
    const ceiling = r100(tradeVal * factorMul(p) * (0.95 + 0.1 * h01(t.id, 3)));
    if (!best || ceiling > best.ceiling) best = { t, ceiling };
  }
  return best;
}
export function judgeAsk(s, buyer, pid, ask) {
  const n = negOf(s, pid);
  if (n.until && (s.tick || 0) < n.until) return { status: 'broken', left: n.until - (s.tick || 0) };
  if (ask <= buyer.ceiling) return { status: 'accepted', price: ask };
  if (ask <= buyer.ceiling * 1.25) {
    const counter = r100(buyer.ceiling * 0.96);
    n.counter = counter; n.at = s.tick || 0;
    return fail(s, n) ? { status: 'broken', left: BREAK_ROUNDS } : { status: 'counter', counter };
  }
  return fail(s, n) ? { status: 'broken', left: BREAK_ROUNDS } : { status: 'rejected' };
}
export const resetNeg = (s, pid) => { if (s.neg) delete s.neg[pid]; };
