// 배포용 폴더(_site)를 만든다. manifest.webmanifest 가 있는 폴더를 "게임"으로 보고 포함한다(test/ 제외).
//   npm run site   -> _site/ 를 Cloudflare Pages / Netlify Drop 에 끌어다 놓으면 된다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
const games = [];
for (const d of fs.readdirSync(root, { withFileTypes: true })) {
  if (d.isDirectory() && fs.existsSync(path.join(root, d.name, 'manifest.webmanifest'))) {
    fs.cpSync(path.join(root, d.name), path.join(out, d.name), { recursive: true, filter: (src) => path.basename(src) !== 'test' });
    games.push(d.name);
  }
}
console.log(`_site/ 생성 완료: index.html + ${games.join(', ')}`);
