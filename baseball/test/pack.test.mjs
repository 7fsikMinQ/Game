import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { parsePackText, applyPack, csvToPack, validatePack, CSV_TEMPLATE, ageFromBirth, ovrFromShow, teamKeys } from '../src/pack.js';
import { createRng } from '../src/rng.js';
import { ctxOf } from '../src/core.js';

const apply = (s, pack) => { const rng = createRng(3); return applyPack(s, pack, rng, ctxOf(s, rng)); };

test('CSV 템플릿이 검증을 통과하고, 알 수 없는 구단은 경고만 한다', () => {
  const r = parsePackText(CSV_TEMPLATE);
  assert.ok(r.ok, r.errors.join());
  assert.equal(r.pack.country, 'mlb');
  assert.ok(r.warnings.some((w) => w.includes('알 수 없는 구단')) || r.pack.teams.length >= 1);
});

test('구단 이름 별칭: 한글/영문/약어/별명 모두 같은 구단으로 인식', () => {
  const m = teamKeys('mlb');
  for (const k of ['뉴욕양키스', 'newyorkyankees', 'nyy', 'yankees', '양키스']) assert.equal(m.get(k), 0, k);
  assert.equal(m.get('lad'), 25);
  const k = teamKeys('kbo');
  for (const key of ['lg트윈스', 'lg', 'twins', 'kt', 'ktwiz', '트윈스']) assert.equal(k.get(key), key === 'kt' || key === 'ktwiz' ? 5 : 0, key);
});

test('나이는 생년월일과 기준일에서 계산', () => {
  assert.equal(ageFromBirth('1999-05-12', '2026-10-08'), 27);
  assert.equal(ageFromBirth('1999-12-31', '2026-10-08'), 26);
  assert.ok(Number.isNaN(ageFromBirth('garbage')));
});

test('적용: 이름·나이·포지션·능력이 그대로 반영되고 구단 로스터 크기는 유지된다', () => {
  const s = G.newGame(1, 0, 'mlb');
  const text = 'league,team,name,pos,birth,ovr,pot,hype,salary,years\nmlb,Yankees,테스트 타자,RF,1999-05-12,80,80,0,35,5\nmlb,Yankees,테스트 투수,SP,1996-08-30,74,74,0,25,3\nmlb,Yankees,테스트 신예,SS,2007-02-20,50,78,3,0.8,3\n';
  const r = parsePackText(text);
  assert.ok(r.ok);
  const stats = apply(s, r.pack);
  assert.equal(stats.players, 3);
  const t = s.teams[0];
  assert.equal(t.players.length, 40);
  const a = t.players.find((p) => p.name === '테스트 타자'), b = t.players.find((p) => p.name === '테스트 투수'), c = t.players.find((p) => p.name === '테스트 신예');
  assert.equal(a.age, 27); assert.equal(G.ovrOf(a), 80); assert.equal(a.pos, 'RF'); assert.equal(a.sal, 35); assert.equal(a.yrs, 5);
  assert.equal(b.pos, 'SP'); assert.equal(G.ovrOf(b), 74);
  assert.equal(c.age, 19); assert.equal(c.hype, 3); assert.equal(c.pot, 78);
  assert.equal(new Set(t.players.map((p) => p.id)).size, 40);
});

test('능력치가 없으면 연봉에서 추정하고, show(40~99) 값은 이 게임 스케일로 환산', () => {
  assert.ok(ovrFromShow(99) <= 95 && ovrFromShow(99) >= 80);
  assert.ok(ovrFromShow(60) < ovrFromShow(80));
  const s = G.newGame(2, 0, 'kbo');
  const r = parsePackText('league,team,name,pos,age,salary,show\nkbo,LG,연봉만,SP,30,15,\nkbo,LG,쇼값,RF,25,,85\n');
  assert.ok(r.ok);
  apply(s, r.pack);
  const t = s.teams[0];
  assert.ok(G.ovrOf(t.players.find((p) => p.name === '연봉만')) >= 70);
  assert.equal(G.ovrOf(t.players.find((p) => p.name === '쇼값')), ovrFromShow(85));
});

test('외국인 표시: fx 열이 1이면 외국인, 2면 아시아쿼터', () => {
  const s = G.newGame(2, 0, 'kbo');
  const r = parsePackText('league,team,name,pos,age,ovr,fx\nkbo,LG,외인에이스,SP,31,78,1\nkbo,LG,아시아,RP,27,60,2\n');
  apply(s, r.pack);
  const t = s.teams[0];
  assert.equal(t.players.find((p) => p.name === '외인에이스').fx, 1);
  assert.equal(t.players.find((p) => p.name === '아시아').fx, 2);
});

test('잘못된 데이터는 이유와 함께 거절: 범위 밖 값, 이름 없음, 너무 큰 파일, 깨진 JSON', () => {
  assert.equal(parsePackText('league,team,name,pos,age,ovr\nmlb,Yankees,나,C,30,150\n').ok, false);
  assert.equal(parsePackText('{"format":"baseball-pack","country":"mlb","teams":[{"team":"Yankees","players":[{"name":"","pos":"C"}]}]}').ok, false);
  assert.equal(parsePackText('x'.repeat(7 * 1024 * 1024)).ok, false);
  assert.equal(parsePackText('{bad json').ok, false);
  assert.equal(parsePackText('league,team,name,pos,age,hype\nmlb,Yankees,나,C,20,9\n').ok, false);
  assert.equal(validatePack(null).ok, false);
  assert.equal(validatePack({ format: 'baseball-pack', country: 'xx', teams: [] }).ok, false);
});

test('팩을 적용한 월드로도 한 시즌이 정상 진행된다', () => {
  const s = G.newGame(4, 0, 'kbo');
  const r = parsePackText('league,team,name,pos,age,ovr\nkbo,키움,키움에이스,SP,28,85\nkbo,키움,키움타자,CF,26,82\n');
  apply(s, r.pack);
  G.chooseClub(s, 9, 0);
  G.dev.toOffseason(s);
  assert.equal(s.phase, 'offseason');
  assert.equal(s.teams[9].w + s.teams[9].l + (s.teams[9].d || 0), 144);
  assert.equal(s.pack.players, 2);
});

test('CSV 파서: 따옴표·쉼표·탭 구분·BOM을 처리한다', () => {
  const p = csvToPack('﻿league\tteam\tname\tpos\nmlb\tYankees\t"Doe, John"\tC\n');
  assert.equal(p.teams[0].players[0].name, 'Doe, John');
});
