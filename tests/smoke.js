/* Smoke-тест: відкриває сторінку на десктопній і мобільній ширині, проходить усі платформи й режими
 * (3D-будова, Сигнали, Антени), анімації, варіанти конфігуратора, сценарії антенного стенду й бічну панель.
 * Перевіряє помилки консолі та горизонтальне прокручування.
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

const PLATFORMS = ['p5', 'p7', 'p10', 'hex', 'whoop'];
const SLOTS = ['frame', 'motors', 'props', 'esc', 'fc', 'rx', 'vtx', 'vtxant', 'cam', 'battery', 'power', 'gps'];
const DEMO_STEPS = [
  '#dMot [data-mot="in"]', '#dMot [data-mot="out"]', '#dMot [data-mot="test"]', '#dMot [data-mot="stop"]',
  '#dFC [data-fc="dfu"]', '#dFC [data-fc="run"]',
  '#dRX [data-rx="bind"]', '#dRX [data-rx="linked"]', '#dRX [data-rx="wifi"]', '#dRX [data-rx="nolink"]',
  '#tExplode', '#tExplode', '#tTour', '#tTour', '#tReset'
];
const CHAINS = ['ctrl', 'power', 'video', 'tele'];
const SCENARIOS = ['ok', 'lhcp', 'mix', 'roll', 'beam', 'over', 'band', 'far'];
const VIEWPORTS = [
  { name: 'desktop', full: true, viewport: { width: 1440, height: 900 } },
  { name: 'mobile', full: false, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = false;
  for (const { name, full, ...opts } of VIEWPORTS) {
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
    const mode = m => click(`#modeTabs [data-mode="${m}"]`);
    let swaps = 0, maxOverflow = 0;
    const overflow = async () => { const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); maxOverflow = Math.max(maxOverflow, o); };

    for (const p of (full ? PLATFORMS : ['p5', 'hex', 'whoop'])) {
      await mode('build');
      await click(`#platTabs [data-plat="${p}"]`); await page.waitForTimeout(400);
      for (const sel of DEMO_STEPS) { await click(sel); await page.waitForTimeout(150); }
      if (full) for (const slot of SLOTS) {
        const ids = await page.$$eval(`#slot-${slot} input[type=radio]`, els => els.filter(e => !e.disabled).map(e => e.id));
        for (const id of ids) { await click('#' + id); swaps++; await page.waitForTimeout(80); }
      }
      await overflow();
      await mode('signals'); await page.waitForTimeout(400);
      for (const c of CHAINS) { await click(`#sigTabs [data-chain="${c}"]`); await click('#sigNext'); await click('#sigNext'); await page.waitForTimeout(150); }
      await overflow();
    }
    await mode('antennas'); await page.waitForTimeout(400);
    for (const s of SCENARIOS) { await click(`#labScen [data-scen="${s}"]`); await page.waitForTimeout(250); }
    for (const ch of ['video', 'e24', 'e9']) { await click(`#labCh [data-ch="${ch}"]`); await page.waitForTimeout(200); }
    await overflow();
    const verdict = await page.$eval('#labVerdict b', el => el.textContent);
    await page.screenshot({ path: path.join(shotsDir, `${name}-antennas.png`) });

    await mode('build');
    await click('#bom [data-open="cam"]');
    await page.waitForTimeout(800);
    const drawerOpen = await page.evaluate(() => document.getElementById('drawer').classList.contains('open'));
    const videoPath = await page.$$eval('#drBody .vflow', els => els.length);
    await overflow();
    await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });

    const ok = errors.length === 0 && drawerOpen && videoPath === 2 && maxOverflow <= 0 && !!verdict;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: webgl=${webgl} swaps=${swaps} drawer=${drawerOpen} videoPath=${videoPath} lab="${verdict}" overflow=${maxOverflow}px errors=${errors.length}`);
    errors.forEach(e => console.log('  ' + e));
    if (!ok) failed = true;
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
