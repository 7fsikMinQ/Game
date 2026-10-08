// node --test 는 Node 버전마다 폴더/글롭 처리가 달라서, 파일 목록을 직접 넘긴다.
import { readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
for (const d of readdirSync(root, { withFileTypes: true })) {
  const dir = path.join(root, d.name, 'test');
  if (d.isDirectory() && existsSync(dir)) {
    for (const f of readdirSync(dir)) if (f.endsWith('.test.mjs')) files.push(path.join(dir, f));
  }
}
if (!files.length) {
  console.error('테스트 파일이 없습니다.');
  process.exit(1);
}
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
