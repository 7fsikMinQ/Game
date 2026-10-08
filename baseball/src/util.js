export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const avg = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0);

// 자금 단위는 "만". 10,000만 = 1억.
export function fmtMoney(m) {
  const sign = m < 0 ? '-' : '';
  const v = Math.abs(Math.round(m));
  if (v >= 10000) {
    const eok = v / 10000;
    return sign + (eok >= 100 ? Math.round(eok) : eok.toFixed(2).replace(/\.?0+$/, '')) + '억';
  }
  return sign + v.toLocaleString('ko-KR') + '만';
}

export const fmtAvg = (h, ab) => (ab ? (h / ab).toFixed(3).replace(/^0/, '') : '.000');
export const fmtPct = (w, l) => (w + l ? (w / (w + l)).toFixed(3).replace(/^0/, '') : '.000');
export const fmtIP = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;
export const fmtEra = (er, outs) => (outs ? ((er * 27) / outs).toFixed(2) : '-.--');
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
