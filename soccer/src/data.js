// 능력치 체계는 Football Manager 계열의 관례를 따른다: 개별 능력치 1~20, 현재능력(CA)·잠재능력(PA) 1~200.
// 능력치 이름/수치는 직접 만든 것이며 어떤 상용 게임의 데이터도 복사하지 않았다. 선수·구단은 전부 가상.
export const ATTRS = {
  tec: ['pas', 'dri', 'fst', 'crs', 'fin', 'lng', 'tck', 'hea', 'mrk'],
  men: ['dec', 'cmp', 'pos', 'vis', 'otb', 'wrk'],
  phy: ['pac', 'sta', 'str', 'agi', 'jmp'],
  gk: ['ref', 'han', 'cmd', 'kik'],
};
export const ALL_ATTRS = [...ATTRS.tec, ...ATTRS.men, ...ATTRS.phy, ...ATTRS.gk];
export const GROUP_LABEL = { tec: '기술', men: '멘탈', phy: '피지컬', gk: '골키퍼' };
export const ATTR_LABEL = {
  pas: '패스', dri: '드리블', fst: '퍼스트 터치', crs: '크로스', fin: '골 결정력', lng: '중거리 슛', tck: '태클', hea: '헤딩', mrk: '마킹',
  dec: '판단력', cmp: '침착성', pos: '위치 선정', vis: '시야', otb: '오프 더 볼', wrk: '활동량',
  pac: '속도', sta: '스태미나', str: '몸싸움', agi: '민첩성', jmp: '점프',
  ref: '반사신경', han: '핸들링', cmd: '공중볼 장악', kik: '킥',
};

export const ROLES = ['GK', 'DC', 'DL', 'DR', 'DM', 'MC', 'ML', 'MR', 'AM', 'ST'];
export const ROLE_LABEL = { GK: '골키퍼', DC: '중앙 수비', DL: '왼쪽 풀백', DR: '오른쪽 풀백', DM: '수비형 미드', MC: '중앙 미드', ML: '왼쪽 윙', MR: '오른쪽 윙', AM: '공격형 미드', ST: '스트라이커' };

// 포지션별로 어떤 능력치가 얼마나 중요한가. 포지션 평점 = 가중 평균(1~20) → CA(1~200)
export const ROLE_W = {
  GK: { ref: 3, han: 3, cmd: 2, kik: 1.5, pos: 2, dec: 1, cmp: 1, agi: 1, jmp: 0.5 },
  DC: { tck: 3, mrk: 3, pos: 2.5, hea: 2, str: 2, jmp: 1, dec: 1.5, pac: 1, cmp: 1, pas: 0.5 },
  DL: { tck: 2.5, mrk: 2, pos: 1.5, pac: 2.5, sta: 2, crs: 1.5, wrk: 1.5, dri: 1, pas: 1, agi: 1 },
  DR: { tck: 2.5, mrk: 2, pos: 1.5, pac: 2.5, sta: 2, crs: 1.5, wrk: 1.5, dri: 1, pas: 1, agi: 1 },
  DM: { tck: 3, pos: 2.5, pas: 2, dec: 2, wrk: 2, mrk: 1.5, sta: 1.5, str: 1, vis: 1, cmp: 1 },
  MC: { pas: 3, vis: 2.5, dec: 2, fst: 1.5, wrk: 2, sta: 1.5, tck: 1, cmp: 1.5, otb: 1, lng: 1 },
  ML: { pac: 3, dri: 3, crs: 2.5, agi: 1.5, otb: 1.5, sta: 1.5, pas: 1, fst: 1, wrk: 1 },
  MR: { pac: 3, dri: 3, crs: 2.5, agi: 1.5, otb: 1.5, sta: 1.5, pas: 1, fst: 1, wrk: 1 },
  AM: { vis: 3, pas: 2.5, dri: 2.5, fst: 2, otb: 2, dec: 1.5, cmp: 1.5, lng: 1.5, fin: 1 },
  ST: { fin: 3.5, otb: 2.5, cmp: 2, pac: 2, fst: 1.5, hea: 1.5, dri: 1, str: 1.5, dec: 1, jmp: 0.5, agi: 0.5 },
};

