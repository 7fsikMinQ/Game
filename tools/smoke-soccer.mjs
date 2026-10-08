// 축구 게임: 실제 Chromium을 아이폰 크기로 띄워서 화면 흐름을 점검한다. (npm run smoke:soccer)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tools/.shots');
fs.mkdirSync(shots, { recursive: true });
async function loadPlaywright() {
  try { return await import('playwright'); } catch { const g = execSync('npm root -g').toString().trim(); return await import(pathToFileURL(path.join(g, 'playwright/index.mjs')).href); }
}
const port = 8124;
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const url = `http://localhost:${port}/soccer/`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
let failed = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failed++; };
const league = process.env.LEAGUE || 'epl';

try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'ko-KR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url);
    await page.waitForSelector('[data-act="pick-league"]');
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-0-league.png`), fullPage: true });
    ok((await page.locator('[data-act="pick-league"]').count()) === 3, `[${scheme}] 리그 3개가 보인다`);
    await page.click(`[data-act="pick-league"][data-id="${league}"]`);
    await page.waitForSelector('[data-act="pick-club"]');
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-1-club.png`), fullPage: true });
    await page.locator('[data-act="pick-club"]').nth(5).click();
    await page.waitForSelector('#view .head');
    ok((await page.textContent('#view')).includes('다음 경기'), `[${scheme}] 구단을 고르면 홈 화면이 뜬다`);
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-2-home.png`), fullPage: true });

    await page.click('[data-act="play"][data-n="1"]');
    await page.waitForSelector('#mscore');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-3-live.png`) });
    await page.click('[data-act="skip-live"]');
    ok((await page.locator('.mboard').count()) === 1, `[${scheme}] 경기 후 전광판이 보인다`);
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-4-after.png`), fullPage: true });
    const r1 = await page.evaluate(() => window.__sc.state.divs[window.__sc.state.teams[window.__sc.state.userId].div].roundIdx);
    await page.click('[data-act="play"][data-n="5"]');
    const r2 = await page.evaluate(() => window.__sc.state.divs[window.__sc.state.teams[window.__sc.state.userId].div].roundIdx);
    ok(r2 - r1 === 5, `[${scheme}] 5라운드 건너뛰기 (${r1} -> ${r2})`);

    for (const tab of ['squad', 'tactics', 'league', 'club']) {
      await page.click(`[data-tab="${tab}"]`);
      await page.screenshot({ path: path.join(shots, `sc-${scheme}-5-${tab}.png`), fullPage: true });
    }
    await page.click('[data-tab="squad"]');
    await page.locator('[data-act="player"]').first().click();
    await page.waitForSelector('.sheet .attrs');
    await page.waitForTimeout(350); // 시트 등장 애니메이션이 끝난 뒤 캡처
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-6-player.png`) });
    await page.click('.sheet [data-act="close"]');
    await page.click('[data-tab="tactics"]');
    await page.locator('.slot').nth(3).click();
    await page.waitForSelector('.sheet [data-act="set-slot"]');
    await page.locator('.sheet [data-act="set-slot"]').nth(1).click();
    ok((await page.evaluate(() => window.__sc.state.teams[window.__sc.state.userId].auto)) === false, `[${scheme}] 선수를 직접 고르면 자동 라인업이 꺼진다`);
    await page.click('[data-tab="club"]');
    await page.click('[data-act="cseg"][data-v="market"]');
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-7-market.png`), fullPage: true });
    if (await page.locator('[data-act="player"][data-src="market"]').count()) {
      await page.locator('[data-act="player"][data-src="market"]').first().click();
      await page.click('.sheet [data-act="neg-open"]');
      await page.waitForSelector('.sheet .neglog, .sheet [data-act="neg-bid"], .sheet .alert');
      if (await page.locator('#neg-in').count()) {
        await page.fill('#neg-in', '100');
        await page.click('.sheet [data-act="neg-bid"]');
        ok((await page.textContent('.sheet')).includes('판매 구단:'), `[${scheme}] 낮은 입찰에는 구단이 답한다`);
      } else ok((await page.textContent('.sheet')).includes('이적시장이 닫혀'), `[${scheme}] 시장이 닫혀 있으면 협상 시트가 안내한다`);
      await page.screenshot({ path: path.join(shots, `sc-${scheme}-7b-negotiate.png`) });
      ok(await page.evaluate(() => document.querySelector('#sheetbody').scrollWidth <= document.querySelector('#sheetbody').clientWidth + 1), `[${scheme}] 협상 시트가 가로로 넘치지 않는다`);
      await page.click('.sheet [data-act="close"]');
    }

    for (let i = 0; i < 7; i++) await page.click('#brand');
    ok(await page.locator('.sheet').isVisible(), `[${scheme}] 제목 7번 탭하면 개발자 메뉴가 열린다`);
    await page.click('[data-act="dev-end"]');
    await page.click('[data-tab="home"]');
    ok((await page.textContent('#view')).includes('오프시즌'), `[${scheme}] 시즌 끝까지 가면 오프시즌이 된다`);
    await page.screenshot({ path: path.join(shots, `sc-${scheme}-8-offseason.png`), fullPage: true });
    await page.click('[data-act="next-season"]');
    ok((await page.textContent('#view')).includes('다음 경기'), `[${scheme}] 다음 시즌이 시작된다`);

    const snap = await page.evaluate(() => ({ season: window.__sc.state.season, money: window.__sc.state.money }));
    await page.reload();
    await page.waitForSelector('#view .head');
    const snap2 = await page.evaluate(() => ({ season: window.__sc.state.season, money: window.__sc.state.money }));
    ok(snap.season === snap2.season && snap.money === snap2.money, `[${scheme}] 새로고침해도 저장이 유지된다`);
    if (scheme === 'light') {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload(); await page.waitForTimeout(600);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('#view .head', { timeout: 5000 }).then(() => ok(true, '오프라인에서도 앱이 열린다'), () => ok(false, '오프라인에서도 앱이 열린다'));
      await ctx.setOffline(false);
    }
    ok(errors.length === 0, `[${scheme}] 콘솔 에러 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
} finally { await browser.close(); server.kill(); }
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과. 스크린샷: tools/.shots/');
process.exit(failed ? 1 : 0);
