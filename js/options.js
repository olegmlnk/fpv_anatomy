/* Курс по БПЛА · платформи, варіанти конфігуратора, розрахунок характеристик.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= PLATFORMS & OPTIONS ================= */
const PLATFORMS = {
  p5: { id: 'p5', name: '5″ фрістайл', short: '5″', sub: '225 мм · 4–6S', motors: 4, mixer: 'quad', misc: 18, aggr: 2.6, exS: 1, fit: 17 },
  p7: { id: 'p7', name: '7″ лонг-рейндж', short: '7″', sub: '≈315 мм · 6S Li-ion', motors: 4, mixer: 'quad', misc: 24, aggr: 2.0, exS: 1.15, fit: 22 },
  p10: { id: 'p10', name: '10″ важкий', short: '10″', sub: '≈430 мм · 6–10S', motors: 4, mixer: 'quad', misc: 45, aggr: 1.8, exS: 1.35, fit: 30 },
  hex: { id: 'hex', name: 'Гексакоптер 7″', short: 'Гекса', sub: '6 моторів · Hex X', motors: 6, mixer: 'hex', misc: 50, aggr: 1.8, exS: 1.3, fit: 29 },
  whoop: { id: 'whoop', name: 'Tiny Whoop 75 мм', short: 'Whoop', sub: 'клас Air75 / Meteor75 · 1S', motors: 4, mixer: 'quad', misc: 2, aggr: 1.5, exS: 0.32, fit: 5.6, micro: true }
};
const PLAT_ORDER = ['p5', 'p7', 'p10', 'hex', 'whoop'];
const BIG = ['p5', 'p7', 'p10', 'hex'];

