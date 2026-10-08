// 근사 명단 텍스트(팀|이름|포지션|나이|능력[|외국인])를 이름 한 글자만 바꾼 게임용 데이터(baseball/src/roster-data.js)로 만든다.
//   node tools/build-roster.mjs mlb.txt kbo.txt
// 원본 이름은 저장소에 남기지 않는다(출력 파일에는 변형된 이름만 들어간다).
import fs from 'node:fs';
import { maskName } from '../baseball/src/pack.js';
import { LEAGUES } from '../baseball/src/data.js';

const [mlbFile, kboFile] = process.argv.slice(2);
if (!mlbFile || !kboFile) { console.error('사용법: node tools/build-roster.mjs mlb.txt kbo.txt'); process.exit(1); }
const norm = (x) => String(x).toLowerCase().replace(/[\s.\-_]/g, '');
const out = {};
for (const [country, file] of [['mlb', mlbFile], ['kbo', kboFile]]) {
  const L = LEAGUES[country];
  const byKey = new Map(L.teams.map((t) => [norm(t.short), t.short]));
  const teams = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [team, name, pos, age, ovr, fx] = line.split('|');
    const key = byKey.get(norm(team));
    if (!key) throw new Error(`알 수 없는 팀: ${team}`);
    const a = +age, o = +ovr;
    const hype = a <= 22 ? (o >= 70 ? 3 : o >= 60 ? 2 : 1) : a === 23 && o >= 72 ? 2 : 0;
    const row = [maskName(name.trim()), pos, a, o];
    if (+fx) row.push(+fx); else if (hype) row.push(0);
    if (hype) row.push(hype);
    (teams[key] = teams[key] || []).push(row);
  }
  out[country] = teams;
}
const body = `// 근사 선수 명단(2026 시즌 시작 무렵 웹 검색과 보도를 바탕으로 한 추정). 이름은 한 글자만 바꾼 변형이며 능력치는 성적·평판으로 판단한 근사값이라 실제와 다를 수 있다.
// 형식: [이름, 포지션, 나이, 능력, 외국인(0/1/2), 유망주 등급]. 생성: tools/build-roster.mjs
export const ROSTER_DATA = ${JSON.stringify(out)};
`;
fs.writeFileSync(new URL('../baseball/src/roster-data.js', import.meta.url), body);
console.log('teams', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Object.keys(v).length])), 'players', Object.values(out).flatMap((v) => Object.values(v)).reduce((a, r) => a + r.length, 0));
