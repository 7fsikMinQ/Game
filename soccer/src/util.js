export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const avg = (arr) => (arr.length ? arr.reduce((x, y) => x + y, 0) / arr.length : 0);

// 자금 단위는 "만원". 10,000만 = 1억.
export function fmtMoney(m) {
  const sign = m < 0 ? '-' : '';
  const v = Math.abs(Math.round(m));
  if (v >= 10000) {
    const eok = v / 10000;
    return sign + (eok >= 100 ? Math.round(eok).toLocaleString('ko-KR') : eok.toFixed(1).replace(/\.0$/, '')) + '억';
  }
  return sign + v.toLocaleString('ko-KR') + '만';
}
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
};
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// id 기반의 고정된 -1..1 값. 스카우팅 오차가 새로고침마다 흔들리지 않게 한다.
export const fuzz = (id, salt = 0) => (((Math.imul(id + salt * 7919, 2654435761) >>> 0) % 2001) / 1000) - 1;
export const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

// 선수 사진 대신 쓰는 간단한 이니셜 아바타(이름의 첫 글자, id로 색 고정)
export const initials = (name) => { const n = String(name).trim(); if (!n) return '?'; return /[가-힣]/.test(n[0]) ? n[0] : n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase(); };
export const avatar = (p) => `<span class="av a${Math.abs(p.id) % 6}" aria-hidden="true">${esc(initials(p.name))}</span>`;