const OPTS = {
  frame: [
    { id: 'truex', pl: ['p5'], name: 'True-X 5″', sub: 'квадрат, промені 6 мм', g: 118 },
    { id: 'squashed', pl: ['p5'], name: 'Squashed-X 5″', sub: 'ширша, ніж довша', g: 110 },
    { id: 'deadcat', pl: ['p5'], name: 'Deadcat 5″', sub: 'пропелери поза кадром', g: 124 },
    { id: 'x7', pl: ['p7'], name: 'True-X 7″', sub: '≈315 мм, промені 6 мм', g: 165 },
    { id: 'dc7', pl: ['p7'], name: 'Deadcat 7″', sub: 'пропелери поза кадром', g: 172 },
    { id: 'x10', pl: ['p10'], name: 'X 10″', sub: '≈430 мм, промені 8 мм', g: 380 },
    { id: 'hex7', pl: ['hex'], name: 'Hex X 7″', sub: '≈390 мм, 6 променів', g: 290 },
    { id: 'w75', pl: ['whoop'], name: 'Рама 75 мм з дактами', sub: 'лита, з каноп’ю', g: 5.5 }
  ],
  motors: [
    { id: 'm1750', pl: ['p5'], name: '2207 · 1750KV', sub: 'під 6S, м’якший', kv: 1750, st: [22, 7], g: 32, maxW: 950, col: '#A3A9B0' },
    { id: 'm1950', pl: ['p5'], name: '2207 · 1950KV', sub: 'під 6S, фрістайл', kv: 1950, st: [22, 7], g: 32, maxW: 950, col: '#7B5CE0' },
    { id: 'm2450', pl: ['p5'], name: '2306 · 2450KV', sub: 'під 4S', kv: 2450, st: [23, 6], g: 31, maxW: 800, col: '#2F86E0' },
    { id: 'm2750', pl: ['p5'], name: '2207 · 2750KV', sub: 'під 4S, рейсинг', kv: 2750, st: [22, 7], g: 32, maxW: 950, col: '#E0482F' },
    { id: 'm7a', pl: ['p7', 'hex'], name: '2806.5 · 1300KV', sub: 'лонг-рейндж, 6S', kv: 1300, st: [28, 6.5], g: 46, maxW: 1100, col: '#2E9E6E' },
    { id: 'm7b', pl: ['p7', 'hex'], name: '2807 · 1350KV', sub: 'більший момент, 6S', kv: 1350, st: [28, 7], g: 50, maxW: 1250, col: '#C8932E' },
    { id: 'm7c', pl: ['p7', 'hex'], name: '2807 · 1700KV', sub: 'агресивний, для 4–5S', kv: 1700, st: [28, 7], g: 50, maxW: 1250, col: '#E0482F' },
    { id: 'm10a', pl: ['p10'], name: '3115 · 900KV', sub: 'під 6S', kv: 900, st: [31, 15], g: 82, maxW: 1600, col: '#3B6FD6' },
    { id: 'm10b', pl: ['p10'], name: '3115 · 640KV', sub: 'під 8S', kv: 640, st: [31, 15], g: 82, maxW: 1600, col: '#7A52D6' },
    { id: 'm10c', pl: ['p10'], name: '3120 · 450KV', sub: 'під 10S', kv: 450, st: [31, 20], g: 98, maxW: 1900, col: '#C2452F' },
    { id: 'mw1', pl: ['whoop'], name: '0802 · 23000KV', sub: 'клас Air75', kv: 23000, st: [8, 2], g: 2.2, maxW: 13, col: '#D8433A' },
    { id: 'mw2', pl: ['whoop'], name: '1102 · 22000KV', sub: 'клас Meteor75 Pro', kv: 22000, st: [11, 2], g: 3.4, maxW: 22, col: '#E0A100' }
  ],
  props: [
    { id: 'p463', pl: ['p5'], name: '5.1×4.6×3', sub: 'фрістайл, баланс', d: 5.1, pitch: 4.6, n: 3, k: 1.417, c: 0.0202, eff: 3.6, g: 4.4, col: '#E8820F' },
    { id: 'p313', pl: ['p5'], name: '5.1×3.1×3', sub: 'плавний, ефективний', d: 5.1, pitch: 3.1, n: 3, k: 1.2, c: 0.015, eff: 4.0, g: 4.2, col: '#1597AE' },
    { id: 'p452', pl: ['p5'], name: '5×4.5×2', sub: 'дволопатевий, швидкість', d: 5.0, pitch: 4.5, n: 2, k: 1.02, c: 0.014, eff: 4.3, g: 3.6, col: '#3F4955' },
    { id: 'p7353', pl: ['p7', 'hex'], name: '7×3.5×3', sub: 'лонг-рейндж, стабільний', d: 7, pitch: 3.5, n: 3, k: 4.0, c: 0.072, eff: 5.4, g: 7.5, col: '#E8820F' },
    { id: 'p742', pl: ['p7', 'hex'], name: '7×4×2', sub: 'дволопатевий, ефективний', d: 7, pitch: 4, n: 2, k: 3.4, c: 0.06, eff: 5.8, g: 6.5, col: '#3F4955' },
    { id: 'p1053', pl: ['p10'], name: '10×5×3', sub: 'тяга під вантаж', d: 10, pitch: 5, n: 3, k: 15, c: 0.29, eff: 7.2, g: 19, col: '#2B2F35' },
    { id: 'p1045', pl: ['p10'], name: '10×4.5×2', sub: 'дволопатевий, довший політ', d: 10, pitch: 4.5, n: 2, k: 12.5, c: 0.24, eff: 7.8, g: 15, col: '#E8820F' },
    { id: 'pw40', pl: ['whoop'], name: '40 мм × 2', sub: 'клас Air75', d: 40 / 25.4, pitch: 0.9, n: 2, k: 0.0061, c: 3.2e-5, eff: 3.2, g: 0.35, col: '#E6E8EA', mm: 40 },
    { id: 'pw45', pl: ['whoop'], name: '45 мм × 3', sub: 'клас Meteor75 Pro', d: 45 / 25.4, pitch: 1.0, n: 3, k: 0.01, c: 6.2e-5, eff: 2.7, g: 0.6, col: '#2B8BD6', mm: 45 }
  ],
  esc: [
    { id: 'e40', pl: ['p5'], name: '4-in-1 40A · Bluejay', sub: '8-біт, 2–6S', type: '4in1', cont: 40, burst: 45, minS: 2, maxS: 6, g: 12, pcb: '#15181B' },
    { id: 'e55', pl: ['p5', 'p7'], name: '4-in-1 55A · AM32', sub: '32-біт, 3–6S', type: '4in1', cont: 55, burst: 65, minS: 3, maxS: 6, g: 15, pcb: '#101317' },
    { id: 'e70', pl: ['p5', 'p7', 'p10'], name: '4-in-1 70A · AM32', sub: '32-біт, 3–8S', type: '4in1', cont: 70, burst: 85, minS: 3, maxS: 8, g: 20, pcb: '#1C1414' },
    { id: 'ehv', pl: ['p10'], name: '4 × ESC 80A HV', sub: 'окремі + PDB, 6–12S', type: 'sep', cont: 80, burst: 100, minS: 6, maxS: 12, g: 103, pcb: '#151A22' },
    { id: 'hx40', pl: ['hex'], name: '6 × ESC 40A', sub: 'окремі + PDB, 3–6S', type: 'sep', cont: 40, burst: 50, minS: 3, maxS: 6, g: 60, pcb: '#15181B' },
    { id: 'hx60', pl: ['hex'], name: '6 × ESC 60A HV', sub: 'окремі + PDB, 6–12S', type: 'sep', cont: 60, burst: 75, minS: 6, maxS: 12, g: 99, pcb: '#151A22' },
    { id: 'aio5', pl: ['whoop'], name: 'AIO · 5A', sub: 'у платі, 1S', type: 'aio', cont: 5, burst: 6, minS: 1, maxS: 1, g: 0, pcb: '#15181B' }
  ],
  fc: [
    { id: 'f405', pl: BIG, name: 'F405', sub: 'STM32F405 · 168 МГц', mcu: 'STM32F405', part: 'F405RGT6', g: 8, pcb: '#16191B' },
    { id: 'f722', pl: BIG, name: 'F722', sub: 'STM32F722 · 216 МГц', mcu: 'STM32F722', part: 'F722RET6', g: 8, pcb: '#172340' },
    { id: 'h743', pl: BIG, name: 'H743', sub: 'STM32H743 · 480 МГц', mcu: 'STM32H743', part: 'H743VIT6', g: 9, pcb: '#2A1736' },
    { id: 'aio1s', pl: ['whoop'], name: 'AIO 1S · F4', sub: 'FC + ESC + ELRS + VTX', mcu: 'STM32F411', part: 'AIO 1S', g: 3.6, pcb: '#15181B' }
  ],
  rx: [
    { id: 'cer', pl: BIG, name: 'ELRS 2,4 · керамічна', sub: 'вбудована антена', ant: 'ceramic', g: 0.7, link: 1 },
    { id: 't', pl: BIG, name: 'ELRS 2,4 · T-антена', sub: 'диполь 2 × 31 мм', ant: 't', g: 1.2, link: 3 },
    { id: 'div', pl: BIG, name: 'ELRS 2,4 · diversity', sub: 'дві антени під 90°', ant: 'div', g: 2.2, link: 4 },
    { id: 'e900', pl: BIG, name: 'ELRS 900 · Immortal-T', sub: '868/915 МГц', ant: 'imt', g: 3.5, link: 5 },
    { id: 'tbs', pl: BIG, name: 'Crossfire Nano · Immortal-T', sub: 'TBS, 868/915 МГц', ant: 'imt', g: 3.8, link: 5 },
    { id: 'aiorx', pl: ['whoop'], name: 'ELRS 2,4 на платі', sub: 'serial ELRS, мала антена', ant: 'aio', g: 0, link: 2 }
  ],
  vtx: [
    { id: 'an1', pl: BIG, name: 'Аналог · до 1 Вт', sub: '25–1000 мВт', kind: 'analog', g: 6, lat: 5, img: 2 },
    { id: 'an25', pl: BIG, name: 'Аналог · до 2,5 Вт', sub: 'з радіатором', kind: 'analog', g: 14, lat: 5, img: 2 },
    { id: 'hd', pl: BIG, name: 'Цифровий HD', sub: 'клас DJI / Walksnail', kind: 'digital', g: 22, camG: 8, lat: 3, img: 5, dual: true },
    { id: 'hdz', pl: BIG, name: 'HDZero', sub: 'цифровий, фікс. затримка', kind: 'digital', g: 10, camG: 5, lat: 4, img: 4 },
    { id: 'aiovtx', pl: ['whoop'], name: 'Аналог на платі', sub: '25–400 мВт', kind: 'analog', g: 0, lat: 5, img: 2 }
  ],
  vtxant: [
    { id: 'lolli', pl: BIG, name: 'Lollipop', sub: 'RHCP, кругова', g: 3, pol: 'RHCP', lab: 'lolli58' },
    { id: 'pagoda', pl: BIG, name: 'Pagoda', sub: 'RHCP, кругова', g: 4, pol: 'RHCP', lab: 'pagoda58' },
    { id: 'stubby', pl: BIG, name: 'Stubby', sub: 'RHCP, коротка', g: 1.5, pol: 'RHCP', lab: 'stubby58' },
    { id: 'dipole', pl: BIG, name: 'Диполь', sub: 'лінійна поляризація', g: 1, pol: 'лінійна', lab: 'dipole58' },
    { id: 'whip', pl: ['whoop'], name: 'Дротяний диполь', sub: 'лінійна, на каноп’ї', g: 0.3, pol: 'лінійна', lab: 'dipole58' }
  ],
  cam: [
    { id: 'micro', pl: BIG, name: 'Аналогова micro', sub: '19 мм, денна', g: 6, size: 1.9, lens: 0.58, ring: '#C9CED4' },
    { id: 'nano', pl: BIG, name: 'Аналогова nano', sub: '14 мм, легша', g: 3, size: 1.4, lens: 0.46, ring: '#C9CED4' },
    { id: 'night', pl: BIG, name: 'Нічна Starlight', sub: '19 мм, слабке світло', g: 7, size: 1.9, lens: 0.72, ring: '#C9A34A' },
    { id: 'th256', pl: BIG, name: 'Тепловізор 256×192', sub: 'LWIR, аналоговий вихід', g: 22, size: 2.3, lens: 0.8, ring: '#8E6BD8', thermal: true },
    { id: 'th640', pl: BIG, name: 'Тепловізор 640×512', sub: 'LWIR, вища деталізація', g: 42, size: 2.7, lens: 1.02, ring: '#8E6BD8', thermal: true },
    { id: 'hdcam', pl: BIG, name: 'HD-камера системи', sub: 'йде з цифровим VTX', g: 0, size: 1.9, lens: 0.74, ring: '#D8483A', digital: true },
    { id: 'c03', pl: ['whoop'], name: 'Мікрокамера (клас C03)', sub: '≈1,5 г, у каноп’ї', g: 1.45, size: 0.8, lens: 0.27, ring: '#C9CED4' }
  ],
  battery: [
    { id: 'b4s1500', pl: ['p5'], name: 'LiPo 4S 1500', sub: '14,8 В · 1500 мА·год', s: 4, chem: 'lipo', ah: 1.5, g: 180, dim: [3.5, 3.2, 7.4], col: '#2F6FD6' },
    { id: 'b6s1100', pl: ['p5'], name: 'LiPo 6S 1100', sub: '22,2 В · 1100 мА·год', s: 6, chem: 'lipo', ah: 1.1, g: 175, dim: [3.3, 4.0, 7.2], col: '#D9A21F' },
    { id: 'b6s1300', pl: ['p5'], name: 'LiPo 6S 1300', sub: '22,2 В · 1300 мА·год', s: 6, chem: 'lipo', ah: 1.3, g: 210, dim: [3.5, 4.3, 7.7], col: '#C93B2B' },
    { id: 'b6s1800', pl: ['p7'], name: 'LiPo 6S 1800', sub: '22,2 В · 1800 мА·год', s: 6, chem: 'lipo', ah: 1.8, g: 280, dim: [3.7, 4.4, 10.0], col: '#C93B2B' },
    { id: 'b6s5000', pl: ['p10', 'hex'], name: 'LiPo 6S 5000', sub: '22,2 В · 5000 мА·год', s: 6, chem: 'lipo', ah: 5, g: 720, dim: [4.8, 5.0, 15.0], col: '#C93B2B' },
    { id: 'li6s1p', pl: ['p5', 'p7'], name: 'Li-ion 6S1P', sub: '21,6 В · 4500 мА·год', s: 6, p: 1, chem: 'liion', ah: 4.5, g: 440, cells: [3, 2, 1], col: '#2A9D8F' },
    { id: 'li6s2p', pl: ['p7', 'p10', 'hex'], name: 'Li-ion 6S2P', sub: '21,6 В · 9000 мА·год', s: 6, p: 2, chem: 'liion', ah: 9, g: 870, cells: [3, 2, 2], col: '#2A9D8F' },
    { id: 'li6s3p', pl: ['p10', 'hex'], name: 'Li-ion 6S3P', sub: '21,6 В · 13 500 мА·год', s: 6, p: 3, chem: 'liion', ah: 13.5, g: 1300, cells: [3, 3, 2], col: '#2A9D8F' },
    { id: 'li8s2p', pl: ['p10', 'hex'], name: 'Li-ion 8S2P', sub: '28,8 В · 9000 мА·год', s: 8, p: 2, chem: 'liion', ah: 9, g: 1160, cells: [4, 2, 2], col: '#3C6FBF' },
    { id: 'li10s2p', pl: ['p10', 'hex'], name: 'Li-ion 10S2P', sub: '36 В · 9000 мА·год', s: 10, p: 2, chem: 'liion', ah: 9, g: 1445, cells: [5, 2, 2], col: '#7A4FB8' },
    { id: 'w300', pl: ['whoop'], name: '1S 300 LiHV', sub: '3,8 В · 300 мА·год', s: 1, chem: 'lihv', ah: 0.3, g: 8.5, dim: [1.15, 0.62, 4.6], col: '#C93B2B' },
    { id: 'w450', pl: ['whoop'], name: '1S 450 LiHV', sub: '3,8 В · 450 мА·год', s: 1, chem: 'lihv', ah: 0.45, g: 11.5, dim: [1.25, 0.7, 5.6], col: '#D9A21F' },
    { id: 'w550', pl: ['whoop'], name: '1S 550 LiHV', sub: '3,8 В · 550 мА·год', s: 1, chem: 'lihv', ah: 0.55, g: 14.2, dim: [1.3, 0.76, 6.0], col: '#2F6FD6' }
  ],
  power: [
    { id: 'cap35', pl: ['p5', 'p7'], name: 'XT60 + 1000 мкФ 35 В', sub: 'стандарт для 4–6S', g: 11, capV: 35, conn: 'xt60' },
    { id: 'cap50', pl: ['p5', 'p7'], name: 'XT60 + 470 мкФ 50 В', sub: 'запас до 8S', g: 10, capV: 50, conn: 'xt60' },
    { id: 'nocap', pl: ['p5', 'p7'], name: 'XT60 без конденсатора', sub: 'не рекомендовано', g: 8, capV: 0, conn: 'xt60' },
    { id: 'xt90_35', pl: ['p10', 'hex'], name: 'XT90 + 1000 мкФ 35 В', sub: 'лише до 6S', g: 24, capV: 35, conn: 'xt90' },
    { id: 'xt90_50', pl: ['p10', 'hex'], name: 'XT90 + 1000 мкФ 50 В', sub: 'до 8S', g: 25, capV: 50, conn: 'xt90' },
    { id: 'xt90_63', pl: ['p10', 'hex'], name: 'XT90 + 680 мкФ 63 В', sub: 'до 12S', g: 26, capV: 63, conn: 'xt90' },
    { id: 'xt90_no', pl: ['p10', 'hex'], name: 'XT90 без конденсатора', sub: 'не рекомендовано', g: 20, capV: 0, conn: 'xt90' },
    { id: 'bt20', pl: ['whoop'], name: 'BT2.0', sub: '1S, без конденсатора', g: 0.6, capV: null, conn: 'bt20' }
  ],
  gps: [
    { id: 'none', pl: PLAT_ORDER, name: 'Без GPS', sub: 'легше, без навігації', g: 0 },
    { id: 'm10', pl: BIG, name: 'GNSS M10 + компас', sub: 'GPS Rescue, Position Hold', g: 9 }
  ]
};

