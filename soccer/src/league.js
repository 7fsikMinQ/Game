// 리그 구조: 3개 리그(잉글랜드/독일/한국) × 1·2부. 규칙 수치는 2026년 10월 기준 공개 자료를 따르되,
// 확인하지 못한 항목은 `assumed: true` 로 표시한다(docs/soccer/RESEARCH.md 참고). 구단·선수는 전부 가상.
import { SURNAMES } from './data.js';

export const LEAGUES = {
  epl: {
    id: 'epl', name: '잉글랜드', top: '프리미어 리그', cur: '파운드 환산 없음(가상 화폐)',
    divs: [
      { name: '프리미어 리그', rev: 2028000, n: 20, cycles: 2, rep: [38, 92], caBase: 108, caSlope: 0.7 },
      { name: '챔피언십', rev: 356000, n: 24, cycles: 2, rep: [20, 50], caBase: 88, caSlope: 0.5 },
    ],
    rules: {
      goalMul: 0.69, relegate: 3, promoteAuto: 2, playoff: 'six', // 챔피언십 3~8위 6팀 플레이오프(2026/27부터)
      loanInMax: 2, loanOutMax: 4, loanInVerified: true, // 임대 영입은 동시에 2명까지(공식)
      scr: { green: 0.85, red: 1.15, enforce: true }, // 2026/27 선수단 비용 비율 규정
      continental: 5,
      window: { summerUntil: 5, winterFrom: 19, winterLen: 5 },
    },
    namePool: 'en',
  },
  bl: {
    id: 'bl', name: '독일', top: '분데스리가', cur: '',
    divs: [
      { name: '분데스리가', rev: 1155000, n: 18, cycles: 2, rep: [36, 88], caBase: 100, caSlope: 0.65 },
      { name: '2. 분데스리가', rev: 259000, n: 18, cycles: 2, rep: [20, 48], caBase: 82, caSlope: 0.5 },
    ],
    rules: {
      goalMul: 0.77, relegate: 2, promoteAuto: 2, playoff: 'bl', // 16위 vs 2부 3위 2경기
      loanInMax: 3, loanOutMax: 6, loanInVerified: false,
      scr: { green: 0.7, red: 1.0, enforce: false }, // 2026-27 단계 도입, 2028-29 전면 시행(게임에서는 경고만)
      continental: 6,
      window: { summerUntil: 5, winterFrom: 15, winterLen: 5 },
    },
    namePool: 'de',
  },
  kl: {
    id: 'kl', name: '한국', top: 'K리그1', cur: '',
    divs: [
      { name: 'K리그1', rev: 495000, n: 12, cycles: 3, split: true, rep: [34, 80], caBase: 88, caSlope: 0.6 },
      { name: 'K리그2', rev: 136000, n: 17, cycles: 2, rep: [20, 44], caBase: 72, caSlope: 0.45 },
    ],
    rules: {
      goalMul: 0.65, relegate: 1, promoteAuto: 1, playoff: 'kl', // 1부 11위 vs 2부 2위 2경기 (2026은 김천 상무 특례, 문서 참고)
      loanInMax: 3, loanOutMax: 6, loanInVerified: false, assumed: true,
      scr: { green: 1, red: 1, enforce: false },
      continental: 3,
      window: { summerUntil: 6, winterFrom: 17, winterLen: 5 }, // 정기/추가 등록 기간 날짜는 가정
    },
    namePool: 'kr',
  },
};
export const COUNTRIES = ['epl', 'bl', 'kl'];

