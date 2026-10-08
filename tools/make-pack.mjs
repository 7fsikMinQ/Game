// CSV(또는 JSON)를 검사하고 게임이 읽는 데이터 팩(JSON)으로 바꾼다.
//   node tools/make-pack.mjs 내데이터.csv [결과.json]
// 가져오기 화면에는 CSV를 그대로 붙여넣어도 되지만, 미리 검사하면 오류를 먼저 볼 수 있다.
import fs from 'node:fs';
import { parsePackText } from '../soccer/src/pack.js';

const [inp, out] = process.argv.slice(2);
if (!inp) { console.error('사용법: node tools/make-pack.mjs 입력.csv [출력.json]'); process.exit(1); }
const r = parsePackText(fs.readFileSync(inp, 'utf8'));
console.log(r.ok ? `OK  구단 ${r.stats.clubs}개 · 선수 ${r.stats.players}명 · 리그 ${r.pack.country}` : '실패');
for (const e of r.errors) console.log('  오류 :', e);
if (r.stats.moreErrors) console.log(`  … 오류 ${r.stats.moreErrors}건 더 있음`);
for (const w of r.warnings) console.log('  참고 :', w);
if (r.ok && out) { fs.writeFileSync(out, JSON.stringify(r.pack)); console.log('저장:', out); }
process.exit(r.ok ? 0 : 1);