const DEFAULTS = {
  p5: { frame: 'truex', motors: 'm1950', props: 'p463', esc: 'e55', fc: 'f405', rx: 't', vtx: 'an1', vtxant: 'lolli', cam: 'micro', battery: 'b6s1300', power: 'cap35', gps: 'none', tilt: 30 },
  p7: { frame: 'x7', motors: 'm7a', props: 'p7353', esc: 'e55', fc: 'f722', rx: 'e900', vtx: 'an1', vtxant: 'lolli', cam: 'micro', battery: 'li6s1p', power: 'cap35', gps: 'm10', tilt: 25 },
  p10: { frame: 'x10', motors: 'm10a', props: 'p1053', esc: 'e70', fc: 'h743', rx: 'e900', vtx: 'an1', vtxant: 'pagoda', cam: 'th256', battery: 'li6s2p', power: 'xt90_50', gps: 'm10', tilt: 20 },
  hex: { frame: 'hex7', motors: 'm7a', props: 'p7353', esc: 'hx40', fc: 'h743', rx: 'e900', vtx: 'an1', vtxant: 'lolli', cam: 'micro', battery: 'li6s2p', power: 'xt90_50', gps: 'm10', tilt: 20 },
  whoop: { frame: 'w75', motors: 'mw1', props: 'pw40', esc: 'aio5', fc: 'aio1s', rx: 'aiorx', vtx: 'aiovtx', vtxant: 'whip', cam: 'c03', battery: 'w450', power: 'bt20', gps: 'none', tilt: 25 }
};
const cfg = Object.assign({ platform: 'p5' }, DEFAULTS.p5);

