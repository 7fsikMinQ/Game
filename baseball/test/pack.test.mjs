import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import { parsePackText, applyPack, csvToPack, validatePack, CSV_TEMPLATE, ageFromBirth, ovrFromShow, teamKeys } from '../src/pack.js';
import { createRng } from '../src/rng.js';
import { LEAGUES as LEAGUES_ } from '../src/data.js';
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

test('성적(WAR/OPS/ERA)으로 능력을 추정한다', async () => {
  const { ovrFromStats } = await import('../src/pack.js');
  assert.equal(ovrFromStats({ war: 0 }, 'H'), 48);
  assert.ok(ovrFromStats({ war: 8 }, 'H') > ovrFromStats({ war: 3 }, 'H'));
  assert.ok(ovrFromStats({ ops: 0.95 }, 'H') > ovrFromStats({ ops: 0.72 }, 'H'));
  assert.ok(ovrFromStats({ era: 2.0 }, 'P') > ovrFromStats({ era: 4.2 }, 'P'));
  assert.equal(ovrFromStats({}, 'H'), undefined);
  const s = G.newGame(2, 0, 'kbo');
  const r = parsePackText('league,team,name,pos,age,era,ops\nkbo,LG,에이스,SP,28,2.00,\nkbo,LG,강타자,CF,27,,0.950\n');
  assert.ok(r.ok);
  apply(s, r.pack);
  const t = s.teams[0];
  assert.equal(G.ovrOf(t.players.find((p) => p.name === '에이스')), ovrFromStats({ era: 2 }, 'P'));
  assert.equal(G.ovrOf(t.players.find((p) => p.name === '강타자')), ovrFromStats({ ops: 0.95 }, 'H'));
});

test('이름 한 글자 바꾸기: 결정적이고, 정확히 한 글자만 달라지며, 적용 옵션이 동작한다', async () => {
  const { maskName } = await import('../src/pack.js');
  for (const n of ['김하성', '이정후', '류현진', 'Shohei Ohtani', 'Aaron Judge']) {
    const m = maskName(n);
    assert.equal(maskName(n), m);
    assert.notEqual(m, n);
    assert.equal(m.length, n.length);
    let diff = 0; for (let i = 0; i < n.length; i++) if (n[i] !== m[i]) diff++;
    assert.equal(diff, 1, `${n} → ${m}`);
  }
  const s = G.newGame(3, 0, 'kbo');
  const r = parsePackText('league,team,name,pos,age,ovr\nkbo,LG,김하성,SS,30,70\n');
  const rng = createRng(3);
  applyPack(s, r.pack, rng, ctxOf(s, rng), { mask: true });
  assert.ok(s.teams[0].players.some((p) => p.name === maskName('김하성')));
  assert.ok(!s.teams[0].players.some((p) => p.name === '김하성'));
  assert.equal(s.pack.masked, true);
});

test('내장 근사 명단: 모든 구단에 데이터가 있고, 값 범위·중복·이름 변형이 올바르다', async () => {
  const { ROSTER_DATA } = await import('../src/roster-data.js');
  const { realPack } = await import('../src/pack.js');
  const { LEAGUES } = await import('../src/data.js');
  for (const c of ['mlb', 'kbo']) {
    for (const t of LEAGUES[c].teams) {
      const rows = ROSTER_DATA[c][t.short];
      assert.ok(rows && rows.length >= 8, `${c} ${t.short} 선수 ${rows ? rows.length : 0}명`);
      assert.ok(rows.filter((r) => r[1] === 'SP').length >= 3, `${t.short} 선발`);
      for (const [name, pos, age, ovr, fx] of rows) {
        assert.ok(name && name.length <= 24); assert.ok(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'SP', 'RP'].includes(pos), `${name} ${pos}`);
        assert.ok(age >= 18 && age <= 45 && ovr >= 30 && ovr <= 95, `${name} ${age} ${ovr}`);
        if (fx) assert.ok(c === 'kbo');
      }
      assert.equal(new Set(rows.map((r) => r[0])).size, rows.length, `${t.short} 이름 중복`);
    }
    const p = realPack(c);
    assert.equal(p.teams.length, LEAGUES[c].teams.length);
    assert.ok(parsePackText(JSON.stringify(p)).ok);
  }
  const all = JSON.stringify(ROSTER_DATA);
  for (const real of ['Aaron Judge', 'Shohei Ohtani', 'Mookie Betts', '김도영', '류현진', '안현민']) assert.ok(!all.includes(real), `원래 이름이 남아 있음: ${real}`);
});

test('실제 기반 명단으로 새 게임: 구단 크기·1군·외국인 한도·포수가 유지되고 전력 분포가 현실적이며 한 시즌이 진행된다', () => {
  for (const c of ['mlb', 'kbo']) {
    const L = LEAGUES_[c];
    const s = G.newGame(9, 0, c, { real: true });
    assert.ok(s.pack.players > (c === 'mlb' ? 350 : 130));
    for (const t of s.teams) {
      assert.equal(t.players.length, L.active + L.farmMax);
      assert.equal(t.players.filter((p) => p.act).length, L.active);
      assert.ok(t.players.filter((p) => p.pos === 'C').length >= 2);
      if (c === 'kbo') { assert.ok(t.players.filter((p) => p.fx === 1).length <= 3); assert.ok(t.players.filter((p) => p.fx === 2).length <= 1); }
      assert.ok(G.payroll(t) > 0.4 * G.budgetOf(s, t) && G.payroll(t) < 2.2 * G.budgetOf(s, t), `${t.name} 연봉 ${G.payroll(t)} 예산 ${G.budgetOf(s, t)}`);
    }
    const o = s.teams.map((t) => G.teamOvr(t).total);
    const m = o.reduce((a, b) => a + b) / o.length;
    assert.ok(m > 54 && m < 62, `${c} 평균 전력 ${m}`);
    G.chooseClub(s, 0, 0);
    G.dev.toOffseason(s);
    const pct = G.standings(s).map((r) => r.pct);
    assert.ok(Math.max(...pct) < 0.76 && Math.min(...pct) > 0.25, `${c} 승률 ${Math.max(...pct)} ${Math.min(...pct)}`);
  }
});

test('실제 기반 명단도 장기 시뮬레이션과 저장·복원을 통과한다', async () => {
  const { pack, unpack } = await import('../src/storage.js');
  const s = G.newGame(4, 0, 'kbo', { real: true });
  G.chooseClub(s, 0, 0);
  for (let y = 0; y < 3; y++) { G.dev.toOffseason(s); G.startNextSeason(s, 0, { auto: true }); }
  assert.deepEqual(unpack(pack(s, 1)).state, JSON.parse(JSON.stringify(s)));
  for (const t of s.teams) { assert.ok(t.players.filter((p) => p.fx === 1).length <= 3); assert.ok(t.players.filter((p) => p.pos === 'C').length >= 1); }
});
