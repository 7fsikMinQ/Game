// 실제 브라우저(Chromium)를 아이폰 크기로 띄워서 화면 흐름을 점검한다.
//   npm run smoke            -> 점검 + 스크린샷(tools/.shots/)
// playwright가 필요하다: npm i -g playwright  (자세한 건 docs/TESTING.md)
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, 'tools/.shots');
fs.mkdirSync(shots, { recursive: true });

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const g = execSync('npm root -g').toString().trim();
    return await import(pathToFileURL(path.join(g, 'playwright/index.mjs')).href);
  }
}

const port = 8123;
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const url = `http://localhost:${port}/baseball/`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failed++;
};

try {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'ko-KR' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(url);
    await page.waitForSelector('#view .head');
    ok((await page.textContent('#view')).includes('다음 경기'), `[${scheme}] 홈 화면이 그려진다`);
    await page.screenshot({ path: path.join(shots, `${scheme}-1-home-empty.png`) });

    // 경기 하나를 즉시 도래시키고 중계 연출을 확인
    await page.evaluate(() => {
      window.__bb.state.nextGameAt = Date.now() - 500;
      window.__bb.tick();
    });
    await page.waitForSelector('#board table');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(shots, `${scheme}-2-live.png`) });
    await page.click('[data-act="skip-live"]');
    ok((await page.locator('.board').count()) === 1, `[${scheme}] 경기 후 스코어보드가 보인다`);
    await page.screenshot({ path: path.join(shots, `${scheme}-3-after.png`), fullPage: true });

    await page.click('[data-tab="roster"]');
    await page.screenshot({ path: path.join(shots, `${scheme}-4-roster.png`), fullPage: true });
    await page.locator('[data-act="player"]').first().click();
    await page.waitForSelector('.sheet .stat');
    const before = await page.evaluate(() => window.__bb.state.money);
    await page.evaluate(() => { window.__bb.state.money = 99999; });
    await page.locator('.sheet [data-act="train"]:not([disabled])').first().click();
    const after = await page.evaluate(() => window.__bb.state.money);
    ok(after < 99999, `[${scheme}] 훈련하면 자금이 줄어든다 (${before} -> ${after})`);
    await page.screenshot({ path: path.join(shots, `${scheme}-5-player.png`) });
    await page.click('.sheet [data-act="close"]');

    await page.click('[data-tab="table"]');
    await page.screenshot({ path: path.join(shots, `${scheme}-6-table.png`), fullPage: true });
    await page.click('[data-tab="club"]');
    await page.screenshot({ path: path.join(shots, `${scheme}-7-club.png`), fullPage: true });

    // 개발자 메뉴: 상단 제목 7번 탭
    for (let i = 0; i < 7; i++) await page.click('#brand');
    ok(await page.locator('.sheet').isVisible(), `[${scheme}] 제목 7번 탭하면 개발자 메뉴가 열린다`);
    await page.click('[data-act="dev-end"]');
    await page.click('[data-tab="home"]');
    ok((await page.textContent('#view')).includes('오프시즌'), `[${scheme}] 시즌 끝까지 건너뛰면 오프시즌이 된다`);
    await page.screenshot({ path: path.join(shots, `${scheme}-8-offseason.png`), fullPage: true });
    await page.click('[data-act="auto-next"]');
    ok((await page.textContent('#view')).includes('정규시즌 0/42'), `[${scheme}] 다음 시즌이 시작된다`);

    // 저장 유지
    const snap = await page.evaluate(() => ({ season: window.__bb.state.season, money: window.__bb.state.money }));
    await page.reload();
    await page.waitForSelector('#view .head');
    const snap2 = await page.evaluate(() => ({ season: window.__bb.state.season, money: window.__bb.state.money }));
    ok(snap.season === snap2.season && snap.money === snap2.money, `[${scheme}] 새로고침해도 저장이 유지된다`);

    if (scheme === 'light') {
      // 오프라인: 서비스워커가 캐시한 뒤 네트워크를 끊고 다시 연다
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.reload();
      await page.waitForTimeout(500);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('#view .head', { timeout: 5000 }).then(
        () => ok(true, '오프라인에서도 앱이 열린다'),
        () => ok(false, '오프라인에서도 앱이 열린다'),
      );
      await ctx.setOffline(false);
    }
    ok(errors.length === 0, `[${scheme}] 콘솔 에러 없음${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(failed ? `\n${failed}개 실패` : '\n전부 통과. 스크린샷: tools/.shots/');
process.exit(failed ? 1 : 0);
