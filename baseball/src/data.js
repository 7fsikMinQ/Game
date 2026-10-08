// 구단명은 실제 공개 정보(2026 시즌 기준 소속 리그/지구). 선수는 가상 선수 + 근사한 실제 선수(이름 변형, roster-data.js).
// 정확한 실제 데이터는 사용자가 직접 데이터 팩으로 가져온다(docs/baseball/REAL-DATA.md).
export const POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const PITCH_POS = ['SP', 'RP'];
export const POS_LABEL = { C: '포수', '1B': '1루수', '2B': '2루수', '3B': '3루수', SS: '유격수', LF: '좌익수', CF: '중견수', RF: '우익수', DH: '지명타자', SP: '선발', RP: '구원' };
// 수비 비중: 이 포지션의 종합 능력에서 수비가 차지하는 비율
export const FLD_W = { C: 0.22, SS: 0.22, CF: 0.2, '2B': 0.18, '3B': 0.16, RF: 0.14, LF: 0.1, '1B': 0.07, DH: 0 };
export const HIT_STATS = ['con', 'pow', 'eye', 'spd', 'fld'];
export const PIT_STATS = ['stf', 'ctl', 'sta'];
export const STAT_LABEL = { con: '컨택', pow: '파워', eye: '선구', spd: '주력', fld: '수비', stf: '구위', ctl: '제구', sta: '체력' };

// str: 2025 성적 등을 참고한 시작 전력 보정(-1 약 ~ +1 강, 대략적 근사치). mkt: 시장 규모(수입 배수).
const T = (name, short, color, div, mkt, str) => ({ name, short, color, div, mkt, str });
export const LEAGUES = {
  mlb: {
    id: 'mlb', name: 'MLB', long: '메이저리그 베이스볼', games: 162, active: 26, farmMax: 14, nH: 13, nSP: 5, minSal: 0.78,
    wage: { base: 4.0, k: 0.0863, max: 62 }, rev0: 300, budgetShare: 0.55, faAt: 6, arbAt: 3, tradeDeadline: 0.67,
    cbt: 244, cbtBands: [[20, [0.2, 0.3, 0.5]], [20, [0.32, 0.42, 0.62]], [20, [0.625, 0.75, 0.95]], [Infinity, [0.8, 0.9, 1.1]]], startCash: 0.1, draftRounds: 5, draftN: 150, foreign: false,
    divs: ['AL 동부', 'AL 중부', 'AL 서부', 'NL 동부', 'NL 중부', 'NL 서부'], leagues: ['AL', 'NL'],
    teams: [
      T('뉴욕 양키스', 'NYY', '#1c2d5a', 0, 2.2, 0.55), T('보스턴 레드삭스', 'BOS', '#a02a2a', 0, 1.8, 0.35), T('토론토 블루제이스', 'TOR', '#2a5da8', 0, 2.0, 0.6),
      T('볼티모어 오리올스', 'BAL', '#d9531e', 0, 1.05, -0.1), T('탬파베이 레이스', 'TB', '#2a4f7a', 0, 0.85, 0.0),
      T('디트로이트 타이거스', 'DET', '#1e2d4a', 1, 1.35, 0.35), T('클리블랜드 가디언스', 'CLE', '#a8302a', 1, 0.6, 0.3), T('캔자스시티 로열스', 'KC', '#3a6ab0', 1, 0.85, 0.1),
      T('미네소타 트윈스', 'MIN', '#1f3a63', 1, 0.9, -0.3), T('시카고 화이트삭스', 'CWS', '#44474d', 1, 0.85, -0.9),
      T('휴스턴 애스트로스', 'HOU', '#d46a1c', 2, 1.5, 0.3), T('시애틀 매리너스', 'SEA', '#1d6a73', 2, 1.2, 0.45), T('텍사스 레인저스', 'TEX', '#2a4ba0', 2, 1.35, 0.05),
      T('LA 에인절스', 'LAA', '#b8302d', 2, 1.15, -0.35), T('애슬레틱스', 'ATH', '#2f6b46', 2, 0.8, -0.05),
      T('필라델피아 필리스', 'PHI', '#b02a30', 3, 2.0, 0.6), T('뉴욕 메츠', 'NYM', '#2a5aa0', 3, 2.5, 0.1), T('애틀랜타 브레이브스', 'ATL', '#9a2a40', 3, 1.7, -0.1),
      T('마이애미 말린스', 'MIA', '#2a8aa8', 3, 0.8, -0.15), T('워싱턴 내셔널스', 'WSH', '#b02a38', 3, 0.95, -0.6),
      T('밀워키 브루어스', 'MIL', '#243f73', 4, 0.95, 0.7), T('시카고 컵스', 'CHC', '#1d4da8', 4, 1.55, 0.55), T('신시내티 레즈', 'CIN', '#c0281f', 4, 0.85, 0.1),
      T('세인트루이스 카디널스', 'STL', '#a82a2a', 4, 1.2, -0.15), T('피츠버그 파이리츠', 'PIT', '#b8921c', 4, 0.8, -0.5),
      T('LA 다저스', 'LAD', '#1f5aa8', 5, 2.7, 0.8), T('샌디에이고 파드리스', 'SD', '#6b4a2b', 5, 1.75, 0.4), T('샌프란시스코 자이언츠', 'SF', '#d4601c', 5, 1.4, 0.0),
      T('애리조나 다이아몬드백스', 'ARI', '#a02a40', 5, 1.15, 0.05), T('콜로라도 로키스', 'COL', '#4a2a63', 5, 0.85, -1.2),
    ],
  },
  kbo: {
    id: 'kbo', name: 'KBO', long: 'KBO', games: 144, active: 29, farmMax: 21, nH: 14, nSP: 5, minSal: 0.3,
    wage: { base: 2.8, k: 0.085, max: 40 }, rev0: 700, budgetShare: 0.22, faAt: 8, arbAt: 3, tradeDeadline: 0.7,
    cap: 143.97, capFloor: 60.65, capRates: [0.3, 0.5, 1.0], startCash: 0.08, draftRounds: 11, draftN: 110, foreign: true,
    divs: ['KBO'], leagues: ['KBO'],
    teams: [
      T('LG 트윈스', 'LG', '#c8102e', 0, 1.22, 0.7), T('한화 이글스', '한화', '#e56f1c', 0, 1.19, 0.55), T('SSG 랜더스', 'SSG', '#c0282d', 0, 1.25, 0.2),
      T('삼성 라이온즈', '삼성', '#1b5aa8', 0, 1.26, 0.15), T('NC 다이노스', 'NC', '#2a5a8a', 0, 0.955, 0.0), T('kt wiz', 'kt', '#33363c', 0, 1.08, -0.1),
      T('롯데 자이언츠', '롯데', '#14284b', 0, 1.21, -0.2), T('KIA 타이거즈', 'KIA', '#c0282d', 0, 1.21, -0.1), T('두산 베어스', '두산', '#13224a', 0, 1.1, -0.4),
      T('키움 히어로즈', '키움', '#6b1d3a', 0, 0.66, -1.0),
    ],
  },
};
export const COUNTRIES = ['mlb', 'kbo'];

