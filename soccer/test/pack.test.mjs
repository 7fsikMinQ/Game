import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { LEAGUES } from '../src/league.js';
import { parseCSV, csvToPack, validatePack, parsePackText, applyPack, ageFromBirth, caFromOvr, caFromValue, hypeFromValue, POS_MAP, CSV_TEMPLATE, PACK_FORMAT } from '../src/pack.js';
import { caOf } from '../src/player.js';

const T0 = 1_800_000_000_000;
const build = (pack, seed = 3) => {
  const s = G.newGame(seed, T0, pack.country);
  G.withRng(s, (rng) => applyPack(s, pack, rng, { rng, nextId: () => s.nextPid++, used: new Set(s.teams.flatMap((t) => t.players.map((p) => p.name))) }));
  return s;
};
const mkPack = (extra = {}) => ({ format: PACK_FORMAT, version: 1, country: 'epl', asOf: '2026-10-08', divisions: [[
  { name: '테스트 시티', rank: 1, players: [
    { name: '골키퍼A', pos: 'GK', birth: '1994-03-02', ovr: 84, value: 30 },
    { name: '골키퍼B', pos: 'GK', age: 22, ovr: 62 },
    { name: '스트라이커', pos: 'ST', birth: '2000-12-31', ovr: 88, value: 120 },
    { name: '신예', pos: 'AM', birth: '2008-05-05', ovr: 66, value: 40, hype: 3 },
    { name: '수비', pos: 'CB', age: 29, ca: 140 },
  ] },
  { name: '테스트 유나이티드', rank: 2 },
], []], ...extra });

test('CSV 파서: 따옴표, 쉼표 포함 값, BOM, CRLF, 탭 구분', () => {
  const rows = parseCSV('﻿name,club\r\n"김, 철수",A\r\n"He said ""hi""",B\r\n');
  assert.deepEqual(rows, [{ name: '김, 철수', club: 'A' }, { name: 'He said "hi"', club: 'B' }]);
  assert.deepEqual(parseCSV('a\tb\n1\t2'), [{ a: '1', b: '2' }]);
  assert.deepEqual(parseCSV(''), []);
});

test('생년월일 -> 나이 (기준일 포함, 생일 전/후)', () => {
  assert.equal(ageFromBirth('2000-10-08', '2026-10-08'), 26);
  assert.equal(ageFromBirth('2000-10-09', '2026-10-08'), 25);
  assert.equal(ageFromBirth('2008-02-29', '2026-10-08'), 18);
  assert.ok(Number.isNaN(ageFromBirth('abc', '2026-10-08')));
});

test('환산: OVR/시장가치 -> CA 는 단조 증가하고 범위 안', () => {
  let prev = 0;
  for (let o = 40; o <= 95; o += 5) { const v = caFromOvr(o); assert.ok(v >= prev && v >= 20 && v <= 195); prev = v; }
  prev = 0;
  for (const v of [0.1, 1, 5, 20, 60, 120, 200]) { const c = caFromValue(v); assert.ok(c >= prev); prev = c; }
  assert.ok(caFromOvr(85) > 150 && caFromOvr(65) < 115);
});

test('유망주 이슈: 어린 선수의 시장가치가 능력 대비 높을수록 등급이 오른다, 성인은 해당 없음', () => {
  const ca = 90;
  const low = hypeFromValue(19, 3, ca), mid = hypeFromValue(19, 60, ca), hi = hypeFromValue(19, 400, ca);
  assert.ok(low <= mid && mid <= hi);
  assert.ok(hi >= 3);
  assert.equal(hypeFromValue(27, 400, ca), undefined);
  assert.equal(hypeFromValue(19, undefined, ca), undefined);
});

test('포지션 별칭이 게임 포지션으로 매핑된다', () => {
  for (const [k, v] of [['CB', 'DC'], ['LB', 'DL'], ['RB', 'DR'], ['CDM', 'DM'], ['CM', 'MC'], ['LW', 'ML'], ['RW', 'MR'], ['CAM', 'AM'], ['FW', 'ST'], ['GK', 'GK'], ['수비수', 'DC']]) assert.equal(POS_MAP[k], v);
});

test('검증: 올바른 팩은 통과, 잘못된 것은 이유와 함께 거절', () => {
  assert.ok(validatePack(mkPack()).ok);
  assert.equal(validatePack(null).ok, false);
  assert.equal(validatePack({ format: 'x' }).ok, false);
  assert.equal(validatePack(mkPack({ country: 'xx' })).ok, false);
  const bad = mkPack(); bad.divisions[0][0].players.push({ name: '', pos: 'ST' });
  assert.equal(validatePack(bad).ok, false);
  const bad2 = mkPack(); bad2.divisions[0][0].players[0].ovr = 120;
  assert.equal(validatePack(bad2).ok, false);
  const bad3 = mkPack(); bad3.divisions[0][0].players[0].hype = 9;
  assert.equal(validatePack(bad3).ok, false);
  const dup = mkPack(); dup.divisions[0][1].name = '테스트 시티';
  assert.equal(validatePack(dup).ok, false);
  const many = mkPack(); many.divisions[0] = Array.from({ length: 21 }, (_, i) => ({ name: 'C' + i }));
  const v = validatePack(many);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('20팀')));
  const warn = validatePack(mkPack());
  assert.ok(warn.warnings.some((w) => w.includes('가상')));
});