function plat() { return PLATFORMS[cfg.platform]; }
function optsFor(slot) { return OPTS[slot].filter(o => !o.pl || o.pl.includes(cfg.platform)); }
function opt(slot) { return OPTS[slot].find(o => o.id === cfg[slot]) || optsFor(slot)[0]; }
function camOpt() { return opt('vtx').kind === 'digital' ? OPTS.cam.find(o => o.id === 'hdcam') : opt('cam'); }
function numN(id) { return ORDER.indexOf(id) + 1; }
function setPlatform(id) { Object.assign(cfg, DEFAULTS[id], { platform: id }); }
function battDims(b) { return b.cells ? [b.cells[0] * 2.1, b.cells[1] * 2.1, b.cells[2] * 7.0] : b.dim; }
const cellNom = b => (b.chem === 'liion' ? 3.6 : b.chem === 'lihv' ? 3.8 : 3.7);
const cellFull = b => (b.chem === 'lihv' ? 4.35 : 4.2);

const fmt = (v, d = 0) => v.toLocaleString('uk-UA', { minimumFractionDigits: d, maximumFractionDigits: d });
const round5 = v => Math.round(v / 5) * 5;
const fmtA = v => (v < 20 ? fmt(v, 1) : fmt(round5(v)));
const fmtW = v => (v < 50 ? fmt(v, 1) : fmt(round5(v)));

