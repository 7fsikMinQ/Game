// 오프라인(서비스 워커)·설치(매니페스트) 구성이 실제 파일과 맞는지 점검한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const walk = (d) => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name).replace(/\\/g, '/')]));
const files = () => JSON.parse(read('sw.js').match(/const FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));

test('서비스 워커 캐시 목록: 실제로 있는 앱 파일을 빠짐없이 포함하고, 없는 파일은 없다', () => {
  const list = files();
  const actual = [...walk('src'), ...walk('css'), ...walk('icons'), 'index.html', 'manifest.webmanifest'];
  for (const f of actual) assert.ok(list.includes(f), `캐시 목록에 없음(오프라인에서 깨짐): ${f}`);
  for (const f of list) if (f !== './') assert.ok(fs.existsSync(path.join(root, f)), `목록에 있지만 파일이 없음: ${f}`);
});

test('서비스 워커: 캐시 이름이 게임마다 다르고 버전 숫자가 있다', () => {
  const m = read('sw.js').match(/const CACHE = '([a-z]+)-v(\d+)'/);
  assert.ok(m, 'CACHE 이름 형식');
  assert.equal(m[1], path.basename(root));
});

test('매니페스트: 아이콘 파일이 있고 start_url/scope가 상대 경로', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './'); assert.equal(m.scope, './');
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(root, i.src)), i.src);
  assert.ok(m.name && m.short_name && m.lang === 'ko');
});

test('index.html: iOS 홈 화면 앱 메타, 아이콘, 뷰포트(노치 대응)가 있고 참조 파일이 존재한다', () => {
  const h = read('index.html');
  for (const k of ['apple-mobile-web-app-capable', 'viewport-fit=cover', 'apple-touch-icon', 'manifest.webmanifest', 'theme-color']) assert.ok(h.includes(k), k);
  for (const ref of [...h.matchAll(/(?:href|src)="([^"#]+)"/g)].map((x) => x[1])) { if (/^(https?:|data:)/.test(ref)) assert.fail('외부 리소스는 오프라인에서 열리지 않는다: ' + ref); assert.ok(fs.existsSync(path.join(root, ref)), '없는 파일: ' + ref); }
});

test('외부 네트워크 의존이 없다 (CDN/폰트/분석 스크립트 금지)', () => {
  for (const f of walk('src')) assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(read(f).replace(/\/\/.*$/gm, '')), `외부 URL: ${f}`);
  assert.ok(!/@import|url\(http/.test(read('css/app.css')));
});