test('parsePackText: JSON/CSV 자동 판별, 깨진 입력은 오류, 너무 큰 입력은 거절', () => {
  assert.ok(parsePackText(JSON.stringify(mkPack())).ok);
  const csv = parsePackText(CSV_TEMPLATE);
  assert.ok(csv.ok, JSON.stringify(csv.errors));
  assert.equal(csv.pack.country, 'epl');
  assert.equal(parsePackText('{broken').ok, false);
  assert.equal(parsePackText('x'.repeat(7 * 1024 * 1024)).ok, false);
  assert.equal(parsePackText('').ok, false);
});

test('CSV -> 팩: 구단/선수 묶기, 부 구분, 순위 반영', () => {
  const pack = csvToPack('country,division,club,rank,name,pos,age,ca\nbl,1,A,1,가,ST,20,100\nbl,1,A,1,나,GK,30,90\nbl,2,B,3,다,DC,25,80\nbl,1,C,,,,,\n');
  assert.equal(pack.country, 'bl');
  assert.equal(pack.divisions[0].length, 2);
  assert.equal(pack.divisions[0][0].players.length, 2);
  assert.equal(pack.divisions[1][0].rank, 3);
});

test('적용: 실제 이름과 나이가 그대로 반영되고, 팀 구성이 유효하다', () => {
  const s = build(mkPack());
  const names = s.teams.map((t) => t.name);
  assert.ok(names.includes('테스트 시티') && names.includes('테스트 유나이티드'));
  const t = s.teams.find((x) => x.name === '테스트 시티');
  const byName = Object.fromEntries(t.players.map((p) => [p.name, p]));
  assert.equal(byName['골키퍼A'].age, 32);   // 1994-03-02 @ 2026-10-08
  assert.equal(byName['스트라이커'].age, 25); // 2000-12-31 -> 아직 생일 전
  assert.equal(byName['신예'].age, 18);
  assert.equal(byName['수비'].pos, 'DC');
  assert.equal(caOf(byName['수비']), 140 + (caOf(byName['수비']) - 140)); // 지정 CA 근처
  assert.ok(Math.abs(caOf(byName['수비']) - 140) <= 4);
  assert.ok(Math.abs(caOf(byName['스트라이커']) - caFromOvr(88)) <= 4);
  assert.ok(t.players.length >= 22 && t.players.length <= 30);
  assert.ok(t.players.filter((p) => p.pos === 'GK').length >= 2);
  assert.equal(new Set(s.teams.flatMap((x) => x.players.map((p) => p.id))).size, s.teams.flatMap((x) => x.players).length);
  assert.deepEqual(s.pack, { name: '가져온 데이터', asOf: '2026-10-08', clubs: 2, players: 5 });
});

test('적용: 유망주 이슈(hype)가 잠재능력에 반영된다 (같은 CA에서 등급 3 > 등급 0)', () => {
  let hi = 0, lo = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const a = mkPack(); a.divisions[0][0].players.push({ name: 'X', pos: 'MC', age: 18, ca: 70, hype: 3 }, { name: 'Y', pos: 'MC', age: 18, ca: 70, hype: 0 });
    const s = build(a, seed);
    const t = s.teams.find((x) => x.name === '테스트 시티');
    hi += t.players.find((p) => p.name === 'X').pa; lo += t.players.find((p) => p.name === 'Y').pa;
  }
  assert.ok(hi / 12 > lo / 12 + 40, `hype3 ${hi / 12} vs hype0 ${lo / 12}`);
});

test('적용: 명시한 PA는 그대로, 시장가치가 높은 어린 선수는 높은 등급이 된다', () => {
  const a = mkPack(); a.divisions[0][0].players.push({ name: 'P', pos: 'ST', age: 17, ca: 60, pa: 188 }, { name: 'V', pos: 'ST', age: 18, ovr: 60, value: 90 }, { name: 'W', pos: 'ST', age: 18, ovr: 60, value: 0.5 });
  const s = build(a);
  const t = s.teams.find((x) => x.name === '테스트 시티');
  assert.equal(t.players.find((p) => p.name === 'P').pa, 188);
  assert.ok(t.players.find((p) => p.name === 'V').pa > t.players.find((p) => p.name === 'W').pa + 20);
});

test('적용: 순위가 높은 구단이 평판이 높은 자리에 들어간다, 선수 없는 구단은 가상 선수 유지', () => {
  const s = build(mkPack());
  const a = s.teams.find((x) => x.name === '테스트 시티'), b = s.teams.find((x) => x.name === '테스트 유나이티드');
  assert.ok(a.rep >= b.rep);
  assert.ok(b.players.length === 24);
  assert.equal(s.divs[0].ids.length, 20);
});

