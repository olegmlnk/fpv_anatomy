/* Smoke-тест: відкриває зібрану сторінку (dist/) на десктопній і мобільній ширині, проходить усі платформи й розділи
 * (3D-будова, Сигнали, Антени з ретранслятором, Пульт, Окуляри, Гайди), анімації, варіанти конфігуратора, сценарії
 * антенного стенду, ретранслятора й пульта, усі кроки гайдів і бічну панель.
 * Перевіряє помилки консолі та горизонтальне прокручування.
 * Запуск: npm install && npx playwright install chromium && npm test (спершу збирає dist/) */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const shotsDir = path.join(here, 'shots');
fs.mkdirSync(shotsDir, { recursive: true });
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('Немає dist/index.html — спершу npm run build'); process.exit(1); }

/* мінімальний статичний сервер для dist/: ES-модулі не відкриваються з file:// */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;

const PLATFORMS = ['p5', 'p7', 'p10', 'hex', 'whoop'];
const SLOTS = ['frame', 'motors', 'props', 'esc', 'fc', 'rx', 'vtx', 'vtxant', 'cam', 'battery', 'power', 'gps'];
const DEMO_STEPS = [
  '#dMot [data-mot="in"]', '#dMot [data-mot="out"]', '#dMot [data-mot="wrong"]', '#dMot [data-mot="bk:flip"]', '#dMot [data-mot="bm:0"]',
  '#dMot [data-mot="takeoff"]', '#dMot [data-mot="bk:dir"]', '#dMot [data-mot="flow"]', '#dMot [data-mot="flow"]', '#dMot [data-mot="test"]', '#dMot [data-mot="stop"]',
  '#dFC [data-fc="dfu"]', '#dFC [data-fc="run"]',
  '#dRX [data-rx="bind"]', '#dRX [data-rx="linked"]', '#dRX [data-rx="wifi"]', '#dRX [data-rx="nolink"]',
  '#tExplode', '#tExplode', '#tTour', '#tTour', '#tReset'
];
const CHAINS = ['ctrl', 'power', 'video', 'tele'];
const SCENARIOS = ['ok', 'lhcp', 'mix', 'roll', 'beam', 'over', 'band', 'far'];
const RELAY = ['none', 'top', 'analog', 'same', 'e9', 'low'];
const RADIO = ['trim', 'map', 'rev', 'arm3', 'early', 'fs', 'ok'];
const SWITCHES = ['SA', 'SB', 'SC', 'SD', 'SE', 'SF', 'SG'];
const GOG_AN = ['ch', 'pol', 'far', 'pit', 'sd', 'ok'];
const GOG_DG = ['bind', 'weak', 'ants', 'osd', 'heat', 'sd', 'ok'];
const GOG_KEYS = { an: ['aRW:press', 'aRW:up', 'aRW:press', 'aRW:down', 'aRW:hold', 'aRB:press', 'aLW:press', 'aRB:press', 'aLB:press', 'aLB:press', 'aPWR:press'], dg: ['d5D:press', 'd5D:down', 'd5D:right', 'dBACK:press', 'd5D:up', 'dBACK:press', 'd5D:down', 'd5D:press', 'dRV:double', 'dPWR:press'] };
const VIEWPORTS = [
  { name: 'desktop', full: true, viewport: { width: 1440, height: 900 } },
  { name: 'mobile', full: false, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let failed = false;
  for (const { name, full, ...opts } of VIEWPORTS) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errors.push(m.text()); });

    await page.goto(URL_BASE);
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
    /* пропелери: проп не того напряму на M1 → зліт закінчується переворотом, рама повертається на місце */
    await mode('build'); await click('#platTabs [data-plat="p5"]'); await page.waitForTimeout(300);
    await click('#dMot [data-mot="wrong"]'); await click('#dMot [data-mot="bk:dir"]'); await click('#dMot [data-mot="bm:0"]');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(shotsDir, `${name}-props.png`) });
    await click('#dMot [data-mot="takeoff"]');
    const toKind = await page.evaluate(() => window.__fpv.TO.on && window.__fpv.TO.kind);
    /* у програмному рендерингу кадри повільні, а крок анімації обмежено 0,1 с — чекаємо з запасом */
    await page.waitForFunction(() => !window.__fpv.TO.on, null, { timeout: 90000, polling: 500 }).catch(() => {});
    const takeoff = !webgl || (toKind === 'flip' && await page.evaluate(() => !window.__fpv.TO.on));
    await click('#dMot [data-mot="stop"]');

    await mode('antennas'); await page.waitForTimeout(400);
    for (const s of SCENARIOS) { await click(`#labScen [data-scen="${s}"]`); await page.waitForTimeout(250); }
    for (const ch of ['video', 'e24', 'e9']) { await click(`#labCh [data-ch="${ch}"]`); await page.waitForTimeout(200); }
    await overflow();
    const verdict = await page.$eval('#labVerdict b', el => el.textContent);
    await page.screenshot({ path: path.join(shotsDir, `${name}-antennas.png`) });

    /* ретранслятор */
    await click('#antSub [data-asub="relay"]'); await page.waitForTimeout(400);
    for (const s of RELAY) { await click(`#relScen [data-rscn="${s}"]`); await page.waitForTimeout(200); }
    await click('#relView [data-rview2="build"]'); await page.waitForTimeout(600);
    await click('#relView [data-rview2="link"]'); await page.waitForTimeout(200);
    let layers = true;
    for (const id of ['#relShade', '#relFres']) {
      await click(id); const off = await page.$eval(id, el => el.getAttribute('aria-pressed'));
      await click(id); const on = await page.$eval(id, el => el.getAttribute('aria-pressed'));
      layers = layers && off === 'false' && on === 'true';
    }
    await overflow();
    const relay = await page.$eval('#relVerdict b', el => el.textContent);
    await page.screenshot({ path: path.join(shotsDir, `${name}-relay.png`), timeout: 120000 });
    await click('#antSub [data-asub="lab"]'); await page.waitForTimeout(200);

    /* пульт: тумблери, сценарії, армування */
    await mode('radio'); await page.waitForTimeout(500);
    for (const sw of SWITCHES) { await click(`#radSw [data-rsw="${sw}"]`); await page.waitForTimeout(60); }
    for (const s of RADIO) { await click(`#radScen [data-rscen="${s}"]`); await page.waitForTimeout(200); }
    await click('#radSw [data-rsw="SF"]');
    await page.waitForFunction(() => window.__fpv.FCS.armed, null, { timeout: 8000 }).catch(() => {});
    const armed = await page.evaluate(() => window.__fpv.FCS.armed);
    for (const v of ['radio', 'drone', 'pilot']) if (webgl) { await click(`[data-rview="${v}"]`); await page.waitForTimeout(200); }
    await overflow();
    await page.screenshot({ path: path.join(shotsDir, `${name}-radio.png`) });

    /* окуляри: обидва типи, сценарії, кнопки, кроки інструкції */
    await mode('goggles'); await page.waitForTimeout(500);
    const goggles = {};
    for (const dev of ['an', 'dg']) {
      await click(`#gogDev [data-gdev="${dev}"]`); await page.waitForTimeout(200);
      for (const s of (dev === 'an' ? GOG_AN : GOG_DG)) { await click(`#gogScen [data-gscn="${s}"]`); await page.waitForTimeout(150); }
      for (const k of GOG_KEYS[dev]) { await click(`[data-gk="${k}"]`); await page.waitForTimeout(60); }
      const n = await page.$$eval('#gogSteps > li', l => l.length);
      for (let i = 1; i < n; i++) { await click('#gogNext'); await page.waitForTimeout(40); }
      for (const v of ['goggles', 'screen', 'both']) if (webgl) { await click(`[data-gview="${v}"]`); await page.waitForTimeout(150); }
      goggles[dev] = { steps: n, verdict: await page.$eval('#gogStat b', el => el.textContent) };
    }
    await overflow();
    await page.screenshot({ path: path.join(shotsDir, `${name}-goggles.png`), timeout: 120000 });

    /* гайди: усі кроки всіх трьох */
    await mode('guides'); await page.waitForTimeout(400);
    let steps = 0;
    for (const g of ['bf', 'tx', 'elrs']) {
      await click(`#gdTabs [data-gd="${g}"]`);
      const n = await page.$$eval('#gdSteps > li', l => l.length); steps += n;
      for (let i = 1; i < n; i++) { await click('#gdNext'); await page.waitForTimeout(40); }
    }
    await overflow();
    await page.screenshot({ path: path.join(shotsDir, `${name}-guides.png`) });

    await mode('build');
    await click('#bom [data-open="cam"]');
    await page.waitForTimeout(800);
    const drawerOpen = await page.evaluate(() => document.getElementById('drawer').classList.contains('open'));
    const videoPath = await page.$$eval('#drBody .vflow', els => els.length);
    await overflow();
    await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });

    const ok = errors.length === 0 && takeoff && drawerOpen && videoPath === 2 && maxOverflow <= 0 && !!verdict && !!relay && layers && armed && steps === 34 && goggles.an.steps === 10 && goggles.dg.steps === 10 && !!goggles.an.verdict && !!goggles.dg.verdict;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: webgl=${webgl} swaps=${swaps} drawer=${drawerOpen} videoPath=${videoPath} lab="${verdict}" relay="${relay}" layers=${layers} takeoff=${takeoff}(${toKind}) armed=${armed} goggles="${goggles.an.verdict}/${goggles.dg.verdict}" guideSteps=${steps} overflow=${maxOverflow}px errors=${errors.length}`);
    errors.forEach(e => console.log('  ' + e));
    if (!ok) failed = true;
    await ctx.close();
  }
  await browser.close(); server.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