/* ---------- performance estimate ---------- */
function calc() {
  const P = plat(), N = P.motors;
  const fr = opt('frame'), mo = opt('motors'), pr = opt('props'), es = opt('esc'), fc = opt('fc'), rx = opt('rx'),
    vt = opt('vtx'), va = opt('vtxant'), ba = opt('battery'), pw = opt('power'), gp = opt('gps'), cm = camOpt();
  const camG = vt.kind === 'digital' ? vt.camG : cm.g;
  const parts = {
    frame: fr.g, motors: mo.g * N, props: pr.g * N, esc: es.g, fc: fc.g, rx: rx.g, vtx: vt.g,
    vtxant: va.g * (vt.dual ? 2 : 1), cam: camG, battery: ba.g, power: pw.g, gps: gp.g
  };
  const auw = Object.values(parts).reduce((a, b) => a + b, 0) + P.misc;
  const vNom = ba.s * cellNom(ba), vFull = ba.s * cellFull(ba);
  const rpmMax = mo.kv * vFull;
  const kr = mo.kv * vNom * 0.8 / 1000;
  const thrust = pr.k * kr * kr;
  const tw = thrust * N / auw;
  const pMotor = pr.c * kr * kr * kr;
  const iMotor = pMotor / vNom, iTotal = iMotor * N;
  const pHover = auw / pr.eff;
  const wh = ba.ah * vNom * (ba.chem === 'liion' ? 0.75 : 0.8);
  const tHover = wh / pHover * 60, tAgg = tHover / P.aggr;
  const maxA = ba.p ? ba.p * 45 : null;

  const warns = [];
  const ratio = pMotor / mo.maxW;
  if (ratio > 1.15) warns.push(['bad', `Мотори перевантажені: ≈${fmtW(pMotor)} Вт на мотор при допустимих ≈${mo.maxW} Вт. Для ${ba.s}S потрібен нижчий KV.`]);
  else if (ratio < 0.3) warns.push(['warn', `Мотори недовантажені: ≈${fmtW(pMotor)} Вт з ${mo.maxW} Вт. Для ${ba.s}S цей KV замалий — мало тяги.`]);
  if (ba.s > es.maxS) warns.push(['bad', `ESC розрахований максимум на ${es.maxS}S, а батарея ${ba.s}S (${fmt(vFull, 1)} В при повному заряді): згорить.`]);
  else if (ba.s < es.minS) warns.push(['warn', `ESC розрахований від ${es.minS}S, а батарея ${ba.s}S: може не запуститися.`]);
  if (iMotor > es.burst) warns.push(['bad', `ESC ${es.cont}A не витримає піків ≈${fmtA(iMotor)} А на мотор: візьміть потужніший ESC або нижчий KV.`]);
  else if (iMotor > es.cont) warns.push(['warn', `Піки ≈${fmtA(iMotor)} А на мотор вищі за тривалі ${es.cont} А ESC: короткі ривки витримає, але грітиметься.`]);
  if (maxA && iTotal > maxA) warns.push(['warn', `Li-ion ${ba.s}S${ba.p}P віддає ≈${maxA} А, а на повному газі мотори просять ≈${fmtA(iTotal)} А. Напруга просідатиме — плавний політ.`]);
  if (pw.capV === 0) warns.push(['bad', 'Без конденсатора стрибки напруги від моторів можуть спалити ESC і додають шум у відео.']);
  else if (pw.capV && pw.capV < vFull * 1.25) warns.push(['bad', `Конденсатор ${pw.capV} В замалий для ${ba.s}S (${fmt(vFull, 1)} В повного заряду): потрібно від ${Math.ceil(vFull * 1.25)} В.`]);
  if (tw < 2) warns.push(['bad', `Тяга/вага ${fmt(tw, 1)}:1 — дрон ледве відірветься від землі.`]);
  else if (tw < 3.5) warns.push(['warn', `Тяга/вага ${fmt(tw, 1)}:1 — замало для впевненого керування й виходу з піке.`]);
  if (vt.id === 'an25') warns.push(['warn', '2,5 Вт сильно гріється: на землі тримайте pit mode або 25 мВт, у повітрі потрібен обдув.']);
  if (va.pol === 'лінійна' && !P.micro) warns.push(['warn', 'Лінійний диполь з круговими антенами на прийомі: втрата 3 дБ і більше відбиттів.']);
  if (rx.ant === 'ceramic') warns.push(['info', 'Керамічна антена — для мікро-дронів: на великій рамі в неї найменша дальність керування.']);
  if (rx.ant === 'div') warns.push(['info', 'Diversity: приймач обирає антену з кращим сигналом. Антени розвернуті під 90°.']);
  if (vt.kind === 'digital') warns.push(['info', 'Цифрова система йде зі своєю камерою — аналогову камеру знято.']);
  if (cm.thermal) warns.push(['info', 'Тепловізор має аналоговий вихід і вузьке поле зору: для швидкого фрістайлу незручний, для пошуку й огляду — саме те.']);
  if (es.type === 'aio') warns.push(['info', 'AIO-плата об’єднує польотник, ESC, приймач і VTX: вихід з ладу одного вузла — заміна всієї плати.']);
  if (gp.id === 'none' && !P.micro) warns.push(['info', 'Без GPS немає GPS Rescue та Position Hold.']);
  if (fr.id === 'deadcat' || fr.id === 'dc7') warns.push(['info', 'Deadcat: пропелери не потрапляють у кадр камери.']);
  const rank = { bad: 0, warn: 1, info: 2 };
  warns.sort((a, b) => rank[a[0]] - rank[b[0]]);

  const prof = [];
  if (P.micro) prof.push('Мікро · 1S', 'Політ у приміщенні');
  else if (P.id === 'p10') prof.push('Важка платформа');
  else if (P.id === 'hex') prof.push('Гексакоптер · резерв тяги');
  else if (P.id === 'p7') prof.push('Лонг-рейндж');
  if (ba.s >= 8) prof.push(`Висока напруга ${ba.s}S`);
  if (ba.chem === 'liion') prof.push('Li-ion');
  if (P.id === 'p5' && mo.kv >= 2450 && ba.s === 4) prof.push('Рейсинг 4S');
  else if (P.id === 'p5' && tw >= 8 && ba.chem === 'lipo') prof.push(`Фрістайл ${ba.s}S`);
  if (vt.kind === 'digital') prof.push('HD-відео');
  if (cm.thermal) prof.push('Тепловізор');
  if (gp.id !== 'none') prof.push('GPS Rescue');
  if (fr.id === 'deadcat' || fr.id === 'dc7') prof.push('Кінозйомка');

  return { parts, auw, vNom, vFull, rpmMax, thrust, tw, pMotor, iMotor, iTotal, tHover, tAgg, warns, prof, link: rx.link, lat: vt.lat, img: vt.img, N };
}
