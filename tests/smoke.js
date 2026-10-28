/* Smoke-тест: відкриває сторінку на десктопній і мобільній ширині, проходить анімації,
 * усі варіанти конфігуратора й бічну панель, перевіряє помилки консолі та горизонтальне прокручування.
 * Запуск: npm install && npx playwright install chromium && npm test */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');
const shotsDir = path.join(__dirname, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });

// Якщо three@0.128.0 встановлено як devDependency, тест не залежить від CDN.
let threeLocal = null;
try { threeLocal = require.resolve('three/build/three.min.js', { paths: [root] }); } catch (e) { threeLocal = null; }

const SLOTS = ['frame', 'motors', 'props', 'esc', 'fc', 'rx', 'vtx', 'vtxant', 'cam', 'battery', 'power', 'gps'];
const STEPS = [
  '#dMot [data-mot="in"]', '#dMot [data-mot="out"]', '#dMot [data-mot="test"]', '#dMot [data-mot="stop"]',
  '#dFC [data-fc="dfu"]', '#dFC [data-fc="run"]',
  '#dRX [data-rx="bind"]', '#dRX [data-rx="linked"]', '#dRX [data-rx="wifi"]', '#dRX [data-rx="nolink"]',
  '#tExplode', '#tExplode', '#tSignals', '#tSignals', '#tTour', '#tTour', '#tReset'
];
const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = false;
  for (const { name, ...opts } of VIEWPORTS) {
    const ctx = await browser.newContext(opts);
    if (threeLocal) {
      await ctx.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({
        path: threeLocal, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }
      }));
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });

    await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
    await page.waitForFunction(() => document.querySelectorAll('#bom li[data-id]').length === 12, null, { timeout: 20000 });
    await page.waitForTimeout(2000);
    const webgl = await page.evaluate(() => document.getElementById('fallback').hidden);
    const click = sel => page.$eval(sel, el => el.click());

    for (const sel of STEPS) { await click(sel); await page.waitForTimeout(250); }
    let swaps = 0;
    for (const slot of SLOTS) {
      const ids = await page.$$eval(`#slot-${slot} input[type=radio]`, els => els.filter(e => !e.disabled).map(e => e.id));
      for (const id of ids) { await click('#' + id); swaps++; await page.waitForTimeout(120); }
    }
    await click('#bom [data-open="motors"]');
    await page.waitForTimeout(800);
    const drawerOpen = await page.evaluate(() => document.getElementById('drawer').classList.contains('open'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });

    const ok = errors.length === 0 && drawerOpen && overflow <= 0;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: webgl=${webgl} swaps=${swaps} drawer=${drawerOpen} overflow=${overflow}px errors=${errors.length}`);
    errors.forEach(e => console.log('  ' + e));
    if (!ok) failed = true;
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
