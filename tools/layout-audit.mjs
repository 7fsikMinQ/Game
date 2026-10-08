// 화면 겹침/삐져나감/잘림을 실제 Chromium으로 점검한다. (node tools/layout-audit.mjs [soccer|baseball])
// 여러 화면 폭(아이폰 SE ~ Pro Max) × 라이트/다크 × 모든 탭·구간·시트를 돌면서 규칙 위반을 모은다.
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function loadPlaywright() {
  try { return await import('playwright'); } catch { const g = execSync('npm root -g').toString().trim(); return await import(pathToFileURL(path.join(g, 'playwright/index.mjs')).href); }
}
const only = process.argv[2];
const port = 8126;
const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 700));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const WIDTHS = [320, 390, 430];
const GAMES = {
  soccer: { url: `http://localhost:${port}/soccer/`, leagues: ['epl', 'bl', 'kl'], hook: '__sc', tabs: ['home', 'squad', 'tactics', 'league', 'club'] },
  baseball: { url: `http://localhost:${port}/baseball/`, leagues: ['mlb', 'kbo'], hook: '__bb', tabs: ['home', 'roster', 'league', 'market', 'club'] },
};

// 브라우저 안에서 실행: 문제 목록을 돌려준다.
const checker = () => {
  const out = [];
  const vw = document.documentElement.clientWidth;
  const desc = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  const txt = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28);
  const scroller = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`가로 스크롤 발생: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  const roots = [...document.querySelectorAll('#view, #sheetbody, #nav, .top')].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
  const seen = new Set();
  for (const r of roots) {
    for (const el of r.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      const key = desc(el) + '|' + txt(el);
      // 1) 화면 밖으로 삐져나감 (가로 스크롤 컨테이너 안은 제외)
      if (!scroller(el) && (b.right > vw + 1 || b.left < -1)) { if (!seen.has('o' + key)) { seen.add('o' + key); out.push(`화면 밖: ${desc(el)} "${txt(el)}" (left ${Math.round(b.left)}, right ${Math.round(b.right)}, 폭 ${vw})`); } }
      // 2) 글자 잘림: 내용이 박스보다 넓은데 의도된 말줄임/스크롤이 아님
      if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.textOverflow !== 'ellipsis' && !scroller(el) && el.clientWidth > 0) {
        if (!seen.has('c' + key)) { seen.add('c' + key); out.push(`글자 잘림: ${desc(el)} "${txt(el)}" (내용 ${el.scrollWidth} > 박스 ${el.clientWidth})`); }
      }
      // 3) 너무 작은 글자
      if (parseFloat(cs.fontSize) < 10.5 && el.children.length === 0 && txt(el)) { if (!seen.has('f' + key)) { seen.add('f' + key); out.push(`작은 글자 ${cs.fontSize}: ${desc(el)} "${txt(el)}"`); } }
      // 4) 터치 영역이 너무 작은 버튼
      if ((el.tagName === 'BUTTON' || el.tagName === 'A') && (b.height < 26 || b.width < 26) && !seen.has('t' + key)) { seen.add('t' + key); out.push(`작은 터치 영역 ${Math.round(b.width)}×${Math.round(b.height)}: ${desc(el)} "${txt(el)}"`); }
      // 5) 같은 줄의 형제 요소끼리 겹침
      if (el.children.length > 1 && (cs.display === 'flex' || cs.display === 'grid')) {
        const kids = [...el.children].filter((k) => { const c = getComputedStyle(k); const kb = k.getBoundingClientRect(); return c.position !== 'absolute' && c.display !== 'none' && kb.width > 0 && kb.height > 0; });
        for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
          const a = kids[i].getBoundingClientRect(), c = kids[j].getBoundingClientRect();
          const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left), oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
          if (ox > 2 && oy > 2 && !seen.has('v' + key)) { seen.add('v' + key); out.push(`요소 겹침: ${desc(kids[i])} "${txt(kids[i])}" ↔ ${desc(kids[j])} "${txt(kids[j])}" (${Math.round(ox)}×${Math.round(oy)})`); }
        }
      }
    }
  }
  // 6) 고정 하단 탭이 글자에 가려지는지: 마지막 콘텐츠가 탭 위에 있어야 한다
  const nav = document.querySelector('#nav'), view = document.querySelector('#view');
  if (nav && !nav.hidden && view && view.lastElementChild) {
    const sh = document.documentElement.scrollHeight, bottomGap = parseFloat(getComputedStyle(document.querySelector('#app')).paddingBottom);
    if (bottomGap < nav.getBoundingClientRect().height - 2) out.push(`하단 여백(${Math.round(bottomGap)}) < 탭 높이(${Math.round(nav.getBoundingClientRect().height)}): 마지막 줄이 탭에 가려짐`);
    void sh;
  }
  return out;
};

let total = 0;
const report = new Map();
const add = (ctx, issues) => { for (const i of issues) { const k = i.replace(/\d+/g, '#'); const e = report.get(k) || { text: i, where: new Set() }; e.where.add(ctx); report.set(k, e); total++; } };

try {
  for (const [name, g] of Object.entries(GAMES)) {
    if (only && only !== name) continue;
    for (const w of WIDTHS) for (const scheme of ['light', 'dark']) {
      if (scheme === 'dark' && w !== 390) continue;
      for (const league of g.leagues) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme, locale: 'ko-KR' });
        const page = await ctx.newPage(); page.setDefaultTimeout(4000);
        const label = `${name}/${league}/${w}px/${scheme}`; console.error('..', label);
        page.on('pageerror', (e) => add(label, [`JS 오류: ${e}`]));
        await page.goto(g.url);
        await page.waitForSelector('[data-act="pick-league"]');
        const run = async (state) => { await page.waitForTimeout(60); add(`${label} · ${state}`, await page.evaluate(checker)); };
        await run('리그 선택');
        await page.click('[data-act="import-open"]'); await page.waitForTimeout(250); await run('데이터 팩 시트');
        await page.fill('#pk-in', 'league,team,name,pos,age,ovr\nmlb,Yankees,테스트,C,30,60').catch(() => {});
        await page.click('[data-act="import-check"]').catch(() => {}); await page.waitForTimeout(150); await run('데이터 팩 검사 결과');
        await page.click('.sheet [data-act="close"]').catch(() => {});
        await page.click(`[data-act="pick-league"][data-id="${league}"]`);
        await page.waitForSelector('[data-act="pick-club"]');
        await run('구단 선택');
        await page.locator('[data-act="pick-club"]').nth(3).click();
        await page.waitForSelector('#view .head');
        await page.click('[data-act="play"][data-n="1"]'); await page.waitForTimeout(300);
        await page.click('[data-act="skip-live"]').catch(() => {});
        await page.click('[data-act="play"][data-n="5"]').catch(() => {});
        for (const tab of g.tabs) {
          await page.click(`[data-tab="${tab}"]`);
          await run(`탭 ${tab}`);
          const n = await page.locator('#view .seg button, #view .seg.wrap button').count();
          for (let i = 0; i < n; i++) {
            const b = page.locator('#view .seg button').nth(i);
            if (!(await b.isVisible().catch(() => false))) continue;
            await b.click().catch(() => {});
            await run(`탭 ${tab} · 구간 ${i}`);
          }
          const pl = page.locator('#view [data-act="player"]').first();
          if (await pl.count()) { await pl.click(); await page.waitForTimeout(250); await run(`탭 ${tab} · 선수 시트`); await page.click('.sheet [data-act="close"]').catch(() => page.keyboard.press('Escape')); }
        }
        if (name === 'baseball') {
          await page.click('[data-tab="market"]');
          await page.click('[data-act="msub"][data-v="trade"]');
          await page.locator('[data-act="trade-open"]').first().click(); await page.waitForSelector('.sheet [data-act="trade-toggle"]');
          await page.locator('.sheet [data-act="trade-toggle"][data-side="give"]').first().click();
          await page.locator('.sheet [data-act="trade-toggle"][data-side="get"]').first().click();
          await page.waitForTimeout(250); await run('트레이드 시트(선택)');
          await page.click('.sheet [data-act="close"]');
          await page.click('[data-act="msub"][data-v="fa"]');
          await page.locator('#view [data-act="player"]').first().click(); await page.waitForTimeout(250); await run('FA 선수 시트');
          await page.click('.sheet [data-act="close"]');
          await page.click('[data-tab="roster"]'); await page.click('[data-act="rseg"][data-v="L"]');
          await page.locator('[data-act="slot"]').first().click(); await page.waitForTimeout(250); await run('타순 선택 시트');
          await page.click('.sheet [data-act="close"]');
        } else {
          await page.click('[data-tab="tactics"]');
          await page.locator('.slot').first().click(); await page.waitForTimeout(250); await run('슬롯 선택 시트');
          await page.click('.sheet [data-act="close"]');
        }
        // 시트들
        await page.evaluate(() => document.querySelector('[data-act="close"]')); 
        for (let i = 0; i < 7; i++) await page.click('#brand', { force: true }).catch(async () => { await page.click('[data-tab="club"]'); await page.click('#brand', { force: true }); });
        if (await page.locator('.sheet').isVisible()) { await page.waitForTimeout(250); await run('개발자 시트'); await page.click('.sheet [data-act="close"]'); }
        await page.click('[data-tab="club"]');
        const bk = page.locator('[data-act="backup"]').first();
        if (await bk.count()) { await bk.click(); await page.waitForTimeout(250); await run('백업 시트'); await page.click('.sheet [data-act="close"]'); }
        // 오프시즌
        await page.evaluate((hook) => window[hook].G.dev.toOffseason(window[hook].state), g.hook);
        await page.click('[data-tab="home"]');
        await page.reload(); await page.waitForSelector('#view .head');
        await page.click('[data-tab="home"]');
        await run('오프시즌');
        if (name === 'baseball') {
          await page.click('[data-act="goto-draft"]'); await run('드래프트');
          await page.locator('#view [data-act="player"]').first().click().catch(() => {}); await page.waitForTimeout(250); await run('드래프트 선수 시트');
          await page.click('.sheet [data-act="close"]').catch(() => {});
        }
        await ctx.close();
      }
    }
  }
} finally { await browser.close(); server.kill(); }

if (!report.size) { console.log('겹침/삐져나감/잘림 없음'); process.exit(0); }
console.log(`문제 ${report.size}종 (총 ${total}회)`);
for (const { text, where } of report.values()) console.log(`- ${text}\n    예) ${[...where].slice(0, 3).join(' | ')}${where.size > 3 ? ` 외 ${where.size - 3}곳` : ''}`);
process.exit(1);
