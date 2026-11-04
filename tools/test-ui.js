/**
 * tools/test-ui.js — 页面交互与提交流程自检
 *
 * 依赖：npm i -D playwright-core（并确保本机有 Playwright 的 Chromium）
 * 用法：先 `python -m http.server 8765`，再 `node tools/test-ui.js`
 * 截图输出到 shots/
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = path.join(__dirname, '..', 'shots');
const BASE = 'http://127.0.0.1:8765/index.html';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-upload.png'), fullPage: true });

  await page.click('#btnSample');
  await page.waitForSelector('#stageResult:not([hidden])');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '02-result.png'), fullPage: true });

  // ---- 分享卡 ----
  const cardB64 = await page.evaluate(() => {
    const view = window.PBZApp.getView();
    const canvas = window.PBZ.ShareCard.draw(view, { dateText: '2026.11.04' });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(OUT, 'card.png'), Buffer.from(cardB64, 'base64'));

  // ---- 原始数据 ----
  await page.click('.tab[data-tab="raw"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-raw.png'), fullPage: true });

  await page.fill('#rawSearch', 'death');
  await page.waitForTimeout(400);
  const searchCount = await page.$$eval('.tree-row', (r) => r.length);
  await page.screenshot({ path: path.join(OUT, '04-search.png'), fullPage: true });

  // ---- 手动绑定：把 CurrentDay 绑成「游玩时长」以外的字段验证生效 ----
  await page.fill('#rawSearch', '');
  await page.waitForTimeout(300);
  const before = await page.textContent('#dayNow');
  await page.evaluate(() => window.PBZApp.setOverride('currentDay', 'TotalDayLimit'));
  await page.waitForTimeout(300);
  const after = await page.textContent('#dayNow');
  const calibValue = await page.$eval('select[data-bind-key="currentDay"]', (s) => s.value);
  await page.evaluate(() => window.PBZApp.setOverride('currentDay', null));
  await page.evaluate(() => { window.PBZApp.setOverride('currentDay', ''); });
  await page.reload({ waitUntil: 'networkidle' });

  // ---- 错误文件 ----
  await page.click('#btnAgain').catch(() => {});
  await page.setInputFiles('#fileInput', {
    name: 'random.sav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('this is definitely not a gvas save file, just text padding...', 'utf8')
  });
  await page.waitForTimeout(600);
  const errVisible = await page.isVisible('#stageError');
  await page.screenshot({ path: path.join(OUT, '07-error.png'), fullPage: true });

  // ---- 移动端 ----
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.screenshot({ path: path.join(OUT, '05-mobile-upload.png'), fullPage: true });
  await mobile.click('#btnSample');
  await mobile.waitForSelector('#stageResult:not([hidden])');
  await mobile.waitForTimeout(1400);
  await mobile.screenshot({ path: path.join(OUT, '06-mobile-result.png'), fullPage: true });

  console.log(JSON.stringify({
    errors,
    searchRows: searchCount,
    bindTest: { before, after, calibValue },
    errorStageShown: errVisible
  }, null, 2));

  await browser.close();
})();