// ───────── 구단 이름(가상) ─────────
const POOLS = {
  en: { a: ['레드', '블루', '그린', '실버', '골든', '노스', '사우스', '이스트', '웨스트', '올드', '스톤', '아이언', '오크', '파인', '밀', '하이', '로우', '캐슬', '레이크', '마운트'], b: ['브리지', '필드', '포드', '베일', '우드', '클리프', '하버', '톤', '햄', '브룩', '웰', '게이트', '모어', '샤이어'], s: ['시티', '유나이티드', '타운', 'FC', '로버스', '애슬레틱', '레인저스'] },
  de: { p: ['FC', 'SV', 'SC', 'VfB', 'TSV', '1.FC'], a: ['노이', '알트', '그로스', '클라인', '로텐', '그륀', '슈바르츠', '바이스', '린덴', '아이헨', '팔켄', '아들러', '뢰벤', '자이펜'], b: ['베르크', '부르크', '하임', '펠트', '도르프', '슈타트', '탈', '바흐', '슈타인', '발트'] },
  kr: { a: ['도원', '청해', '북성', '달내', '백마', '해원', '서진', '금강', '한울', '새벽', '푸른', '은빛', '가람', '다솜', '늘봄', '마루', '나래', '아라', '여울', '누리', '하랑', '보라', '솔빛', '라온', '온새미', '해솔', '바람', '구름', '두메', '이든'], s: ['FC', '시티', '유나이티드', '스포츠클럽'] },
};
const COLORS = ['#1f5a3a', '#2a6f97', '#7a4a2b', '#5b6470', '#b08a2e', '#3d8a8a', '#8a2f3a', '#b4512c', '#4b5d8a', '#6b6f2a', '#2c7a5b', '#7d7d7d', '#6a3d7a', '#a05a2c', '#2d6a6a'];

export function clubNames(pool, count, rng) {
  const P = POOLS[pool];
  const out = new Set();
  let guard = 0;
  while (out.size < count && guard++ < 2000) {
    let n;
    if (pool === 'en') n = `${rng.pick(P.a)}${rng.pick(P.b)} ${rng.pick(P.s)}`;
    else if (pool === 'de') n = `${rng.pick(P.p)} ${rng.pick(P.a)}${rng.pick(P.b)}`;
    else n = `${rng.pick(P.a)} ${rng.pick(P.s)}`;
    out.add(n);
  }
  return [...out];
}
export const colorFor = (i) => COLORS[i % COLORS.length];

// ───────── 일정 ─────────
// 서클 방식 라운드 로빈. 홀수 팀이면 매 라운드 한 팀이 쉰다(bye). cycles번 반복하고 사이클마다 홈/원정이 바뀐다.
export function makeRounds(ids, cycles = 2) {
  const arr = ids.slice();
  if (arr.length % 2) arr.push(null);
  const n = arr.length;
  const base = [];
  for (let r = 0; r < n - 1; r++) {
    const round = [];
    for (let i = 0; i < n / 2; i++) { const x = arr[i], y = arr[n - 1 - i]; if (x != null && y != null) round.push([x, y]); }
    base.push(round);
    arr.splice(1, 0, arr.pop());
  }
  const out = [];
  for (let c = 0; c < cycles; c++) {
    base.forEach((round, ri) => out.push(round.map(([x, y]) => {
      const flip = ((x < y ? 0 : 1) ^ (c % 2) ^ (ri % 2)) === 1;
      return flip ? { h: y, a: x } : { h: x, a: y };
    })));
  }
  return out;
}

// K리그1 파이널 라운드: 33라운드 순위로 상위 6팀(A)/하위 6팀(B)을 나눠 각 그룹 1회 풀리그(5라운드)
export function splitRounds(groupA, groupB) {
  const a = makeRounds(groupA, 1), b = makeRounds(groupB, 1);
  return a.map((r, i) => [...r, ...(b[i] || [])]);
}

// ───────── 이적시장 기간 ─────────
// 라운드 인덱스와 단계로 "열림/닫힘"을 판단한다. 오프시즌은 항상 열림.
export function windowState(rules, phase, roundIdx, totalRounds) {
  const w = rules.window;
  if (phase === 'offseason') return { open: true, label: '여름 이적시장', left: null };
  if (roundIdx < w.summerUntil) return { open: true, label: '여름 이적시장', left: w.summerUntil - roundIdx };
  if (roundIdx >= w.winterFrom && roundIdx < w.winterFrom + w.winterLen) return { open: true, label: '겨울 이적시장', left: w.winterFrom + w.winterLen - roundIdx };
  const next = roundIdx < w.winterFrom ? w.winterFrom - roundIdx : null;
  return { open: false, label: next ? '겨울 이적시장까지' : '다음 여름 이적시장까지', left: next ?? totalRounds - roundIdx };
}
export { SURNAMES };
