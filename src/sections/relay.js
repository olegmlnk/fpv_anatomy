/* Курс по БПЛА · розділ «Антени» → «Ретранслятор»: зв’язок станції з дроном за горою напряму й через
 * ретранслятор на вершині; бюджет кожного прольоту, дифракція на перешкоді, цифровий і аналоговий ретранслятор,
 * розв’язка частот. Місцевість — лісистий хребет із полониною на вершині, передгір’я, озеро, дорога, поля, небо.
 * Анімація будови ретранслятора й проходження сигналу через його вузли. */
import * as T from 'three';
import { fmt } from '../data/options.js';
import { box, C, camera, css, cyl, glowSprite, narrowMQ, ok3d, reduceMotion, scene, TC, TEX, UP } from '../engine/core.js';
import { fitDist, label, LB, S, setView, smooth, updateSpinBtn } from '../engine/anim.js';
import { ctl } from '../engine/demos.js';
import { clamp, dbm, fmt1, fmtKm, LAB, labApply, labFrame, labG, labReadout, labSolve, LCH, LM, mesh, pressSeg, rod, sgn1 } from './antlab.js';
import { $, onModeUI, setHTML, setText } from '../ui/ui.js';

/* ================= РЕТРАНСЛЯТОР ================= */
export const RLY = {
  ch: 'e24', on: true, kind: 'digital', freq: 'diff', d1: 1.5, d2: 2.0, hill: 120, alt: 40, pw: { e24: 250, e9: 250, video: 600 },
  view: 'link', ex: 0, t: 0, scen: 'top', res: null, dirty: true, fres: true, shade: true
};
/* підсилення антен (дБі): станція, ретранслятор (кожна з двох), дрон */
const RLY_G = { e24: { st: 2.15, rep: 2.15, dr: 2.15, ant: 'диполі' }, e9: { st: 2.15, rep: 2.15, dr: 2.15, ant: 'диполі' }, video: { st: 8.5, rep: 8.5, dr: 2.2, ant: 'патчі на станції й ретрансляторі, Lollipop на дроні' } };
const RLY_SCEN = [
  { id: 'none', name: 'Без ретранслятора', set: { on: false, ch: 'e24', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Дрон за горою: пряма лінія впирається в схил. Сигнал лише огинає вершину (дифракція), втрачаючи десятки децибел, — керування немає, хоча до дрона лише 3,5 км.' },
  { id: 'top', name: 'Ретранслятор на вершині', set: { on: true, kind: 'digital', freq: 'diff', ch: 'e24', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Ретранслятор на полонині на вершині бачить і станцію, і дрон. Кожен проліт має пряму видимість і власний бюджет; цифровий ретранслятор відновлює пакети, тож загальний запас дорівнює запасу слабшого прольоту.' },
  { id: 'analog', name: 'Аналоговий', set: { on: true, kind: 'analog', freq: 'diff', ch: 'video', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Аналоговий відеоретранслятор підсилює сигнал разом із шумом першого прольоту. Шуми прольотів додаються, тож картинка гірша, ніж на слабшому прольоті окремо, — до 3 дБ, коли прольоти рівні.' },
  { id: 'same', name: 'Той самий канал', set: { on: true, kind: 'digital', freq: 'same', ch: 'e24', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Ретранслятор приймає й передає на тому самому каналі одночасно. Його власний передавач за метр від приймальної антени в мільйони разів сильніший за сигнал станції — приймач глухне. Потрібні різні частоти з фільтрами або почергова робота (TDD).' },
  { id: 'e9', name: '900 МГц огинає', set: { on: false, ch: 'e9', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Та сама гора на 868/915 МГц: довша хвиля краще огинає вершину, а чутливість вища. Пряма лінія працює навіть без ретранслятора, хоча запас невеликий і сильно залежить від рельєфу.' },
  { id: 'low', name: 'Низький пагорб', set: { on: false, ch: 'e24', d1: 1.5, d2: 2, hill: 25, alt: 60 }, note: 'Пагорб 25 м, дрон на 60 м: пряма лінія проходить над вершиною, лише трохи зачіпаючи зону Френеля. Ретранслятор тут не потрібен.' }
];
const RLY_PARTS = [
  { id: 'antRx', name: 'Антена прийому', d: 'f1 від станції', ex: [-3.6, 1.3, 0] },
  { id: 'fRx', name: 'Фільтр f1', d: 'лише частота прийому', ex: [-2.7, -0.9, 1.3] },
  { id: 'rx', name: 'Приймач', d: 'демодулює f1', ex: [-1.5, 0.35, 1.9] },
  { id: 'mcu', name: 'Обробка', d: 'декодує або підсилює', ex: [0, 1.5, 2.0] },
  { id: 'tx', name: 'Передавач', d: 'сигнал f2', ex: [1.5, 0.35, 1.9] },
  { id: 'fTx', name: 'Фільтр f2', d: 'чистить спектр', ex: [2.7, -0.9, 1.3] },
  { id: 'antTx', name: 'Антена передачі', d: 'f2 до дрона', ex: [3.6, 1.3, 0] },
  { id: 'pwr', name: 'Живлення', d: 'батарея, DC-DC, сонячна панель', ex: [0, -1.5, 1.6] }
];

/* ---------- фізика ---------- */
/* дифракція на одиночній «ножовій» перешкоді, ITU-R P.526: v = h·√(2(d1+d2)/(λ·d1·d2)) */
function knifeLoss(h, d1m, d2m, lam) {
  const v = h * Math.sqrt(2 * (d1m + d2m) / (lam * d1m * d2m));
  return { v, j: v <= -0.78 ? 0 : 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) * (v - 0.1) + 1) + v - 0.1) };
}
const fsplDb = (km, f) => 20 * Math.log10(Math.max(km, 0.001)) + 20 * Math.log10(f) + 32.44;
export function relSolve() {
  const c = LCH[RLY.ch], G = RLY_G[RLY.ch], pw = RLY.pw[RLY.ch], ptx = dbm(pw);
  const sens = c.rates ? c.rates.find(q => q[0] === LAB.rate[RLY.ch])[1] : c.sens;
  const lam = 299.792458 / c.f, hS = 5, hR = RLY.hill + 3, D = RLY.d1 + RLY.d2;
  /* пряма лінія станція → дрон над вершиною */
  const yLine = hS + (RLY.alt - hS) * RLY.d1 / D, hObs = RLY.hill - yLine;
  const kd = knifeLoss(hObs, RLY.d1 * 1000, RLY.d2 * 1000, lam);
  const dDir = Math.hypot(D, (RLY.alt - hS) / 1000), fDir = fsplDb(dDir, c.f);
  const vid = RLY.ch === 'video';
  const mDir = ptx + G.st + G.dr - fDir - kd.j - sens;
  /* прольоти з вершини: пряма видимість; радіус першої зони Френеля посередині */
  const d1s = Math.hypot(RLY.d1, (hR - hS) / 1000), d2s = Math.hypot(RLY.d2, (hR - RLY.alt) / 1000);
  const f1 = fsplDb(d1s, c.f), f2 = fsplDb(d2s, c.f);
  const m1 = ptx + G.st + G.rep - f1 - sens, m2 = ptx + G.rep + G.dr - f2 - sens;
  const fr = km => 0.5 * Math.sqrt(lam * km * 1000);
  let mRel, why = '';
  if (RLY.freq === 'same') { mRel = Math.min(m1, m2) - 75; why = 'self'; }
  else if (RLY.kind === 'analog') mRel = -10 * Math.log10(Math.pow(10, -m1 / 10) + Math.pow(10, -m2 / 10));
  else mRel = Math.min(m1, m2);
  const margin = RLY.on ? mRel : mDir;
  const lat = c.rates ? 1000 / LAB.rate[RLY.ch] : 0;
  return { c, G, pw, ptx, sens, lam, D, hObs, kd, dDir, fDir, mDir, d1s, d2s, f1, f2, m1, m2, mRel, margin, why, vid, lat, fr1: fr(d1s), fr2: fr(d2s), frD: fr(dDir), yLine };
}
function relVerdict(m) {
  const vid = RLY.ch === 'video';
  if (m >= 10) return { cls: 'ok', t: 'Сходяться', s: vid ? 'чиста картинка із запасом' : 'стабільне керування із запасом' };
  if (m >= 0) return { cls: 'warn', t: 'На межі', s: vid ? 'шум і провали картинки' : 'LQ падає, можливий failsafe' };
  return { cls: 'bad', t: 'Не сходяться', s: vid ? 'картинки немає' : 'failsafe — дрон без керування' };
}
function relReasons(r) {
  const out = [];
  if (r.hObs > 0) out.push(['bad', `Пряма лінія станція → дрон проходить на ${fmt(Math.round(r.hObs))} м нижче вершини. Сигнал лише огинає її: дифракція −${fmt1(r.kd.j)} дБ (параметр v = ${fmt1(r.kd.v)}).`]);
  else if (r.kd.j > 0.5) out.push(['warn', `Пряма лінія проходить над вершиною, але зачіпає першу зону Френеля (радіус посередині ≈${fmt(Math.round(r.frD))} м): −${fmt1(r.kd.j)} дБ.`]);
  else out.push(['ok', 'Між станцією й дроном пряма видимість із вільною зоною Френеля — перешкода не заважає.']);
  if (RLY.on) {
    out.push([r.m1 >= 10 ? 'ok' : r.m1 >= 0 ? 'warn' : 'bad', `Проліт 1 (станція → ретранслятор, ${fmtKm(r.d1s)}): пряма видимість, втрати ${fmt1(r.f1)} дБ, запас ${sgn1(r.m1)} дБ.`]);
    out.push([r.m2 >= 10 ? 'ok' : r.m2 >= 0 ? 'warn' : 'bad', `Проліт 2 (ретранслятор → дрон, ${fmtKm(r.d2s)}): втрати ${fmt1(r.f2)} дБ, запас ${sgn1(r.m2)} дБ.`]);
    if (r.why === 'self') out.push(['bad', 'Приймання й передача на одному каналі одночасно: власний передавач ретранслятора глушить його приймач. Рішення — різні частоти з фільтрами (дуплексер) або почергова робота в часі (TDD).']);
    else if (RLY.kind === 'analog') out.push(['warn', `Аналоговий ретранслятор передає далі й шум першого прольоту: загальний запас ${sgn1(r.mRel)} дБ — гірший за слабший проліт (${sgn1(Math.min(r.m1, r.m2))} дБ).`]);
    else out.push(['info', `Цифровий ретранслятор декодує пакети й передає їх заново: шум не накопичується, загальний запас — як у слабшого прольоту (${sgn1(r.mRel)} дБ).${r.lat ? ` Ціна — затримка: ще ≈1 інтервал пакета (${fmt(r.lat)} мс при ${LAB.rate[RLY.ch]} Гц) плюс обробка.` : ''}`]);
    if (r.why !== 'self') out.push(['info', 'Канал керування двосторонній: команди йдуть від станції до дрона, телеметрія — назад. Ретранслятор передає обидва напрямки, кожен на своїй частоті.']);
  } else if (r.mDir < 10) out.push(['info', 'Увімкніть ретранслятор: на вершині він бачить обидва кінці лінії.']);
  out.push(['info', `${r.c.name}: довжина хвилі ${fmt(Math.round(r.lam * 100))} см. Що довша хвиля, то краще вона огинає перешкоди й то менші втрати на відстані.`]);
  return out;
}

/* ================= 3D: МІСЦЕВІСТЬ ================= */
/* Сцена стиснута по горизонталі (логарифмічно) й розтягнута по вертикалі (RL.V одиниць на метр);
 * хребет іде поперек лінії зв’язку, вершина — у точці (0, 0). */
let relG = null, relScen = null, relTer = null, relTreeC = null, relTreeD = null, relRocks = null, relSky = null, relHemi = null, relSite = null, relLightBk = null;
let relStA, relDrA, relRepG, relParts = {}, relLines = {}, relPk = [], relShadow, relFres = [], relFlow = [];
const RL = { V: 0.2, W: 440, D: 340, NX: 176, NZ: 136, H: 0 };
if (narrowMQ.matches) { RL.NX = 132; RL.NZ = 102; }
const RL_LAKE = { x: -76, z: -46, r: 16 };
const RL_ROAD = [[-14, 9], [-38, 6.8], [-60, 10], [-92, 24], [-130, 40], [-178, 52], [-240, 68]];
const relX = km => 22 + 16 * Math.log(1 + km);

/* ---------- шум ---------- */
function rlHash(i, j) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function rlNoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = rlHash(i, j), b = rlHash(i + 1, j), c = rlHash(i, j + 1), d = rlHash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function rlFbm(x, z, o) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let k = 0; k < o; k++) { s += a * rlNoise(x * f + k * 17.3, z * f - k * 9.1); n += a; f *= 2.03; a *= 0.5; }
  return s / n;
}
/* форма хребта 0…1, вершина рівно 1 у (0, 0); схили увігнуті. Від вершини гребінь із сідловинами йде вдалину (−z),
 * а до глядача (+z) спускається короткий відріг — з типового ракурсу видно обидві долини */
function rlMount(x, z) {
  const az = Math.abs(z), r = Math.hypot(x, z);
  const wob = 8 * (rlFbm(z * 0.012 + 3.7, 1.3, 3) - 0.5) * smooth(0, 60, az);
  const crest = z <= 0
    ? (1 - 0.34 * smooth(4, 120, az) * rlFbm(z * 0.016 + 9.1, 4.2, 3) - 0.22 * smooth(70, 200, az)) * (1 - smooth(112, 162, az))
    : (1 - smooth(5, 62, z) * (0.86 + 0.1 * rlFbm(z * 0.03 + 2.2, 6.1, 2))) * (1 - smooth(100, 150, z));
  const w = 12 + 6 * rlFbm(z * 0.018 + 1.9, 7.7, 2);
  const m = crest * Math.exp(-Math.pow(Math.abs(x - wob) / w, 1.25));
  return m * (1 + 0.09 * (rlFbm(x * 0.13 + 5.2, z * 0.13 + 2.4, 3) - 0.5) * smooth(4, 16, r));
}
/* передгір’я й низина (одиниці сцени): тихіше вздовж лінії зв’язку, улоговина озера, край — до рівня рівнини */
function rlLow(x, z, m) {
  let f = (rlFbm(x * 0.03 + 11.3, z * 0.03 + 7.1, 4) - 0.45) * 8;
  f *= (0.3 + 0.7 * smooth(4, 26, Math.abs(z))) * (1 - Math.min(1, m * 1.6));
  const dl = Math.hypot(x - RL_LAKE.x, z - RL_LAKE.z) / RL_LAKE.r;
  if (dl < 2) {
    const nat = f + (Math.max(f, -0.5) - f) * (1 - smooth(1.6, 2, dl));
    f = dl < 1 ? -1.05 - 1.7 * (1 - dl * dl) : -1.05 + (nat + 1.05) * smooth(1, 1.7, dl);
  }
  const e = Math.max(Math.abs(x) / (RL.W / 2), Math.abs(z) / (RL.D / 2)), k = smooth(0.84, 0.99, e);
  return f * (1 - k) - 1.2 * k;
}
function relGround(x, z) { const m = rlMount(x, z); return RL.H * m + rlLow(x, z, m); }
function rlRoadDist(x, z) {
  let best = 1e9;
  for (let i = 0; i < RL_ROAD.length - 1; i++) {
    const [ax, az] = RL_ROAD[i], [bx, bz] = RL_ROAD[i + 1], dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1), px = ax + dx * t - x, pz = az + dz * t - z;
    best = Math.min(best, px * px + pz * pz);
  }
  return Math.sqrt(best);
}
/* поля в долині: смуги культур, межі — трава */
function rlField(x, z) {
  if (x > -64 || rlNoise(x * 0.018 + 40, z * 0.018 - 12) < 0.56) return null;
  const a = 0.5, u = x * Math.cos(a) + z * Math.sin(a), v = -x * Math.sin(a) + z * Math.cos(a);
  const fu = u / 34, fv = v / 26;
  if (Math.abs(fu - Math.round(fu)) < 0.035 || Math.abs(fv - Math.round(fv)) < 0.045) return null;
  const kind = rlHash(Math.floor(fu) + 99, Math.floor(fv) - 7), st = ((Math.floor(u / 2.6) % 2) + 2) % 2;
  const pal = kind < 0.4 ? ['#c9b467', '#b9a35a'] : kind < 0.72 ? ['#8fb55b', '#80a64f'] : ['#8c7252', '#7c6447'];
  return pal[st];
}
/* густота лісу: на схилах — суцільний ліс, над межею лісу — полонина */
const rlForest = (x, z, m) => rlFbm(x * 0.021 + 21, z * 0.021 + 13, 4) + 0.24 * smooth(0.04, 0.28, m) - 0.3 * smooth(0.6, 0.73, m);

/* ---------- рельєф ---------- */
function relBuildTerrain() {
  const g = new T.PlaneGeometry(RL.W, RL.D, RL.NX, RL.NZ); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, n = p.count;
  const M = new Float32Array(n), Lo = new Float32Array(n), base = new Float32Array(n * 3), wet = new Float32Array(n);
  const G1 = C('#557f36'), G2 = C('#6f9442'), FO = C('#3a5a28'), RD = C('#9a8158'), SA = C('#c4b382'), BED = C('#4f5f47'), c = new T.Color();
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i), m = rlMount(x, z);
    M[i] = m; Lo[i] = rlLow(x, z, m);
    c.copy(G1).lerp(G2, rlNoise(x * 0.09 + 3, z * 0.09 + 8));
    c.lerp(FO, smooth(0.45, 0.6, rlForest(x, z, m)) * 0.8);
    let w = 0;
    const fc = rlField(x, z); if (fc) { c.copy(C(fc)); w = 1; }
    const rd = rlRoadDist(x, z); if (rd < 2.3) { const k = 1 - smooth(1.0, 2.3, rd); c.lerp(RD, k); w = Math.max(w, k); }
    const dl = Math.hypot(x - RL_LAKE.x, z - RL_LAKE.z) / RL_LAKE.r;
    if (dl < 1.35) { const k = 1 - smooth(1.05, 1.35, dl); c.lerp(dl < 0.97 ? BED : SA, k); w = Math.max(w, k); }
    base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b; wet[i] = w;
  }
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(n * 3), 3));
  relTer = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }));
  relTer.userData = { M, Lo, base, wet };
  relScen.add(relTer);
}
/* висота гори змінює рельєф: висоти, кольори (скелі на крутих схилах, полонина вгорі), нормалі, дерева */
function relTerrainUpdate() {
  if (!relTer) return;
  RL.H = RLY.hill * RL.V;
  const g = relTer.geometry, p = g.attributes.position, col = g.attributes.color.array, { M, Lo, base, wet } = relTer.userData;
  const n = p.count, NX = RL.NX + 1, dx = RL.W / RL.NX, dz = RL.D / RL.NZ, H = RL.H, y = p.array;
  for (let i = 0; i < n; i++) y[i * 3 + 1] = H * M[i] + Lo[i];
  const ROCK = C('#7a7468'), MEAD = C('#8da354'), c = new T.Color();
  for (let i = 0; i < n; i++) {
    const ix = i % NX, iz = (i / NX) | 0;
    const l = ix > 0 ? i - 1 : i, r = ix < NX - 1 ? i + 1 : i, u = iz > 0 ? i - NX : i, d = iz < RL.NZ ? i + NX : i;
    const sx = (y[r * 3 + 1] - y[l * 3 + 1]) / (((r - l) || 1) * dx), sz = (y[d * 3 + 1] - y[u * 3 + 1]) / ((((d - u) / NX) || 1) * dz);
    const slope = Math.hypot(sx, sz), free = 1 - wet[i];
    c.setRGB(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
    c.lerp(MEAD, smooth(0.68, 0.8, M[i]) * free * 0.75);
    c.lerp(ROCK, smooth(1.8, 3.4, slope) * free * 0.85);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  p.needsUpdate = true; g.attributes.color.needsUpdate = true;
  g.computeVertexNormals(); g.computeBoundingSphere();
  relPlaceTrees();
}
/* ---------- ліс і каміння ---------- */
function rlMerge(parts) {
  const pos = [], col = [];
  for (const q of parts) {
    const g = q.geo.index ? q.geo.toNonIndexed() : q.geo;
    if (q.s) g.scale(q.s[0], q.s[1], q.s[2]);
    g.translate(q.p[0], q.p[1], q.p[2]);
    const a = g.attributes.position, c = C(q.c);
    for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
function relBuildTrees() {
  /* низькополігональні: відкриті конуси без донець, крона з ікосаедрів */
  const coneGeo = rlMerge([
    { geo: cyl(0.09, 0.13, 0.7, 5, true), c: '#5b4232', p: [0, 0.35, 0] },
    { geo: new T.ConeGeometry(0.64, 1.15, 8, 1, true), c: '#2b5331', p: [0, 1.05, 0] },
    { geo: new T.ConeGeometry(0.5, 1.0, 8, 1, true), c: '#315c37', p: [0, 1.6, 0] },
    { geo: new T.ConeGeometry(0.34, 0.85, 7, 1, true), c: '#38663d', p: [0, 2.15, 0] }
  ]);
  const leafGeo = rlMerge([
    { geo: cyl(0.1, 0.15, 1.0, 5, true), c: '#5e4634', p: [0, 0.5, 0] },
    { geo: new T.IcosahedronGeometry(0.88, 0), c: '#4c7a37', p: [0, 1.55, 0], s: [1, 0.85, 1] },
    { geo: new T.IcosahedronGeometry(0.58, 0), c: '#578640', p: [0.35, 1.98, 0.15] },
    { geo: new T.IcosahedronGeometry(0.5, 0), c: '#4f7f39', p: [-0.32, 1.85, -0.2] }
  ]);
  const step = narrowMQ.matches ? 5.4 : 4.1, A = [], B = [], R = [];
  for (let gx = -176; gx <= 176; gx += step) for (let gz = -142; gz <= 142; gz += step) {
    const r1 = rlHash(Math.round(gx * 10), Math.round(gz * 10)), r2 = rlHash(Math.round(gz * 7) + 3, Math.round(gx * 13) - 5), r3 = rlHash(Math.round(gx * 3) - 11, Math.round(gz * 5) + 17);
    const x = gx + (r1 - 0.5) * step * 0.9, z = gz + (r2 - 0.5) * step * 0.9;
    if ((x / 178) ** 2 + (z / 144) ** 2 > 1) continue;
    const m = rlMount(x, z);
    /* каміння: на полонині й крутих місцях вершини */
    if (m > 0.62 && r3 < 0.1 && Math.hypot(x, z) > 5) { R.push({ x, z, m, lo: rlLow(x, z, m), s: [0.5 + r1 * 1.3, 0.35 + r2 * 0.7, 0.5 + r3 * 9], ry: r2 * 6.283 }); continue; }
    if (m > 0.74 || Math.hypot(x - RL_LAKE.x, z - RL_LAKE.z) < RL_LAKE.r * 1.25) continue;
    if (x > -60 && x < -14 && Math.abs(z) < 12) continue;
    if (rlRoadDist(x, z) < 3 || rlField(x, z)) continue;
    if (r3 > (rlForest(x, z, m) > 0.5 ? 0.9 : 0.035)) continue;
    const e = 0.05, lo = rlLow(x, z, m);
    const gm = [(rlMount(x + e, z) - rlMount(x - e, z)) / (2 * e), (rlMount(x, z + e) - rlMount(x, z - e)) / (2 * e)];
    const gl = [(rlLow(x + e, z, m) - rlLow(x - e, z, m)) / (2 * e), (rlLow(x, z + e, m) - rlLow(x, z - e, m)) / (2 * e)];
    const cone = rlHash(Math.round(x * 31), Math.round(z * 17)) < 0.3 + 0.62 * smooth(0.03, 0.3, m);
    (cone ? A : B).push({ x, z, m, lo, gm, gl, s: 0.78 + 0.5 * r1 * r2 + 0.3 * r3, ry: r2 * 6.283, tint: [0.84 + 0.28 * r1, 0.86 + 0.24 * r3, 0.8 + 0.28 * r2] });
  }
  const mk = (geo, list, mat) => {
    const im = new T.InstancedMesh(geo, mat, Math.max(1, list.length));
    im.frustumCulled = false; im.userData.list = list; im.count = list.length;
    const c = new T.Color();
    list.forEach((t, i) => { c.setRGB(t.tint[0], t.tint[1], t.tint[2]); im.setColorAt(i, c); });
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    relScen.add(im); return im;
  };
  const treeM = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  relTreeC = mk(coneGeo, A, treeM); relTreeD = mk(leafGeo, B, treeM);
  R.forEach(t => { t.tint = [0.9 + rlHash(Math.round(t.x * 9), 3) * 0.2, 0.9, 0.88]; });
  relRocks = mk(new T.IcosahedronGeometry(1, 0), R, new T.MeshStandardMaterial({ color: C('#8a857c'), roughness: 0.95, flatShading: true }));
}
function relPlaceTrees() {
  if (!relTreeC) return;
  const H = RL.H, m4 = new T.Matrix4(), q = new T.Quaternion(), s = new T.Vector3(), pos = new T.Vector3(), up = new T.Vector3(0, 1, 0);
  for (const im of [relTreeC, relTreeD]) {
    im.userData.list.forEach((t, i) => {
      const slope = Math.hypot(H * t.gm[0] + t.gl[0], H * t.gm[1] + t.gl[1]), k = slope > 3.6 ? 0 : t.s;
      pos.set(t.x, H * t.m + t.lo - 0.12, t.z); q.setFromAxisAngle(up, t.ry); s.set(k, k * (0.92 + 0.3 * (t.s - 0.78)), k);
      im.setMatrixAt(i, m4.compose(pos, q, s));
    });
    im.instanceMatrix.needsUpdate = true;
  }
  relRocks.userData.list.forEach((t, i) => {
    pos.set(t.x, H * t.m + t.lo - 0.25 * t.s[1], t.z); q.setFromAxisAngle(up, t.ry); s.set(t.s[0], t.s[1], t.s[2]);
    relRocks.setMatrixAt(i, m4.compose(pos, q, s));
  });
  relRocks.instanceMatrix.needsUpdate = true;
}
/* ---------- небо, далекі хребти, озеро, хмари ---------- */
function relBuildSky() {
  const g = new T.SphereGeometry(1, 32, 20);
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  relSky = new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
  relSky.scale.setScalar(820); relSky.renderOrder = -10; relSky.frustumCulled = false; relScen.add(relSky);
  /* дві гряди далеких гір по колу — у серпанку туману */
  const pos = [], col = [], N = 128, lo = C('#5b7653'), hi = C('#8796a1'), c = new T.Color();
  [[410, 26, 30, 0], [540, 48, 46, 1]].forEach(([R, base, amp, k]) => {
    const hgt = a => base + amp * (rlFbm(Math.cos(a) * 3 + k * 9 + 40, Math.sin(a) * 3 + k * 5, 4) - 0.35) * 1.7;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * Math.PI * 2, a1 = (i + 1) / N * Math.PI * 2, h0 = hgt(a0), h1 = hgt(a1);
      const b0 = [Math.cos(a0) * R, -3, Math.sin(a0) * R], b1 = [Math.cos(a1) * R, -3, Math.sin(a1) * R];
      const t0 = [Math.cos(a0) * (R - h0 * 1.4), h0, Math.sin(a0) * (R - h0 * 1.4)], t1 = [Math.cos(a1) * (R - h1 * 1.4), h1, Math.sin(a1) * (R - h1 * 1.4)];
      for (const v of [b0, t0, b1, b1, t0, t1]) { pos.push(v[0], v[1], v[2]); c.copy(lo).lerp(hi, clamp(v[1] / (base + amp), 0, 1)); col.push(c.r, c.g, c.b); }
    }
  });
  const fg = new T.BufferGeometry(); fg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); fg.setAttribute('color', new T.Float32BufferAttribute(col, 3)); fg.computeVertexNormals();
  relScen.add(new T.Mesh(fg, new T.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: T.DoubleSide })));
  const plain = new T.Mesh(new T.CircleGeometry(900, 64), new T.MeshStandardMaterial({ color: C('#5f8a3e'), roughness: 1 }));
  plain.rotation.x = -Math.PI / 2; plain.position.y = -1.3; relScen.add(plain);
  const water = new T.Mesh(new T.CircleGeometry(RL_LAKE.r * 1.04, 48), new T.MeshStandardMaterial({ color: C('#4d7c8f'), roughness: 0.1, metalness: 0.15, transparent: true, opacity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(RL_LAKE.x, -1.02, RL_LAKE.z); relScen.add(water);
  for (let i = 0; i < 9; i++) {
    const a = rlHash(i, 5) * Math.PI * 2, R = 170 + rlHash(i, 9) * 230, cy = 95 + rlHash(i, 13) * 45;
    for (let j = 0; j < 4; j++) {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }));
      const w = 34 + rlHash(i, j + 20) * 40;
      sp.position.set(Math.cos(a) * R + (j - 1.5) * 16, cy + rlHash(j, i) * 6, Math.sin(a) * R + (rlHash(j + 7, i) - 0.5) * 20);
      sp.scale.set(w, w * 0.32, 1); relScen.add(sp);
    }
  }
}
/* ---------- галявина станції: намет і авто біля дороги ---------- */
function relBuildSite() {
  relSite = { tent: new T.Group(), car: new T.Group() };
  const t = relSite.tent, k = relSite.car;
  const tri = new T.Shape(); tri.moveTo(-1.5, 0); tri.lineTo(1.5, 0); tri.lineTo(0, 1.7); tri.lineTo(-1.5, 0);
  const tg = new T.ExtrudeGeometry(tri, { depth: 2.6, bevelEnabled: false }); tg.translate(0, 0, -1.3);
  mesh(t, tg, new T.MeshStandardMaterial({ color: C('#56704a'), roughness: 0.85, side: T.DoubleSide }));
  mesh(t, box(0.9, 1.0, 0.05), new T.MeshStandardMaterial({ color: C('#2f3b2a'), roughness: 0.9 }), [0, 0.5, 1.31]);
  const paint = new T.MeshStandardMaterial({ color: C('#3f5a6e'), roughness: 0.45, metalness: 0.35 });
  const glass = new T.MeshStandardMaterial({ color: C('#1c2630'), roughness: 0.1, metalness: 0.5 });
  mesh(k, box(2.0, 0.85, 4.4), paint, [0, 0.95, 0]);
  mesh(k, box(1.85, 0.75, 2.1), paint, [0, 1.75, -0.35]);
  mesh(k, box(1.9, 0.6, 2.0), glass, [0, 1.78, -0.35]);
  const tyre = new T.MeshStandardMaterial({ color: C('#1b1d1f'), roughness: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1.4, 1.4]) mesh(k, cyl(0.45, 0.45, 0.35, 14), tyre, [sx * 0.95, 0.45, sz], [0, 0, Math.PI / 2]);
  relScen.add(t, k);
}
function relPalette() {
  const bg = new T.Color(css('--bg') || '#ffffff'), dark = bg.r + bg.g + bg.b < 0.9;
  /* env — частка студійного оточення (scene.environment) у світлі місцевості: у темній темі — сутінки */
  return dark ? { top: '#0f1b2e', hor: '#45586e', bot: '#1c251f', hs: '#61759a', hg: '#1f2a1c', hi: 0.3, li: 0.5, env: 0.3, cloud: '#7d8aa3', co: 0.22 }
    : { top: '#5b8fd3', hor: '#cfdfe8', bot: '#adbca4', hs: '#cfe2ff', hg: '#4f6a38', hi: 0.2, li: 0.78, env: 1, cloud: '#ffffff', co: 0.5 };
}
/* туман і небо — лише в цьому підрозділі; загальне світло сцени приглушується (матеріали місцевості — лише її власні) */
function relAtmos(on) {
  if (!on) {
    scene.fog = null;
    if (relLightBk) { relLightBk.forEach(([l, i]) => { l.intensity = i; }); relLightBk = null; }
    return;
  }
  const P = relPalette(), g = relSky.geometry, pp = g.attributes.position, col = g.attributes.color.array;
  const top = C(P.top), hor = C(P.hor), bot = C(P.bot), c = new T.Color();
  for (let i = 0; i < pp.count; i++) {
    const yy = pp.getY(i);
    if (yy >= 0) c.copy(hor).lerp(top, Math.pow(smooth(0, 0.65, yy), 0.75)); else c.copy(hor).lerp(bot, smooth(0, -0.3, yy));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.attributes.color.needsUpdate = true;
  scene.fog = new T.Fog(C(P.hor), 260, 980);
  relHemi.color.copy(C(P.hs)); relHemi.groundColor.copy(C(P.hg)); relHemi.intensity = P.hi;
  relScen.traverse(o => {
    if (o.isSprite) { o.material.color.copy(C(P.cloud)); o.material.opacity = P.co; }
    else if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = P.env;
  });
  if (!relLightBk) relLightBk = scene.children.filter(o => o.isLight).map(l => [l, l.intensity]);
  relLightBk.forEach(([l, i]) => { l.intensity = i * P.li; });
}
/* важку місцевість будуємо при першому вході в підрозділ */
function relEnsureScenery() {
  if (relTer) return;
  relBuildTerrain(); relBuildTrees(); relBuildSky(); relBuildSite();
  relTerrainUpdate();
}

/* ---------- обладнання ---------- */
function relStation(parent) {
  const g = new T.Group(); parent.add(g);
  const alu = new T.MeshStandardMaterial({ color: C('#a9b0b7'), roughness: 0.35, metalness: 0.9 });
  const olive = new T.MeshStandardMaterial({ color: C('#4a5a45'), roughness: 0.75 });
  for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3 + 0.5; rod(g, [Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6], [0, 2.4, 0], 0.06, alu); }
  mesh(g, cyl(0.1, 0.1, 2.6, 10), alu, [0, 3.4, 0]);
  mesh(g, box(0.9, 0.6, 0.45), olive, [0, 3.0, 0.32]);
  const a = new T.Object3D(); a.position.set(0, 5.0, 0); g.add(a);
  mesh(g, cyl(0.05, 0.05, 1.6, 8), LM.black, [0, 5.0, 0]);
  return { g, a };
}
function relDroneModel(parent) {
  const g = new T.Group(); parent.add(g);
  const carbon = new T.MeshStandardMaterial({ color: C('#25292d'), roughness: 0.55, metalness: 0.25 });
  const motorM = new T.MeshStandardMaterial({ color: C('#7b5ce0'), roughness: 0.35, metalness: 0.7 });
  const battM = new T.MeshStandardMaterial({ color: C('#C93B2B'), roughness: 0.5 });
  const propM = new T.MeshBasicMaterial({ color: C('#E8820F'), transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  const k = 0.75, s = new T.Group(); s.scale.setScalar(k); g.add(s);
  mesh(s, box(1.3, 0.3, 2.6), carbon, [0, 0.25, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arm = mesh(s, box(0.3, 0.12, 2.5), carbon, [sx * 0.88, 0.16, sz * 0.88]); arm.rotation.y = Math.atan2(sx, sz);
    mesh(s, cyl(0.3, 0.3, 0.35, 16), motorM, [sx * 1.75, 0.38, sz * 1.75]);
    mesh(s, new T.CircleGeometry(1.35, 32), propM, [sx * 1.75, 0.62, sz * 1.75], [-Math.PI / 2, 0, 0]);
  }
  mesh(s, box(1.0, 0.55, 1.8), battM, [0, 0.7, 0.1]);
  const a = new T.Object3D(); a.position.set(0, 1.2, 0); g.add(a);
  return { g, a };
}
/* ретранслятор: тринога, щогла, сонячна панель, корпус з вузлами всередині й дві антени */
function relRepeater(parent) {
  const g = new T.Group(); parent.add(g);
  const alu = new T.MeshStandardMaterial({ color: C('#a9b0b7'), roughness: 0.35, metalness: 0.9 });
  const shell = new T.MeshStandardMaterial({ color: C('#d6d1c2'), roughness: 0.6, transparent: true, opacity: 1 });
  for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3 + 0.3; rod(g, [Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5], [0, 2.2, 0], 0.06, alu); }
  mesh(g, cyl(0.09, 0.09, 2.4, 10), alu, [0, 3.2, 0]);
  const sol = new T.Group(); sol.position.set(0, 2.5, -0.55); sol.rotation.x = -0.6; g.add(sol);
  mesh(sol, box(1.7, 0.06, 1.1), alu);
  mesh(sol, box(1.6, 0.03, 1.0), new T.MeshStandardMaterial({ color: C('#1d3557'), roughness: 0.25, metalness: 0.4 }), [0, 0.04, 0]);
  const head = new T.Group(); head.position.y = 4.6; g.add(head);
  const base = mesh(head, box(3.2, 0.12, 1.5), LM.black, [0, -0.62, 0]);
  const lid = new T.Group(); head.add(lid);
  mesh(lid, box(3.2, 1.2, 1.5), shell);
  relParts.lid = { g: lid, base: lid.position.clone(), ex: new T.Vector3(0, 3.2, -2.2), mat: shell };
  const P = (id, build) => { const o = new T.Group(); head.add(o); build(o); const d = RLY_PARTS.find(q => q.id === id); relParts[id] = { g: o, base: o.position.clone(), ex: new T.Vector3(...d.ex), name: d.name, d: d.d }; return o; };
  const pcb = (o, col) => mesh(o, box(0.9, 0.06, 0.7), new T.MeshStandardMaterial({ color: C(col), roughness: 0.5 }));
  P('rx', o => { o.position.set(-0.85, -0.25, 0); pcb(o, '#1f6b45'); mesh(o, box(0.55, 0.2, 0.45), LM.metal, [0, 0.13, 0]); });
  P('mcu', o => { o.position.set(0, -0.25, 0); pcb(o, '#2c5fa8'); mesh(o, box(0.32, 0.08, 0.32), LM.black, [0, 0.07, 0]); });
  P('tx', o => {
    o.position.set(0.85, -0.25, 0); pcb(o, '#1f6b45'); mesh(o, box(0.55, 0.2, 0.45), LM.metal, [0, 0.13, 0]);
    for (let i = 0; i < 5; i++) mesh(o, box(0.04, 0.22, 0.6), LM.metal, [-0.24 + i * 0.12, 0.34, 0]);
  });
  P('pwr', o => { o.position.set(0, -0.25, -0.5); mesh(o, box(1.6, 0.3, 0.32), new T.MeshStandardMaterial({ color: C('#2a2e33'), roughness: 0.6 })); mesh(o, box(0.5, 0.08, 0.3), LM.red, [0.9, 0, 0]); });
  P('fRx', o => { o.position.set(-1.32, 0.15, 0.45); mesh(o, cyl(0.14, 0.14, 0.42, 12), LM.gold, null, [0, 0, Math.PI / 2]); });
  P('fTx', o => { o.position.set(1.32, 0.15, 0.45); mesh(o, cyl(0.14, 0.14, 0.42, 12), LM.gold, null, [0, 0, Math.PI / 2]); });
  P('antRx', o => { o.position.set(-1.45, 0.6, 0); });
  P('antTx', o => { o.position.set(1.45, 0.6, 0); });
  const aR = new T.Object3D(), aT = new T.Object3D(); aR.position.set(0, 1.2, 0); aT.position.set(0, 1.2, 0);
  relParts.antRx.g.add(aR); relParts.antTx.g.add(aT);
  return { g, head, base, aR, aT };
}
export function relInit() {
  relG = new T.Group(); relG.visible = false; scene.add(relG);
  relScen = new T.Group(); relG.add(relScen);
  relHemi = new T.HemisphereLight(0xd2e5ff, 0x5c7742, 0.32); relG.add(relHemi);
  relStA = relStation(relG); relDrA = relDroneModel(relG); relRepG = relRepeater(relG); relRebuildAnts();
  const lm = col => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false });
  ['dir', 'h1', 'h2'].forEach(k => { const m = new T.Mesh(cyl(1, 1, 1, 8), lm(0xffffff)); m.renderOrder = 6; relG.add(m); relLines[k] = m; });
  for (let i = 0; i < 14; i++) { const s = glowSprite('#ffffff', 2.2); s.material.depthTest = false; s.material.fog = false; s.renderOrder = 998; s.visible = false; relG.add(s); relPk.push({ s, t: i / 14 }); }
  for (let i = 0; i < 6; i++) { const s = glowSprite('#ffffff', 0.55); s.material.depthTest = false; s.material.fog = false; s.renderOrder = 999; s.visible = false; relG.add(s); relFlow.push(s); }
  relShadow = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, side: T.DoubleSide, depthWrite: false, toneMapped: false, fog: false }));
  relShadow.renderOrder = 2; relG.add(relShadow);
  relLines.edge = new T.Mesh(cyl(1, 1, 1, 6), lm(0xffffff)); relLines.edge.renderOrder = 6; relLines.edge.material.opacity = 0.6; relG.add(relLines.edge);
  for (let i = 0; i < 2; i++) {
    const f = new T.Mesh(new T.SphereGeometry(1, 28, 14), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false, fog: false }));
    f.renderOrder = 3; relG.add(f); relFres.push(f);
  }
}
export function relEnter() {
  if (!relG) return;
  relEnsureScenery();
  labG.visible = false; relG.visible = true; ctl.auto = false; updateSpinBtn();
  relAtmos(true);
  RLY.dirty = true; RLY.res = relSolve(); relApply(RLY.res); relReadout(RLY.res); relFrame();
}
export function relExit() {
  if (relG) relG.visible = false;
  relAtmos(false);
  for (const [k, e] of LB) if (k.startsWith('rel')) e.on = false;
}
export function relTheme() { RLY.dirty = true; if (relG && relG.visible && relSky) relAtmos(true); }
function rodTo(m, a, b, r) { const d = b.clone().sub(a), len = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.set(r, len, r); }
function relLayout() {
  RL.H = RLY.hill * RL.V;
  const x1 = -relX(RLY.d1), x2 = relX(RLY.d2), hTop = RL.H, gs = relGround(x1, 0), gd = relGround(x2, 0);
  relStA.g.position.set(x1, gs, 0);
  relRepG.g.position.set(0, hTop - 0.05, 0);
  relDrA.g.position.set(x2, Math.max(gd + 1.4, RLY.alt * RL.V), 0);
  relDrA.g.rotation.y = -Math.PI / 2;
  if (relSite) {
    const tx = x1 + 3.6, tz = -3.8, cx = x1 - 3.2, cz = 7.2;
    relSite.tent.position.set(tx, relGround(tx, tz), tz); relSite.tent.rotation.y = 0.5;
    relSite.car.position.set(cx, relGround(cx, cz) + 0.02, cz); relSite.car.rotation.y = Math.PI / 2 + 0.12;
  }
  return { x1, x2, hTop, gs, gd };
}
function relApply(r) {
  if (!ok3d || !relG) return;
  const L = relLayout(), v = relVerdict(r.margin);
  relG.updateMatrixWorld(true);
  const S = relStA.a.getWorldPosition(new T.Vector3()), D = relDrA.a.getWorldPosition(new T.Vector3());
  const AR = relRepG.aR.getWorldPosition(new T.Vector3()), AT = relRepG.aT.getWorldPosition(new T.Vector3());
  const col = k => C(TC['--' + k]);
  const vD = relVerdict(r.mDir), v1 = relVerdict(r.m1), v2 = relVerdict(r.m2);
  rodTo(relLines.dir, S, D, RLY.on ? 0.035 : 0.06); relLines.dir.material.color.copy(col(vD.cls)); relLines.dir.material.opacity = RLY.on ? 0.4 : 0.95;
  rodTo(relLines.h1, S, AR, 0.07); rodTo(relLines.h2, AT, D, 0.07);
  const relCls = r.why === 'self' ? 'bad' : null;
  relLines.h1.material.color.copy(col(relCls || v1.cls)); relLines.h2.material.color.copy(col(relCls || v2.cls));
  relLines.h1.visible = relLines.h2.visible = RLY.on && RLY.view === 'link';
  relLines.dir.visible = RLY.view === 'link';
  /* радіотінь за вершиною з боку станції */
  const top = new T.Vector3(0, L.hTop, 0), far = L.x2 + 10, k = (top.y - S.y) / (top.x - S.x), yFar = top.y + k * (far - top.x);
  const sh = [new T.Vector3(1.5, L.hTop * 0.98, 0), new T.Vector3(far, Math.max(0, yFar), 0), new T.Vector3(far, -1, 0), new T.Vector3(12, -1, 0)];
  const geo = new T.BufferGeometry().setFromPoints([sh[0], sh[1], sh[2], sh[0], sh[2], sh[3]]);
  relShadow.geometry.dispose(); relShadow.geometry = geo; relShadow.material.color.copy(col('bad'));
  relShadow.visible = RLY.view === 'link' && RLY.shade && yFar > 0.5;
  rodTo(relLines.edge, S, new T.Vector3(far, yFar, 0), 0.03); relLines.edge.material.color.copy(col('bad')); relLines.edge.visible = relShadow.visible;
  /* перша зона Френеля кожного прольоту (масштаб по вертикалі як у сцени) */
  [[S, AR, r.fr1], [AT, D, r.fr2]].forEach(([a, b, rad], i) => {
    const f = relFres[i], d = b.clone().sub(a), len = d.length();
    f.position.copy(a).addScaledVector(d, 0.5); f.quaternion.setFromUnitVectors(new T.Vector3(1, 0, 0), d.normalize());
    f.scale.set(len / 2, Math.max(0.15, rad * RL.V), Math.max(0.15, rad * RL.V)); f.material.color.copy(col(i ? v2.cls : v1.cls));
    f.visible = RLY.on && RLY.fres && RLY.view === 'link';
  });
  const pkc = new T.Color(TC[r.c.color] || '#888888');
  relPk.forEach(p => p.s.material.color.copy(pkc));
  relFlow.forEach(s => s.material.color.copy(C(TC['--accent'])));
  /* мітки */
  const vis = RLY.view === 'link';
  const lb = (key, html, cls, pos, on) => { const e = label(key, html, cls); e.pos = pos; e.on = on; return e; };
  lb('relSt', `<b>Станція</b><span class="lx"> · ${r.vid ? 'приймає відео' : 'передає керування'}</span>`, 'tag', S.clone().add(new T.Vector3(0, 3.2, 0)), vis);
  lb('relDr', `<b>Дрон</b><span class="lx"> · ${fmt(RLY.alt)} м</span>`, 'tag', D.clone().add(new T.Vector3(0, 3.2, 0)), vis);
  lb('relRep', `<b>Ретранслятор</b><span class="lx"> · ${RLY.freq === 'same' ? 'f1 = f2' : 'f1 → f2'}${RLY.on ? '' : ' · вимкнено'}</span>`, 'tag', relRepG.head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 4.6, 0)), vis);
  lb('relH1', `<span class="lx">проліт 1 · </span>${sgn1(r.m1)} дБ`, 'lv ' + (relCls || v1.cls), S.clone().lerp(AR, 0.5).add(new T.Vector3(0, 2.2, 0)), vis && RLY.on);
  lb('relH2', `<span class="lx">проліт 2 · </span>${sgn1(r.m2)} дБ`, 'lv ' + (relCls || v2.cls), AT.clone().lerp(D, 0.5).add(new T.Vector3(0, 2.2, 0)), vis && RLY.on);
  lb('relDir', r.hObs > 0 ? `<span class="lx">напряму · </span>дифракція −${fmt1(r.kd.j)} дБ` : `<span class="lx">напряму · </span>${sgn1(r.mDir)} дБ`, 'tag sm', new T.Vector3(0, L.hTop + (RLY.on ? 9 : 3.2), 0), vis && !(narrowMQ.matches && RLY.on));
  /* мітка тіні — низько на схилі за вершиною, подалі від лінії другого прольоту */
  const shX = clamp(L.x2 * 0.45, 12, L.x2 - 4), shG = relGround(shX, 0), shB = top.y + k * shX;
  lb('relSh', 'радіотінь', 'tag sm', new T.Vector3(shX, Math.min(shG + 4, (shG + shB) / 2), 0), vis && relShadow.visible && !narrowMQ.matches);
  for (const p of RLY_PARTS) lb('relC_' + p.id, `<b>${p.name}</b><span class="lx"> · ${p.d}</span>`, 'tag', null, false);
  void v;
}
function relAnimate(dt) {
  const r = RLY.res; if (!r) return;
  RLY.ex += ((RLY.view === 'build' ? 1 : 0) - RLY.ex) * (1 - Math.exp(-dt * 4));
  const e = smooth(0, 1, RLY.ex);
  relRepG.head.scale.setScalar(1 + 1.2 * e);
  for (const [id, p] of Object.entries(relParts)) {
    p.g.position.copy(p.base).addScaledVector(p.ex, e);
    if (id === 'lid') { p.mat.opacity = 1 - 0.75 * e; p.mat.depthWrite = e < 0.5; }
  }
  for (const p of RLY_PARTS) {
    const l = LB.get('relC_' + p.id); if (!l) continue;
    l.on = RLY.ex > 0.6; if (l.on) l.pos = relParts[p.id].g.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, p.id.startsWith('ant') ? 3.6 : p.id === 'pwr' ? -0.9 : 1.1, 0));
  }
  /* сигнал крізь вузли ретранслятора */
  const chain = ['antRx', 'fRx', 'rx', 'mcu', 'tx', 'fTx', 'antTx'].map(id => relParts[id].g.getWorldPosition(new T.Vector3()));
  relFlow.forEach((s, i) => {
    s.visible = RLY.ex > 0.6 && RLY.freq !== 'same';
    if (!s.visible) return;
    const u = ((RLY.t * 0.35 + i / relFlow.length) % 1) * (chain.length - 1), j = Math.floor(u), f = u - j;
    s.position.copy(chain[j]).lerp(chain[Math.min(j + 1, chain.length - 1)], f);
  });
  /* пакети вздовж ліній */
  relG.updateMatrixWorld(true);
  const S = relStA.a.getWorldPosition(new T.Vector3()), D = relDrA.a.getWorldPosition(new T.Vector3());
  const AR = relRepG.aR.getWorldPosition(new T.Vector3()), AT = relRepG.aT.getWorldPosition(new T.Vector3());
  const from = r.vid ? D : S, to = r.vid ? S : D;
  relPk.forEach((p, i) => {
    if (RLY.view !== 'link' || reduceMotion) { p.s.visible = false; return; }
    const t = (RLY.t * 0.22 + i / relPk.length) % 1;
    let pos, alpha = 1;
    if (RLY.on) {
      const a = r.vid ? [D, AT, AR, S] : [S, AR, AT, D];
      if (t < 0.48) pos = a[0].clone().lerp(a[1], t / 0.48);
      else if (t < 0.52) pos = a[1].clone().lerp(a[2], (t - 0.48) / 0.04);
      else pos = a[2].clone().lerp(a[3], (t - 0.52) / 0.48);
      if (r.why === 'self' && t > 0.5) alpha = 0;
      else if (t > 0.5 && r.m2 < 0 && !r.vid) alpha = Math.max(0, 1 - (t - 0.52) * 4);
    } else {
      pos = from.clone().lerp(to, t);
      const past = r.vid ? pos.x < 0 : pos.x > 0;
      if (r.hObs > 0 && past) alpha = Math.max(0, 1 - Math.abs(pos.x) / 12) * clamp(r.mDir / 10 + 1, 0, 1);
    }
    p.s.visible = alpha > 0.02; if (!p.s.visible) return;
    p.s.position.copy(pos); p.s.material.opacity = alpha;
  });
}
export function tickRel(dt) {
  if (!relG) return;
  RLY.t += reduceMotion ? 0 : dt;
  if (RLY.terr) { RLY.terr = false; relTerrainUpdate(); RLY.dirty = true; }
  if (RLY.dirty || !RLY.res) { RLY.dirty = false; RLY.res = relSolve(); relApply(RLY.res); relReadout(RLY.res); }
  if (relSky) relSky.position.copy(camera.position);
  relAnimate(dt);
}
export function relFrame() {
  if (!ok3d || !relG) return;
  if (RLY.view === 'build') { const h = relRepG.head.getWorldPosition(new T.Vector3()); setView(h.clone().add(new T.Vector3(0, 1.0, 1.5)), 0.12, 0.26, fitDist(9.8)); return; }
  const x1 = -relX(RLY.d1), x2 = relX(RLY.d2), H = RLY.hill * RL.V;
  /* висока гора: камера вища й далі, щоб станцію за відрогом було видно */
  setView(new T.Vector3((x1 + x2) / 2 + 2, Math.max(5, H * 0.45), 0), 0.46, 0.2 + 0.16 * smooth(24, 60, H), fitDist(Math.hypot((x2 - x1) / 2, H * 0.5) + 11));
}