test('적용: 팩의 선수 구성에 포지션이 부족해도 게임이 정상 진행된다 (골키퍼 없는 팀 포함)', () => {
  const p = { format: PACK_FORMAT, version: 1, country: 'kl', divisions: [[{ name: '전원공격', rank: 1, players: Array.from({ length: 14 }, (_, i) => ({ name: '공격수' + i, pos: 'ST', age: 24 + (i % 5), ca: 90 })) }], []] };
  const s = build(p);
  const t = s.teams.find((x) => x.name === '전원공격');
  assert.ok(t.players.filter((x) => x.pos === 'GK').length >= 2);
  G.chooseClub(s, t.id, T0);
  G.dev.toOffseason(s, T0);
  assert.equal(s.phase, 'offseason');
});

test('적용 후 한 시즌이 끝까지 돌아가고 저장 형식 왕복도 이름을 보존한다', async () => {
  const { pack: pk, unpack } = await import('../src/storage.js').then((m) => ({ pack: m.pack, unpack: m.unpack }));
  const s = build(mkPack(), 9);
  const t = s.teams.find((x) => x.name === '테스트 시티');
  G.chooseClub(s, t.id, T0);
  G.dev.skip(s, 5, T0);
  const back = unpack(pk(s, 1)).state;
  assert.deepEqual(back, s);
  assert.ok(back.teams.find((x) => x.name === '테스트 시티').players.some((p) => p.name === '신예'));
});

test('이름에 HTML이 들어 있어도 화면에서 이스케이프된다 (XSS)', async () => {
  const { homeView, squadView, clubSelectView } = await import('../src/views.js');
  const a = mkPack(); a.divisions[0][0].name = '<img src=x onerror=alert(1)>'; a.divisions[0][0].players[0].name = '"><script>alert(1)</script>';
  const s = build(a);
  const t = s.teams.find((x) => x.name.includes('img'));
  const html = clubSelectView(s, { autopilot: true });
  assert.ok(!html.includes('<img src=x'));
  G.chooseClub(s, t.id, T0);
  const ui = { pos: 'ALL', sort: 'pos', live: null, report: null };
  for (const h of [homeView(s, ui, T0), squadView(s, ui)]) { assert.ok(!h.includes('<script>')); assert.ok(!h.includes('<img src=x')); }
  void LEAGUES;
});

// ───── 보안/견고성 ─────
test('악성 입력: __proto__ 오염 시도, 숫자 아닌 값, 음수 나이, 거대한 이름은 안전하게 처리된다', () => {
  const evil = '{"format":"soccer-pack","version":1,"country":"epl","__proto__":{"polluted":1},"divisions":[[{"name":"A","__proto__":{"x":1},"players":[{"name":"P","pos":"ST","ovr":"abc"}]}],[]]}';
  const r = parsePackText(evil);
  assert.equal(({}).polluted, undefined);
  assert.equal(r.ok, false, 'ovr 이 숫자가 아니면 거절');
  const r2 = parsePackText(JSON.stringify(mkPack({ divisions: [[{ name: 'B'.repeat(200) }], []] })));
  assert.equal(r2.ok, false);
  const p = mkPack(); p.divisions[0][0].players.push({ name: '음수', pos: 'ST', age: -5, ca: 100 });
  const s = build(p);
  const t = s.teams.find((x) => x.name === '테스트 시티');
  assert.equal(t.players.find((x) => x.name === '음수').age, 25, '이상한 나이는 25세로 대체');
  assert.equal(({}).polluted, undefined);
});

test('CSV: 따옴표가 안 닫혀도, 칸이 모자라도 죽지 않는다', () => {
  assert.doesNotThrow(() => parsePackText('country,division,club,name\nepl,1,"열린 따옴표,A'));
  assert.doesNotThrow(() => parsePackText('country,division,club,name\nepl'));
  assert.equal(parsePackText('country,division,club,name\n').ok, false);
});

test('검증된 구단명 템플릿(docs/data/*.csv)이 그대로 가져와진다', async () => {
  const fs = await import('node:fs'), path = await import('node:path'), { fileURLToPath } = await import('node:url');
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/data');
  for (const [file, country, n1] of [['clubs-epl-2026-27.csv', 'epl', 20], ['clubs-bl-2026-27.csv', 'bl', 18], ['clubs-kl-2026.csv', 'kl', 12]]) {
    const r = parsePackText(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.ok(r.ok, `${file}: ${JSON.stringify(r.errors)}`);
    assert.equal(r.pack.country, country);
    assert.equal(r.pack.divisions[0].length, n1, `${file} 1부 팀 수`);
    const s = build(r.pack);
    assert.equal(s.teams.filter((t) => r.pack.divisions[0].some((c) => c.name === t.name)).length, n1);
  }
});
