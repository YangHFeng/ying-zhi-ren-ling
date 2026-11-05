/**
 * tools/test-ui.js — 页面交互与解析流程自检（PBZS v3）
 *
 * 依赖：npm i -D playwright-core（并确保本机有 Playwright 的 Chromium）
 * 用法：
 *   python -m http.server 8765
 *   node tools/test-ui.js            # 用 samples/demo-pbzs.sav 跑示例流程
 *   node tools/test-ui.js --real     # 额外用真实存档跑一遍
 *
 * 真实存档路径可用环境变量覆盖：REAL_SAV=...
 * 截图输出到 shots/
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const EXE = 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const OUT = path.join(__dirname, '..', 'shots');
const BASE = process.env.BASE || 'http://127.0.0.1:8765/index.html';
const REAL_SAV = process.env.REAL_SAV || 'C:/Users/Administrator/Desktop/PBZSaveGame.sav';

const withReal = process.argv.includes('--real');

function attach(page, errors) {
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
}

/** 读取概览面板的可见文本，做关键字段断言 */
function readOverview(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const t = (s) => (q(s) ? q(s).textContent.trim() : null);
    return {
      name: t('#playerName'),
      region: t('#regionLine'),
      playH: t('#playTimeH'),
      playM: t('#playTimeM'),
      ring: t('#completionVal'),
      bossCards: document.querySelectorAll('#bossList .boss-card').length,
      slotCards: document.querySelectorAll('#slotGrid .slot-card').length,
      statTiles: document.querySelectorAll('#statGrid .stat').length,
      weaponChips: document.querySelectorAll('#weaponList .chip').length,
      itemChips: document.querySelectorAll('#itemList .chip').length,
      collectRows: document.querySelectorAll('#collectList .collect-item').length,
      bossNote: t('#bossNote'),
      slotNote: t('#slotNote')
    };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const errors = [];
  const result = {};

  /* ---------------- 桌面端：示例存档 ---------------- */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  attach(page, errors);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '01-upload.png'), fullPage: true });

  await page.click('#btnSample');
  await page.waitForSelector('#stageResult:not([hidden])', { timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, '02-result.png'), fullPage: true });
  result.demo = await readOverview(page);

  /* ---- 分享卡 ---- */
  const cardB64 = await page.evaluate(() => {
    const view = window.PBZApp.getView();
    const canvas = window.PBZ.ShareCard.draw(view, { dateText: '2026.11.05' });
    return canvas.toDataURL('image/png').split(',')[1];
  });
  fs.writeFileSync(path.join(OUT, 'card.png'), Buffer.from(cardB64, 'base64'));

  /* ---- 原始数据 + 搜索 ---- */
  await page.click('.tab[data-tab="raw"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '03-raw.png'), fullPage: true });

  await page.fill('#rawSearch', 'DiedTimes');
  await page.waitForTimeout(400);
  result.rawSearch = {
    query: 'DiedTimes',
    rows: await page.$$eval('#rawTree .tree-row', (r) => r.length),
    stat: (await page.textContent('#rawStat')).trim()
  };
  await page.screenshot({ path: path.join(OUT, '04-search.png'), fullPage: true });
  await page.fill('#rawSearch', '');

  /* ---- 槽位切换：挑一个「游玩档」而不是账户档 ---- */
  await page.click('.tab[data-tab="overview"]');
  await page.waitForTimeout(300);
  const slotCount = await page.$$eval('#slotGrid .slot-card', (c) => c.length);
  let switched = null;
  const target = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#slotGrid .slot-card')];
    const cur = cards.findIndex((c) => c.classList.contains('is-active'));
    const pick = cards.find((c) => !c.classList.contains('is-meta') && !c.classList.contains('is-active'));
    return pick ? { index: pick.getAttribute('data-slot'), current: cur } : null;
  });
  if (target) {
    const before = await page.textContent('#playTimeH');
    await page.click('#slotGrid .slot-card[data-slot="' + target.index + '"]');
    await page.waitForTimeout(700);
    const after = await page.textContent('#playTimeH');
    const active = await page.$eval('#slotGrid .slot-card.is-active', (e) => e.getAttribute('data-slot'));
    switched = { before, after, activeSlot: active, playableSlots: slotCount - 2 };
    await page.screenshot({ path: path.join(OUT, '05-slot-switch.png'), fullPage: true });
  }
  result.slotSwitch = switched;

  /* ---------------- 桌面端：真实存档 ---------------- */
  if (withReal && fs.existsSync(REAL_SAV)) {
    await page.click('#btnAgain');
    await page.waitForSelector('#stageUpload:not([hidden])');
    await page.setInputFiles('#fileInput', REAL_SAV);
    await page.waitForSelector('#stageResult:not([hidden])', { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '06-real-result.png'), fullPage: true });
    result.real = await readOverview(page);
    result.real.slots = await page.evaluate(() => window.PBZApp.getSlots());
    result.real.meta = await page.evaluate(() => {
      const dl = document.querySelector('#metaList');
      const out = {};
      dl.querySelectorAll('dt').forEach((dt, i) => {
        const dd = dl.querySelectorAll('dd')[i];
        if (dd) out[dt.textContent.trim()] = dd.textContent.trim();
      });
      return out;
    });
  }

  /* ---------------- 错误文件 ---------------- */
  if (!(await page.isVisible('#stageUpload'))) {
    await page.click('#btnAgain');
    await page.waitForSelector('#stageUpload:not([hidden])');
  }
  await page.setInputFiles('#fileInput', {
    name: 'random.sav',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('this is definitely not a pbzs container, just plain text padding...', 'utf8')
  });
  await page.waitForSelector('#stageError:not([hidden])', { timeout: 8000 }).catch(() => {});
  result.errorStage = {
    shown: await page.isVisible('#stageError'),
    title: (await page.textContent('#errTitle')).trim(),
    msg: (await page.textContent('#errMsg')).trim()
  };
  await page.screenshot({ path: path.join(OUT, '07-error.png'), fullPage: true });

  /* ---------------- 移动端 ---------------- */
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
  attach(mobile, errors);
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.screenshot({ path: path.join(OUT, '08-mobile-upload.png'), fullPage: true });
  await mobile.click('#btnSample');
  await mobile.waitForSelector('#stageResult:not([hidden])', { timeout: 20000 });
  await mobile.waitForTimeout(1000);
  await mobile.screenshot({ path: path.join(OUT, '09-mobile-result.png'), fullPage: true });
  // 首屏（主卡）单独截一张，便于核对层级与对比度
  await mobile.screenshot({ path: path.join(OUT, '10-mobile-hero.png') });

  result.errors = errors;
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error('[test-ui] 失败：', e);
  process.exit(2);
});