/* ---------- панель ---------- */
export function relReadout(r) {
  const v = relVerdict(r.margin);
  const vEl = $('relVerdict'); if (!vEl) return;
  vEl.className = 'lab-verdict ' + v.cls;
  setHTML(vEl, `<b>${v.t}</b><span>${RLY.on ? (r.why === 'self' ? 'ретранслятор глушить сам себе' : `через ретранслятор · ${v.s}`) : `напряму · ${v.s}`}</span><em>запас ${sgn1(r.margin)} дБ</em>`);
  const rows = [
    ['Передавач', `${r.pw >= 1000 ? fmt(r.pw / 1000) + ' Вт' : r.pw + ' мВт'} = ${fmt1(r.ptx)} дБм`],
    ['Антени', RLY_G[RLY.ch].ant],
    ['Напряму: відстань і втрати', `${fmtKm(r.dDir)} · −${fmt1(r.fDir)} дБ`],
    ['Напряму: дифракція на вершині', r.kd.j > 0.05 ? `−${fmt1(r.kd.j)} дБ` : '0 дБ'],
    ['Напряму: запас', `${sgn1(r.mDir)} дБ`],
    ['Проліт 1: станція → ретранслятор', `${fmtKm(r.d1s)} · −${fmt1(r.f1)} дБ · ${sgn1(r.m1)} дБ`],
    ['Проліт 2: ретранслятор → дрон', `${fmtKm(r.d2s)} · −${fmt1(r.f2)} дБ · ${sgn1(r.m2)} дБ`],
    ['Через ретранслятор', r.why === 'self' ? 'самоглушіння' : `${sgn1(r.mRel)} дБ (${RLY.kind === 'digital' ? 'слабший проліт' : 'шуми додаються'})`],
    ['Поріг чутливості', `${r.sens} дБм`]
  ];
  if (r.lat && RLY.on) rows.push(['Додаткова затримка', RLY.kind === 'digital' ? `≈${fmt(r.lat)} мс + обробка` : 'мікросекунди']);
  setHTML($('relBudget'), rows.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join(''));
  const lab = { ok: 'Добре', warn: 'Увага', bad: 'Проблема', info: 'Факт' };
  setHTML($('relWhy'), relReasons(r).map(([s, t]) => `<li class="${s}"><span class="sev ${s}">${lab[s]}</span><span>${t}</span></li>`).join(''));
  if (S.mode === 'antennas' && LAB.sub === 'relay') {
    const hud = $('labHud'); hud.className = 'lab-hud ' + v.cls;
    setText($('lhV'), v.t); setText($('lhS'), `${r.c.name} · ${RLY.on ? 'через ретранслятор' : 'напряму'}`);
    setText($('lhQ'), `запас ${sgn1(r.margin)} дБ`);
    const prx = r.margin + r.sens;
    setText($('lhP'), `${fmt1(prx)} дБм`); setText($('lhT'), `${r.sens} дБм`); setText($('lhM'), `${sgn1(r.margin)} дБ`);
    const w = `${clamp((r.margin + 20) / 60 * 100, 2, 100).toFixed(1)}%`, bar = $('lhBar'); if (bar.style.width !== w) bar.style.width = w;
  }
}
export function relSync() {
  const set = (id, val, out) => { const el = $(id); if (el && +el.value !== val) el.value = val; setText($(id + 'Out'), out); };
  set('relD1', Math.round(RLY.d1 * 10), fmtKm(RLY.d1)); set('relD2', Math.round(RLY.d2 * 10), fmtKm(RLY.d2));
  set('relHill', RLY.hill, `${fmt(RLY.hill)} м`); set('relAlt', RLY.alt, `${fmt(RLY.alt)} м`);
  pressSeg($('relCh'), 'rch', RLY.ch); pressSeg($('relOn'), 'ron', RLY.on ? '1' : '0');
  pressSeg($('relKind'), 'rkind', RLY.kind); pressSeg($('relFreq'), 'rfreq', RLY.freq); pressSeg($('relView'), 'rview2', RLY.view);
  pressSeg($('relScen'), 'rscn', RLY.scen || '');
  const sc = RLY_SCEN.find(q => q.id === RLY.scen), note = $('relScenNote'); note.hidden = !sc; if (sc) setText(note, sc.note);
  $('relFres').setAttribute('aria-pressed', String(RLY.fres));
  $('relShade').setAttribute('aria-pressed', String(RLY.shade));
  const pwEl = $('relPw'), c = LCH[RLY.ch];
  if (pwEl.dataset.ch !== RLY.ch) { pwEl.innerHTML = c.pw.map(p => `<button type="button" data-rpw="${p}">${p >= 1000 ? fmt(p / 1000) + ' Вт' : p + ' мВт'}</button>`).join(''); pwEl.dataset.ch = RLY.ch; }
  pressSeg(pwEl, 'rpw', RLY.pw[RLY.ch]);
}
/* terr — змінилася висота гори (перебудувати рельєф), ants — канал (перебудувати антени ретранслятора) */
function relChanged(o = {}) {
  if (!o.keepScen) RLY.scen = null;
  if (ok3d && relG) { if (o.terr) RLY.terr = true; if (o.ants) relRebuildAnts(); }
  RLY.dirty = true; relSync();
  if (!ok3d || S.mode !== 'antennas' || LAB.sub !== 'relay') { RLY.res = relSolve(); relReadout(RLY.res); }
}
/* антени ретранслятора залежать від каналу (диполі або патчі) */
function relRebuildAnts() {
  if (!relRepG) return;
  for (const id of ['antRx', 'antTx']) {
    const p = relParts[id], keep = id === 'antRx' ? relRepG.aR : relRepG.aT;
    p.g.children.slice().forEach(ch => { if (ch !== keep) { p.g.remove(ch); ch.traverse(n => { if (n.geometry) n.geometry.dispose(); }); } });
    const sx = id === 'antRx' ? -1 : 1;
    mesh(p.g, cyl(0.05, 0.05, 0.5, 8), LM.black, [0, 0.25, 0]);
    if (RLY.ch === 'video') { const q = mesh(p.g, box(0.9, 0.9, 0.12), new T.MeshStandardMaterial({ color: C('#2e3338'), roughness: 0.6 }), [0, 0.95, 0]); q.rotation.y = sx * Math.PI / 2; }
    else { mesh(p.g, cyl(0.05, 0.05, 1.6, 8), LM.black, [0, 1.25, 0]); mesh(p.g, cyl(0.07, 0.07, 0.25, 8), LM.black, [0, 1.25, 0]); }
  }
}
function relScenario(id) {
  const s = RLY_SCEN.find(q => q.id === id); if (!s) return;
  const prevHill = RLY.hill;
  Object.assign(RLY, { on: true, kind: 'digital', freq: 'diff' }, s.set); RLY.scen = id;
  if (RLY.view === 'build') RLY.view = 'link';
  relChanged({ keepScen: true, ants: true, terr: RLY.hill !== prevHill });
  if (ok3d && S.mode === 'antennas' && LAB.sub === 'relay') {
    if (RLY.terr) { RLY.terr = false; relTerrainUpdate(); }
    RLY.res = relSolve(); relApply(RLY.res); relReadout(RLY.res); relFrame();
  }
}
export function relSetSub(sub) {
  LAB.sub = sub;
  pressSeg($('antSub'), 'asub', sub);
  $('labBody').hidden = sub !== 'lab'; $('relBody').hidden = sub !== 'relay';
  setText($('antEyebrow'), sub === 'relay' ? 'Ретранслятор · зв’язок за перешкодою' : 'Стенд · станція ↔ дрон');
  if (S.mode === 'antennas') onModeUI('antennas');
  if (S.mode !== 'antennas') return;
  if (!ok3d) { if (sub === 'relay') { RLY.res = relSolve(); relReadout(RLY.res); } else { LAB.res = labSolve(); labReadout(LAB.res); } return; }
  if (sub === 'relay') { for (const [k, e] of LB) if (k.startsWith('lab')) e.on = false; relEnter(); }
  else { relExit(); labG.visible = true; LAB.dirty = true; LAB.res = labSolve(); labApply(LAB.res); labReadout(LAB.res); labFrame(LAB.orbit ? 'orbit' : 'link'); }
}
export function relUIInit() {
  if (!$('relBody')) return;
  $('relCh').innerHTML = Object.entries(LCH).map(([id, c]) => `<button type="button" data-rch="${id}">${c.name}</button>`).join('');
  $('relScen').innerHTML = RLY_SCEN.map(s => `<button type="button" data-rscn="${s.id}">${s.name}</button>`).join('');
  $('antSub').addEventListener('click', e => { const b = e.target.closest('[data-asub]'); if (b) relSetSub(b.dataset.asub); });
  $('relBody').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.rch) { RLY.ch = d.rch; relChanged({ ants: true }); }
    else if (d.ron) { RLY.on = d.ron === '1'; relChanged(); }
    else if (d.rkind) { RLY.kind = d.rkind; relChanged(); }
    else if (d.rfreq) { RLY.freq = d.rfreq; relChanged(); }
    else if (d.rpw) { RLY.pw[RLY.ch] = +d.rpw; relChanged(); }
    else if (d.rscn) relScenario(d.rscn);
    else if (d.rview2) { RLY.view = d.rview2; relSync(); RLY.dirty = true; if (ok3d && S.mode === 'antennas') relFrame(); }
    else if (b.id === 'relFres') { RLY.fres = !RLY.fres; relChanged({ keepScen: true }); }
    else if (b.id === 'relShade') { RLY.shade = !RLY.shade; relChanged({ keepScen: true }); }
  });
  $('relD1').addEventListener('input', e => { RLY.d1 = +e.target.value / 10; relChanged(); });
  $('relD2').addEventListener('input', e => { RLY.d2 = +e.target.value / 10; relChanged(); });
  $('relHill').addEventListener('input', e => { RLY.hill = +e.target.value; relChanged({ terr: true }); });
  $('relAlt').addEventListener('input', e => { RLY.alt = +e.target.value; relChanged(); });
  /* відпустили повзунок відстані чи висоти гори — камера охоплює сцену заново */
  ['relD1', 'relD2', 'relHill'].forEach(id => $(id).addEventListener('change', () => { if (ok3d && S.mode === 'antennas' && LAB.sub === 'relay' && RLY.view === 'link') relFrame(); }));
  relSync(); RLY.res = relSolve(); relReadout(RLY.res);
}