// ───────── 가상 선수 이름 ─────────
export const KR_SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손', '배', '백', '허', '유', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민'];
export const KR_A = ['민', '서', '준', '지', '현', '도', '우', '시', '하', '예', '건', '태', '승', '재', '성', '동', '영', '진', '정', '수'];
export const KR_B = ['우', '준', '호', '민', '현', '윤', '진', '혁', '훈', '영', '성', '빈', '찬', '원', '환', '석', '규', '태', '용', '범'];
export const EN_FIRST = ['Jake', 'Luis', 'Carlos', 'Mason', 'Tyler', 'Diego', 'Ethan', 'Marcus', 'Noah', 'Owen', 'Caleb', 'Jorge', 'Hunter', 'Elias', 'Wyatt', 'Andre', 'Miguel', 'Brandon', 'Cole', 'Rafael', 'Julian', 'Trey', 'Gavin', 'Dominic', 'Felix', 'Ian', 'Kyle', 'Leo', 'Max', 'Nate', 'Omar', 'Pablo', 'Quinn', 'Ryan', 'Sam', 'Tomas', 'Victor', 'Will', 'Xavier', 'Zack'];
export const EN_LAST = ['Carter', 'Reyes', 'Brooks', 'Morales', 'Hayes', 'Ortiz', 'Bennett', 'Vega', 'Foster', 'Castillo', 'Sullivan', 'Rivera', 'Pierce', 'Navarro', 'Holland', 'Mendez', 'Barrett', 'Cruz', 'Gallagher', 'Santos', 'Whitaker', 'Duarte', 'Lawson', 'Herrera', 'Maddox', 'Salazar', 'Hendricks', 'Ramos', 'Keller', 'Soto', 'Dawson', 'Alvarez', 'Griffin', 'Torres', 'Webb', 'Medina', 'Larkin', 'Padilla', 'Stone', 'Quintero'];
export const JP_NAMES = ['다카하시', '사토', '나카무라', '야마다', '이토', '와타나베', '고바야시', '가토'];