// 다른 포지션을 맡았을 때 숙련도 보정 (정확히 같으면 1)
const FAM_PAIRS = [
  ['DC', 'DL', 0.88], ['DC', 'DR', 0.88], ['DL', 'DR', 0.9], ['DM', 'DC', 0.9], ['DM', 'MC', 0.95], ['DM', 'DL', 0.85], ['DM', 'DR', 0.85],
  ['MC', 'AM', 0.95], ['MC', 'ML', 0.9], ['MC', 'MR', 0.9], ['ML', 'MR', 0.93], ['AM', 'ST', 0.88], ['AM', 'ML', 0.93], ['AM', 'MR', 0.93],
  ['ST', 'ML', 0.85], ['ST', 'MR', 0.85], ['DL', 'ML', 0.9], ['DR', 'MR', 0.9],
];
export const FAM = {};
for (const a of ROLES) { FAM[a] = {}; for (const b of ROLES) FAM[a][b] = a === b ? 1 : a === 'GK' || b === 'GK' ? 0.25 : 0.8; }
for (const [a, b, v] of FAM_PAIRS) FAM[a][b] = FAM[b][a] = v;

// rows: 위에서부터 공격 → 아래 골키퍼가 아니라, 아래(GK)부터 위(공격)로 적는다. lines: G 골키퍼, D 수비, M 중원, A 공격
export const FORMATIONS = [
  { id: '442', name: '4-4-2', rows: [['GK'], ['DL', 'DC', 'DC', 'DR'], ['ML', 'MC', 'MC', 'MR'], ['ST', 'ST']], lines: 'GDMA' },
  { id: '433', name: '4-3-3', rows: [['GK'], ['DL', 'DC', 'DC', 'DR'], ['DM', 'MC', 'MC'], ['ML', 'ST', 'MR']], lines: 'GDMA' },
  { id: '4231', name: '4-2-3-1', rows: [['GK'], ['DL', 'DC', 'DC', 'DR'], ['DM', 'MC'], ['ML', 'AM', 'MR'], ['ST']], lines: 'GDMMA' },
  { id: '352', name: '3-5-2', rows: [['GK'], ['DC', 'DC', 'DC'], ['ML', 'MC', 'DM', 'MC', 'MR'], ['ST', 'ST']], lines: 'GDMA'.replace('A', 'A') },
  { id: '532', name: '5-3-2', rows: [['GK'], ['DL', 'DC', 'DC', 'DC', 'DR'], ['MC', 'DM', 'MC'], ['ST', 'ST']], lines: 'GDMA' },
];
// 슬롯 목록으로 펼친다: { r: 역할, l: 라인, x, y(0~100, y=100이 우리 골문) }
for (const f of FORMATIONS) {
  f.slots = [];
  const n = f.rows.length;
  f.rows.forEach((row, ri) => {
    row.forEach((r, i) => f.slots.push({ r, l: f.lines[ri], x: ((i + 1) / (row.length + 1)) * 100, y: 91 - (ri / (n - 1)) * 80 }));
  });
}

export const MENTALITY = [['def', '수비적'], ['bal', '균형'], ['atk', '공격적']];
export const PRESSING = [['low', '낮은 압박'], ['mid', '보통'], ['high', '강한 압박']];
export const TRAIN_FOCUS = [['bal', '균형'], ['tec', '기술'], ['men', '멘탈'], ['phy', '피지컬']];

export const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손', '배', '백', '허', '유', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민'];
export const GIVEN_A = ['민', '서', '준', '지', '현', '도', '우', '시', '하', '예', '건', '태', '승', '재', '성', '동', '영', '진', '정', '수'];
export const GIVEN_B = ['우', '준', '호', '민', '현', '윤', '진', '혁', '훈', '영', '성', '빈', '찬', '원', '환', '석', '규', '태', '용', '범'];

export const CLUBS = [
  { city: '도원', suffix: 'FC', color: '#1f5a3a' },
  { city: '청해', suffix: '유나이티드', color: '#2a6f97' },
  { city: '북성', suffix: '시티', color: '#7a4a2b' },
  { city: '달내', suffix: '스타즈', color: '#5b6470' },
  { city: '백마', suffix: '로버스', color: '#b08a2e' },
  { city: '해원', suffix: '아틀레틱', color: '#3d8a8a' },
  { city: '서진', suffix: '타운', color: '#8a2f3a' },
  { city: '금강', suffix: '레인저스', color: '#b4512c' },
  { city: '한울', suffix: 'FC', color: '#4b5d8a' },
  { city: '새벽', suffix: '시티', color: '#6b6f2a' },
  { city: '푸른', suffix: '유나이티드', color: '#2c7a5b' },
  { city: '은빛', suffix: '스포르팅', color: '#7d7d7d' },
];

// 한 팀 로스터 구성(24명)
export const SQUAD_PLAN = ['GK', 'GK', 'GK', 'DC', 'DC', 'DC', 'DC', 'DL', 'DL', 'DR', 'DR', 'DM', 'DM', 'MC', 'MC', 'MC', 'ML', 'ML', 'MR', 'MR', 'AM', 'ST', 'ST', 'ST'];
export const SQUAD_MIN = 18;
export const SQUAD_MAX = 30;
