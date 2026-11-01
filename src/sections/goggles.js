/* Курс по БПЛА · розділ «Окуляри»: аналогові (на прикладі Skyzone SKY04X Pro) і цифрові (на прикладі DJI Goggles 3).
 * Узагальнені 3D-моделі з робочими органами керування, екран пілота (картинка, OSD, шум аналогу, артефакти цифри),
 * меню, прив’язка й канали, запис, спрощена модель радіолінії, сценарії типових проблем і покрокова інструкція.
 * Назви кнопок і порядок дій — за посібниками виробників; моделі не повторюють дизайн конкретних виробів. */
import * as T from 'three';
import { fmt } from '../data/options.js';
import { box, C, camera, canvas, cyl, glowSprite, ok3d, rrect, scene } from '../engine/core.js';
import { fitDist, label, LB, S, setView, updateSpinBtn } from '../engine/anim.js';
import { ctl, ndc, raycaster } from '../engine/demos.js';
import { $, setHTML, setText } from '../ui/ui.js';

/* ================= ДАНІ ================= */
/* таблиця частот аналогових бендів (МГц), як у посібнику окулярів */
const BANDS = {
  A: [5865, 5845, 5825, 5805, 5785, 5765, 5745, 5725], B: [5733, 5752, 5771, 5790, 5809, 5828, 5847, 5866],
  E: [5705, 5685, 5665, 5645, 5885, 5905, 5925, 5945], F: [5740, 5760, 5780, 5800, 5820, 5840, 5860, 5880],
  R: [5658, 5695, 5732, 5769, 5806, 5843, 5880, 5917], L: [5362, 5399, 5436, 5473, 5510, 5547, 5584, 5621]
};
const BAND_ORDER = ['A', 'B', 'E', 'F', 'R', 'L'];
const VTX_BANDS = ['A', 'B', 'E', 'F', 'R'];
const AN_MODES = ['MIX1', 'MIX2', 'MIX3', 'DIV'];
const OBST = [{ id: 0, n: 'Відкрито', db: 0 }, { id: 1, n: 'Дерева', db: 12 }, { id: 2, n: 'За пагорбом', db: 28 }];
const DEV_NAME = { an: 'Skyzone SKY04X Pro', dg: 'DJI Goggles 3' };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fspl = (km, mhz) => 20 * Math.log10(Math.max(km, 0.005)) + 20 * Math.log10(mhz) + 32.44;
const chName = (b, i) => `${b}${i + 1}`;
const kmTxt = km => (km < 1 ? `${fmt(Math.round(km * 1000))} м` : `${fmt(km, km < 10 ? 1 : 0)} км`);
const distToX = km => Math.round(1000 * Math.log10(km / 0.01) / 3);
const xToDist = x => { const km = 0.01 * Math.pow(10, x * 3 / 1000); return km < 1 ? Math.round(km * 100) / 100 : Math.round(km * 10) / 10; };

/* ================= СТАН ================= */
export const GOG = {
  dev: 'an', view: 'both', scen: 'ok', step: 0, dist: 0.3, obst: 0, labels: false,
  t: 0, scrT: 1, uiT: 0, tip: null, tipHtml: '', tipT: 0, hover: null, hl: [], hlT: 0, lk: null,
  an: { on: true, boot: 0, band: 'R', ch: 0, mode: 'MIX1', set: null, setT: 0, menu: null, mi: 0, search: null, rec: false, recT: 0, files: 0, sd: true, fan: false, vol: 4, src: 'RF', msg: '', msgT: 0, batt: 2, bright: 5, ratio: '4:3', sleep: 3, fanSpd: 2, dvrMode: 'Follow', play: 0 },
  avtx: { band: 'R', ch: 0, mw: 200, pit: false, pol: 'RHCP' }, gPol: 'RHCP', anAnt: true,
  dg: { on: true, boot: 0, bound: true, bind: 0, linking: 0, ants: true, chMode: 'auto', ch: 3, bw: 40, race: false, fps: 100, ratio: '4:3', osd: true, rec: false, recT: 0, files: 0, sd: true, arec: false, bright: 4, rv: false, ht: false, heat: false, menu: null, mi: 0, lvl: 0, si: 0, msg: '', msgT: 0, batt: 92, leds: 0, frozen: 0, lastPress: -9 }
};
const AN0 = JSON.parse(JSON.stringify(GOG.an)), DG0 = JSON.parse(JSON.stringify(GOG.dg)), VTX0 = { ...GOG.avtx };

/* ================= РАДІОЛІНІЯ (спрощено) ================= */
/* Аналог: потужність VTX, антени, втрати в просторі, перешкоди, поляризація й розстроювання каналу →
 * рівень на вході й «якість» картинки 0…1 (поріг чистої картинки ≈ −78 дБм, сніг нижче ≈ −98 дБм). */
function anLink() {
  const A = GOG.an, V = GOG.avtx, fv = BANDS[V.band][V.ch], fg = BANDS[A.band][A.ch];
  const ptx = V.pit ? -10 : 10 * Math.log10(V.mw);
  const grx = GOG.anAnt ? 2.15 + 3 : -25;
  const pol = V.pol === GOG.gPol ? 0 : 20;
  const det = Math.abs(fv - fg), rej = det <= 4 ? 0 : Math.min(70, 8 + (det - 4) * 1.3);
  const prx = ptx + 2.15 + grx - fspl(GOG.dist, fv) - OBST[GOG.obst].db - pol - rej;
  const m = prx + 90, q = A.src !== 'RF' ? 0 : clamp((m + 8) / 20, 0, 1);
  return { fv, fg, ptx, prx, m, q, det, pol, rej, rssi: clamp(Math.round((prx + 95) / 55 * 100), 0, 100) };
}
/* Цифра (O4): поріг приймача залежить від смуги — ширша смуга дає більший бітрейт, але потребує сильнішого сигналу.
 * Бітрейт і затримка — оцінка для навчання, не паспортні дані. */
const DG_THR = { 20: -95, 40: -92, 60: -89 }, DG_CAP = { 20: 25, 40: 40, 60: 60 };
function dgLink() {
  const D = GOG.dg, bw = D.race ? 20 : D.bw;
  const ptx = D.heat ? 14 : 27, grx = D.ants ? 2 + 3 : -1;
  const prx = ptx + 2 + grx - fspl(GOG.dist, 5800) - OBST[GOG.obst].db;
  const m = prx - DG_THR[bw];
  const fps = D.race ? 100 : D.fps;
  const st = !D.bound ? 'nobind' : m < -4 ? 'lost' : m < 3 ? 'weak' : 'ok';
  const br = st === 'nobind' || st === 'lost' ? 0 : Math.max(2, Math.round(DG_CAP[bw] * clamp(0.25 + m / 16, 0.12, 1)));
  const lat = st === 'nobind' || st === 'lost' ? 0 : Math.round((D.race ? 20 : fps === 100 ? 24 : 40) + (m < 8 ? (8 - m) * 3.5 : 0));
  return { bw, ptx, prx, m, st, br, lat, fps, bars: st === 'ok' || st === 'weak' ? clamp(Math.ceil((m + 4) / 5), 1, 4) : 0 };
}
function gogSolve() { GOG.lk = GOG.dev === 'an' ? anLink() : dgLink(); return GOG.lk; }

/* ================= ДІЇ: АНАЛОГОВІ ОКУЛЯРИ ================= */
function anMsg(t, s = 2.2) { GOG.an.msg = t; GOG.an.msgT = s; }
function dgMsg(t, s = 2.4) { GOG.dg.msg = t; GOG.dg.msgT = s; }
const AN_MODE_MENU = [['RF', 'RF Normal · 48 каналів'], ['RACE', 'RF Racing · лише RaceBand'], ['EXT', 'RF Third-Party · зовнішній приймач'], ['AV', 'AV IN'], ['HDMI', 'HDMI IN'], ['PLAY', 'Playback · записи DVR']];
const AN_SYS = [
  { id: 'batt', t: 'Тип батареї', v: () => `${GOG.an.batt}S`, act: () => { GOG.an.batt = GOG.an.batt >= 6 ? 2 : GOG.an.batt + 1; } },
  { id: 'bright', t: 'Яскравість', v: () => `${GOG.an.bright} / 8`, act: () => { GOG.an.bright = GOG.an.bright >= 8 ? 1 : GOG.an.bright + 1; } },
  { id: 'ratio', t: 'Формат кадру', v: () => GOG.an.ratio, act: () => { GOG.an.ratio = GOG.an.ratio === '4:3' ? '16:9' : '4:3'; } },
  { id: 'sleep', t: 'Сон екрана', v: () => `${GOG.an.sleep} хв`, act: () => { GOG.an.sleep = { 1: 3, 3: 5, 5: 1 }[GOG.an.sleep]; } },
  { id: 'fan', t: 'Швидкість вентилятора', v: () => `${GOG.an.fanSpd}`, act: () => { GOG.an.fanSpd = GOG.an.fanSpd >= 3 ? 1 : GOG.an.fanSpd + 1; } },
  { id: 'dvr', t: 'Режим DVR', v: () => GOG.an.dvrMode, act: () => { GOG.an.dvrMode = GOG.an.dvrMode === 'Follow' ? 'Auto & Follow' : 'Follow'; } },
  { id: 'fmt', t: 'Форматувати SD (FAT32)', v: () => (GOG.an.sd ? '' : 'немає картки'), act: () => { if (GOG.an.sd) { GOG.an.files = 0; anMsg('SD-картку відформатовано'); } else anMsg('НЕМАЄ SD-КАРТКИ'); } }
];
function anPower(on) {
  const A = GOG.an; A.on = on; A.boot = on ? 1.6 : 0;
  A.set = null; A.menu = null; A.search = null; if (!on) { A.rec = false; A.fan = false; }
}
export function anAct(id, kind) {
  const A = GOG.an;
  GOG.scen = null;
  if (id === 'aPWR') {
    if (kind === 'hold') { anPower(!A.on); gogTipCtl('aPWR'); }
    else if (A.on) { A.fan = !A.fan; anMsg(A.fan ? 'Вентилятор увімкнено' : 'Вентилятор вимкнено'); }
    else gogTip('aPWR', '<b>Вимкнено</b> · утримайте кнопку, щоб увімкнути');
    return gogChanged();
  }
  if (id === 'aANT') { GOG.anAnt = !GOG.anAnt; gogTipCtl('aANT'); return gogChanged(); }
  if (!['aLW', 'aRW', 'aLB', 'aRB'].includes(id)) { gogTipCtl(id); return; }
  if (!A.on || A.boot > 0) { gogTip(id, '<b>Окуляри вимкнені</b> · утримайте кнопку живлення'); return; }
  const roll = kind === 'up' ? 1 : kind === 'down' ? -1 : 0;
  /* відкрите меню: колеса — пересування, натискання колеса — вибір, права кнопка — назад */
  if (A.menu && (id === 'aLW' || id === 'aRW')) {
    if (roll) { anMenuMove(-roll); return gogChanged(); }
    if (kind === 'press') { anMenuSelect(); return gogChanged(); }
    if (kind === 'hold' && A.menu === 'search' && id === 'aRW') { A.menu = null; A.search = null; return gogChanged(); }
    if (kind === 'hold' && A.menu === 'finder' && id === 'aLW') { A.menu = null; return gogChanged(); }
  }
  if (id === 'aRW') {
    if (kind === 'hold') { A.set = null; A.menu = 'search'; A.search = { stage: 'ready', i: 0, t: 0, best: null }; gogTipCtl('aRW'); }
    else if (kind === 'press') { A.set = A.set === null ? 'ch' : A.set === 'ch' ? 'band' : A.set === 'band' ? 'mode' : null; A.setT = 3; }
    else if (roll) {
      if (!A.set) { gogTip('aRW', '<b>Праве колесо</b> · спершу натисніть, потім крутіть'); return; }
      A.setT = 3;
      if (A.set === 'ch') A.ch = (A.ch + roll + 8) % 8;
      else if (A.set === 'band') A.band = BAND_ORDER[(BAND_ORDER.indexOf(A.band) + roll + BAND_ORDER.length) % BAND_ORDER.length];
      else A.mode = AN_MODES[(AN_MODES.indexOf(A.mode) + roll + 4) % 4];
    }
  } else if (id === 'aLW') {
    if (kind === 'press') { A.set = null; A.menu = 'mode'; A.mi = Math.max(0, AN_MODE_MENU.findIndex(m => m[0] === A.src)); }
    else if (kind === 'hold') { A.set = null; A.menu = 'finder'; }
    else if (roll) { A.vol = clamp(A.vol + roll, 0, 10); anMsg(`Гучність ${A.vol}`, 1.2); }
  } else if (id === 'aLB') {
    if (A.menu === 'play') { if (A.files) { A.files--; anMsg('Файл видалено'); } }
    else if (!A.sd) anMsg('НЕМАЄ SD-КАРТКИ');
    else if (A.src === 'HDMI') anMsg('DVR не пише з HDMI-входу');
    else { A.rec = !A.rec; if (A.rec) A.recT = 0; else { A.files++; anMsg('Запис збережено'); } }
  } else if (id === 'aRB') {
    if (kind === 'hold') { anMsg('Head tracker: центр', 1.6); }
    else if (A.menu) { A.menu = A.menu === 'play' ? 'mode' : null; A.search = null; }
    else { A.set = null; A.menu = 'sys'; A.mi = 0; }
  }
  gogChanged();
}
function anMenuLen() { const A = GOG.an; return A.menu === 'mode' ? AN_MODE_MENU.length : A.menu === 'sys' ? AN_SYS.length : A.menu === 'play' ? Math.max(1, A.files) : 0; }
function anMenuMove(d) {
  const A = GOG.an;
  if (A.menu === 'search' && A.search && A.search.stage === 'done') { const all = anAllCh(), i = all.findIndex(c => c[0] === A.band && c[1] === A.ch), n = all[(i + d + all.length) % all.length]; A.band = n[0]; A.ch = n[1]; return; }
  const n = anMenuLen(); if (n) A.mi = (A.mi + d + n) % n;
}
function anMenuSelect() {
  const A = GOG.an;
  if (A.menu === 'mode') {
    const id = AN_MODE_MENU[A.mi][0];
    if (id === 'PLAY') { A.menu = 'play'; A.mi = 0; return; }
    A.src = id === 'AV' || id === 'HDMI' ? id : 'RF'; A.menu = null;
    if (id === 'EXT') anMsg('Зовнішній приймач: кнопки окулярів ним не керують');
    else if (id === 'RACE') { A.band = 'R'; anMsg('Лише RaceBand (R1–R8)'); }
  } else if (A.menu === 'sys') AN_SYS[A.mi].act();
  else if (A.menu === 'search' && A.search) {
    if (A.search.stage === 'ready') A.search = { stage: 'scan', i: 0, t: 0, best: null };
    else if (A.search.stage === 'done') { A.menu = null; A.search = null; }
  } else if (A.menu === 'play') { if (A.files) A.play = A.play ? 0 : 1; }
}
const anAllCh = () => BAND_ORDER.flatMap(b => BANDS[b].map((_, i) => [b, i]));

/* ================= ДІЇ: ЦИФРОВІ ОКУЛЯРИ ================= */
const DG_TABS = [{ id: 'status', t: 'Статус' }, { id: 'album', t: 'Альбом' }, { id: 'trans', t: 'Передавання' }, { id: 'set', t: 'Налаштування' }];
const DG_ITEMS = {
  status: () => [{ t: 'Повітряний модуль', v: GOG.dg.bound ? 'O4 · прив’язано' : 'не прив’язано' }, { t: 'Заряд окулярів', v: `${GOG.dg.batt} %` }, { t: 'microSD', v: GOG.dg.sd ? 'є' : 'немає' }],
  album: () => (GOG.dg.files ? Array.from({ length: Math.min(4, GOG.dg.files) }, (_, i) => ({ t: `Запис ${GOG.dg.files - i}`, v: 'MOV' })) : [{ t: 'Записів немає', v: '' }]),
  trans: () => [
    { id: 'chMode', t: 'Режим каналу', v: GOG.dg.chMode === 'auto' ? 'Авто' : 'Ручний' },
    { id: 'ch', t: 'Канал', v: GOG.dg.chMode === 'auto' ? 'авто' : String(GOG.dg.ch), dis: GOG.dg.chMode === 'auto' },
    { id: 'bw', t: 'Смуга', v: GOG.dg.race ? '20 МГц (Race)' : `${GOG.dg.bw} МГц`, dis: GOG.dg.race },
    { id: 'race', t: 'Race Mode', v: GOG.dg.race ? 'увімк' : 'вимк' }
  ],
  set: () => [
    { id: 'arec', t: 'Запис при армуванні', v: GOG.dg.arec ? 'увімк' : 'вимк' },
    { id: 'bright', t: 'Яскравість', v: `${GOG.dg.bright} / 5` },
    { id: 'rv', t: 'Real View PiP', v: GOG.dg.rv ? 'увімк' : 'вимк' },
    { id: 'ht', t: 'Head Tracking', v: GOG.dg.ht ? 'увімк' : 'вимк' },
    { id: 'bind', t: 'Прив’язка', v: GOG.dg.bound ? 'прив’язано' : '›' }
  ]
};
const DG_CAM = () => [{ id: 'fps', t: 'Кадри', v: GOG.dg.race ? '100 /с (Race)' : `${GOG.dg.fps} /с`, dis: GOG.dg.race }, { id: 'ratio', t: 'Формат', v: GOG.dg.ratio }, { id: 'res', t: 'Роздільність', v: '1080p' }];
const DG_QUICK = () => [{ id: 'rec', t: GOG.dg.rec ? 'Зупинити запис' : 'Почати запис', v: GOG.dg.rec ? '●' : '' }, { id: 'rv', t: 'Real View', v: GOG.dg.rv ? 'увімк' : 'вимк' }, { id: 'bright', t: 'Яскравість', v: `${GOG.dg.bright} / 5` }];
function dgItems() { const D = GOG.dg; return D.menu === 'cam' ? DG_CAM() : D.menu === 'quick' ? DG_QUICK() : DG_ITEMS[DG_TABS[D.mi].id](); }
function dgPower(on) {
  const D = GOG.dg; D.on = on; D.boot = on ? 2 : 0; D.menu = null; D.bind = 0; D.linking = 0;
  if (!on) { D.rec = false; D.rv = false; }
}
function dgToggle(id) {
  const D = GOG.dg;
  if (id === 'chMode') D.chMode = D.chMode === 'auto' ? 'manual' : 'auto';
  else if (id === 'ch') D.ch = D.ch >= 8 ? 1 : D.ch + 1;
  else if (id === 'bw') D.bw = { 20: 40, 40: 60, 60: 20 }[D.bw];
  else if (id === 'race') D.race = !D.race;
  else if (id === 'arec') D.arec = !D.arec;
  else if (id === 'bright') D.bright = D.bright >= 5 ? 1 : D.bright + 1;
  else if (id === 'rv') D.rv = !D.rv;
  else if (id === 'ht') D.ht = !D.ht;
  else if (id === 'bind') { if (!D.bound) { D.menu = null; dgStartBind(); } }
  else if (id === 'fps') D.fps = D.fps === 100 ? 60 : 100;
  else if (id === 'ratio') D.ratio = D.ratio === '4:3' ? '16:9' : '4:3';
  else if (id === 'rec') dgRec();
}
function dgRec() {
  const D = GOG.dg;
  if (!D.sd) { dgMsg('Немає microSD — запис неможливий'); return; }
  if (!D.bound) { dgMsg('Немає відео з модуля'); return; }
  D.rec = !D.rec; if (D.rec) D.recT = 0; else { D.files++; dgMsg('Запис збережено'); }
}
function dgStartBind() { const D = GOG.dg; D.bind = 30; D.bound = false; dgMsg('Режим прив’язки: натисніть кнопку прив’язки на модулі', 3); }
export function dgAct(id, kind) {
  const D = GOG.dg;
  GOG.scen = null;
  if (id === 'dPWR') {
    const now = GOG.t;
    if (kind === 'press') { D.leds = 3; D.lastPress = now; if (D.on) dgMsg(`Заряд окулярів ${D.batt} %`, 1.6); gogTipCtl('dPWR'); }
    else if (kind === 'presshold' || (kind === 'hold' && now - D.lastPress < 2.6)) { dgPower(!D.on); gogTipCtl('dPWR'); }
    else if (kind === 'hold') { if (D.on && D.boot <= 0) dgStartBind(); else gogTip('dPWR', '<b>Живлення</b> · щоб увімкнути: натисніть, потім утримайте 2 с'); }
    return gogChanged();
  }
  if (id === 'link') {
    if (D.bind > 0 && D.on) { D.linking = 1.4; dgMsg('Модуль: прив’язка…', 1.4); }
    else dgMsg(D.on ? 'Окуляри не в режимі прив’язки' : 'Окуляри вимкнені', 1.8);
    return gogChanged();
  }
  if (id === 'dANT') { D.ants = !D.ants; gogTipCtl('dANT'); return gogChanged(); }
  if (!['d5D', 'dBACK', 'dRV'].includes(id)) { gogTipCtl(id); return; }
  if (!D.on || D.boot > 0) { gogTip(id, '<b>Окуляри вимкнені</b> · натисніть, потім утримайте кнопку живлення'); return; }
  if (id === 'dRV') { if (kind === 'double') { D.rv = !D.rv; } else gogTip('dRV', '<b>Real View</b> · двічі натисніть на правий бік'); return gogChanged(); }
  if (id === 'dBACK') {
    if (D.bind > 0) { D.bind = 0; D.bound = true; dgMsg('Прив’язку скасовано'); }
    else if (D.menu === 'main' && D.lvl === 1) D.lvl = 0; else D.menu = null;
    return gogChanged();
  }
  if (id === 'd5D') {
    if (!D.menu) {
      if (kind === 'press' || kind === 'right') { D.menu = 'main'; D.lvl = 0; D.si = 0; }
      else if (kind === 'up') { D.menu = 'cam'; D.si = 0; }
      else if (kind === 'down') { D.menu = 'quick'; D.si = 0; }
      return gogChanged();
    }
    const items = dgItems();
    if (D.menu === 'main' && D.lvl === 0) {
      if (kind === 'up') D.mi = (D.mi + DG_TABS.length - 1) % DG_TABS.length;
      else if (kind === 'down') D.mi = (D.mi + 1) % DG_TABS.length;
      else if (kind === 'press' || kind === 'right') { D.lvl = 1; D.si = 0; }
      else if (kind === 'left') D.menu = null;
    } else {
      if (kind === 'up') D.si = (D.si + items.length - 1) % items.length;
      else if (kind === 'down') D.si = (D.si + 1) % items.length;
      else if (kind === 'left') { if (D.menu === 'main') D.lvl = 0; else D.menu = null; }
      else if (kind === 'press' || kind === 'right') { const it = items[D.si]; if (it && it.id && !it.dis) dgToggle(it.id); }
    }
    return gogChanged();
  }
  gogChanged();
}

/* ================= СЦЕНАРІЇ ================= */
const AN_SCEN = [
  { id: 'ok', name: 'Правильно', note: 'Окуляри й VTX на R1 (5658 МГц), обидві антени RHCP, 300 м на відкритому: чиста картинка, RSSI високий.', set: () => {} },
  { id: 'ch', name: 'Не той канал', note: 'Окуляри на R2 (5695 МГц), а VTX — на R1 (5658 МГц): різниця 37 МГц, і замість картинки сніг. Праве колесо → канал, або утримайте його й запустіть пошук.', set: () => { GOG.an.ch = 1; } },
  { id: 'pol', name: 'Різна поляризація', note: 'На дроні LHCP, на окулярах RHCP: мінус ≈20 дБ. Поруч ще видно, але вже за кілька сотень метрів з’являється шум. Поставте антени однієї поляризації.', set: () => { GOG.avtx.pol = 'LHCP'; GOG.dist = 0.6; } },
  { id: 'far', name: 'Далеко за деревами', note: '1,5 км і дерева на лінії: сигнал біля порогу — шум, смуги, картинка «рветься». Режим MIX2/MIX3 тримає синхронізацію, але рятує висота й пряма видимість.', set: () => { GOG.dist = 1.5; GOG.obst = 1; GOG.an.mode = 'MIX2'; } },
  { id: 'pit', name: 'Pit mode', note: 'VTX у pit mode випромінює частки мілівата, щоб не заважати іншим на столі. Картинку видно лише за кілька метрів — перед польотом вимкніть pit mode.', set: () => { GOG.avtx.pit = true; } },
  { id: 'sd', name: 'Без SD-картки', note: 'Запис DVR не почнеться без картки: окуляри покажуть попередження. Потрібна картка у FAT32, Class 10, до 128 ГБ.', set: () => { GOG.an.sd = false; } }
];
const DG_SCEN = [
  { id: 'ok', name: 'Правильно', note: 'Окуляри прив’язані до модуля O4, антени розкладені, 1 км на відкритому, смуга 40 МГц: бітрейт на максимумі, затримка ≈24 мс при 100 кадрах/с.', set: () => {} },
  { id: 'bind', name: 'Не прив’язані', note: 'Нові окуляри або модуль: картинки немає. Утримайте кнопку живлення окулярів до безперервного сигналу, потім натисніть кнопку прив’язки на модулі (на панелі — «Кнопка прив’язки на модулі»).', set: () => { GOG.dg.bound = false; } },
  { id: 'weak', name: 'Слабкий сигнал', note: '2 км і дерева, смуга 60 МГц: бітрейт падає, затримка росте, з’являються квадрати й підвисання. Звузьте смугу до 40 чи 20 МГц у меню «Передавання» — зв’язок стане стабільнішим.', set: () => { GOG.dist = 2; GOG.obst = 1; GOG.dg.bw = 60; } },
  { id: 'ants', name: 'Складені антени', note: 'Антени окулярів складені: сигнал слабший на кілька децибел, і на тій самій відстані зв’язок уже на межі. Розкладіть їх перед польотом.', set: () => { GOG.dg.ants = false; GOG.dist = 3.5; } },
  { id: 'osd', name: 'Немає OSD', note: 'Верхня смуга окулярів є, а напруги й таймера з польотника немає: у Betaflight на UART модуля не ввімкнено MSP DisplayPort або не вибрано HD-формат OSD.', set: () => { GOG.dg.osd = false; } },
  { id: 'heat', name: 'Перегрів модуля', note: 'Модуль довго працював на столі без обдуву: окуляри попереджають про температуру, потужність знижено. Не тримайте дрон увімкненим без потоку повітря.', set: () => { GOG.dg.heat = true; GOG.dist = 0.8; } },
  { id: 'sd', name: 'Без microSD', note: 'Без картки запис не почнеться. Окуляри приймають microSD до 512 ГБ; запис — у MOV.', set: () => { GOG.dg.sd = false; } }
];
export function gogScenario(id) {
  const list = GOG.dev === 'an' ? AN_SCEN : DG_SCEN, s = list.find(q => q.id === id); if (!s) return;
  GOG.dist = GOG.dev === 'an' ? 0.3 : 1; GOG.obst = 0;
  if (GOG.dev === 'an') { Object.assign(GOG.an, JSON.parse(JSON.stringify(AN0))); Object.assign(GOG.avtx, VTX0); GOG.gPol = 'RHCP'; GOG.anAnt = true; }
  else Object.assign(GOG.dg, JSON.parse(JSON.stringify(DG0)));
  s.set(); GOG.scen = id;
  gogChanged(); gogSync();
}

/* ================= ПОКРОКОВА ІНСТРУКЦІЯ ================= */
const AN_STEPS = [
  { g: 'Підготовка', t: 'Антени — до ввімкнення', hl: ['aANT', 'aMOD'],
    do: ['Закрутіть обидві антени на роз’єми SMA модуля приймача: зазвичай одну всеспрямовану й одну спрямовану (патч).', 'Поляризація антен окулярів і VTX має збігатися: RHCP з RHCP або LHCP з LHCP.', 'VTX на дроні теж вмикають тільки з антеною.'],
    why: 'Окуляри приймають лише через антени; різна поляризація коштує до 20 дБ — дальність падає в кілька разів. VTX без антени може згоріти.', act: ['Закрутити антени', () => { GOG.anAnt = true; }] },
  { g: 'Підготовка', t: 'Живлення й увімкнення', hl: ['aPWR', 'aDC', 'aBAT'],
    do: ['Живлення — 2S–6S через роз’єм DC 5,5×2,1 мм, зазвичай від акумулятора на ремінці.', 'Утримайте кнопку живлення — окуляри увімкнуться. Коротке натискання вмикає й вимикає вентилятор.', 'У системному меню (права кнопка) виставте тип батареї, щоб напруга й попередження про розряд були правильні.'],
    why: 'Неправильний тип батареї — неправильна напруга на екрані: окуляри можуть вимкнутися без попередження.', act: ['Увімкнути', () => { if (!GOG.an.on) anPower(true); }] },
  { g: 'Підготовка', t: 'Підгонка під очі', hl: ['aIPD', 'aFOC', 'aFAN'],
    do: ['Повзунком IPD зведіть лінзи під відстань між зіницями (58–71 мм): два зображення мають злитися в одне.', 'Колесом фокуса налаштуйте різкість (від −2 до +6 діоптрій) — часто можна обійтися без окулярів для зору.', 'Вентилятор не дає лінзам пітніти.'],
    why: 'Неправильний IPD і фокус швидко втомлюють очі й розмивають OSD на краях кадру.' },
  { g: 'Зв’язок з дроном', t: 'Канал VTX', hl: ['aRW'],
    do: ['Дізнайтеся бенд і канал VTX: їх видно в OSD польотника, у Betaflight (вкладка Video Transmitter) або на самому VTX.', 'Праве колесо: натисніть і крутіть — канал; натисніть ще раз — бенд; ще раз — режим приймача (MIX або DIV).', 'Якщо 3 секунди не крутити колесо, налаштування закривається.'],
    why: 'Окуляри й VTX мають стояти на одній частоті. Сусідній канал RaceBand — це вже 37 МГц, і картинки не буде.', act: ['Відкрити вибір каналу', () => { anAct('aRW', 'press'); }] },
  { g: 'Зв’язок з дроном', t: 'Автопошук', hl: ['aRW'],
    do: ['Утримайте праве колесо — відкриється меню пошуку. Натисніть колесо, щоб почати.', 'Приймач пройде всі 48 частот і зупиниться на найсильнішому сигналі; колесом можна підправити вибір.', 'Перевірте, що це ваш дрон: пошук ловить будь-який VTX поруч.'],
    why: 'Пошук зручний, коли канал невідомий, але біля кількох дронів може зупинитися на сусідньому.', act: ['Відкрити пошук', () => { anAct('aRW', 'hold'); }] },
  { g: 'Зв’язок з дроном', t: 'Режим приймача', hl: ['aRW'],
    do: ['MIX1 — базове злиття сигналів двох приймачів з мінімальним втручанням у картинку.', 'MIX2 — стабільніша синхронізація на слабкому сигналі; MIX3 — ще стабільніше, але картинка трохи темніша.', 'DIV — класичний diversity: показує приймач з вищим RSSI.'],
    why: 'SteadyView зводить два сигнали, щоб картинка менше рвалася й «котилася» на межі прийому.' },
  { g: 'Екран і запис', t: 'Що на екрані', hl: ['aRB'],
    do: ['Верхній рядок малюють окуляри: бенд, канал і частоту, RSSI, напругу батареї окулярів, стан запису.', 'Решту накладає польотник (OSD Betaflight): напругу акумулятора дрона, таймер, LQ, режим польоту.', 'Яскравість, формат 4:3 чи 16:9, сон екрана й вигляд RSSI — у системному меню (права кнопка).'],
    why: 'Рядок окулярів показує прийом відео, OSD польотника — стан дрона й лінку керування. Це різні радіоканали.', act: ['Відкрити системне меню', () => { const A = GOG.an; if (A.on) { A.set = null; A.menu = 'sys'; A.mi = 0; } }] },
  { g: 'Екран і запис', t: 'Запис DVR', hl: ['aLB', 'aSD'],
    do: ['Ліва кнопка — старт і стоп запису. Потрібна SD-картка у FAT32, Class 10, до 128 ГБ.', 'Режим Auto & Follow сам починає запис, коли з’являється відео, і зупиняє через 30 с після втрати сигналу.', 'Переглянути: ліве колесо → Playback; права кнопка — вийти, ліва — видалити файл.'],
    why: 'Запис допомагає розібрати політ і знайти дрон після падіння.', warn: 'Не вимикайте живлення під час запису — файл може пошкодитися.', act: ['Почати запис', () => { const A = GOG.an; if (A.on && A.sd && !A.rec) { A.rec = true; A.recT = 0; } }] },
  { g: 'Екран і запис', t: 'Пошук загубленого дрона', hl: ['aLW', 'aANT'],
    do: ['Утримайте ліве колесо — Drone Finder показує силу сигналу VTX.', 'Повертайтеся з окулярами: найвищий рівень — у напрямку на дрон. Потрібна спрямована антена на приймачі.', 'Працює, лише поки на дроні живі акумулятор і VTX.'],
    why: 'Після падіння в траву чи кущі це часто найшвидший спосіб знайти дрон.', act: ['Увімкнути Drone Finder', () => { const A = GOG.an; if (A.on) { A.set = null; A.menu = 'finder'; } }] },
  { g: 'Перед польотом', t: 'Правила каналу', hl: [],
    do: ['Не вмикайте VTX на каналі, де вже літає інший пілот: ви перекриєте йому картинку. Домовтеся про канали заздалегідь.', 'На столі тримайте VTX у pit mode або на мінімальній потужності.', 'Користуйтеся лише дозволеними частотами й потужностями — вимоги залежать від країни.'],
    why: 'Аналоговий канал займає смугу для всіх поруч: одна помилка — і інший пілот летить наосліп.', warn: 'Не лишайте окуляри лінзами до сонця: промені через лінзи пропалюють екрани.' }
];
const DG_STEPS = [
  { g: 'Підготовка', t: 'Активація й прошивки', hl: ['dUSB'],
    do: ['Першого разу окуляри активують: USB-C → телефон з DJI Fly, далі підказки застосунку (потрібен інтернет).', 'Повітряний модуль O4 активують і оновлюють через DJI Assistant 2.', 'Прошивки окулярів і модуля мають бути сумісні: оновили одне — оновіть і друге.'],
    why: 'Без активації або з несумісними прошивками окуляри не з’єднаються з модулем чи не покажуть його налаштувань.' },
  { g: 'Підготовка', t: 'Антени й живлення', hl: ['dANT', 'dPWR', 'dLED'],
    do: ['Розкладіть обидві антени окулярів.', 'Батарея вбудована в оголів’я: коротке натискання кнопки живлення показує заряд на чотирьох індикаторах.', 'Увімкнути чи вимкнути — натисніть один раз, а потім натисніть і утримуйте 2 секунди.'],
    why: 'Складені антени скорочують дальність. Повного заряду вистачає приблизно на 3 години.', act: ['Розкласти й увімкнути', () => { GOG.dg.ants = true; if (!GOG.dg.on) dgPower(true); }] },
  { g: 'Підготовка', t: 'Підгонка під очі', hl: ['dIPD', 'dBAT'],
    do: ['Коліщатами налаштуйте діоптрії (від −6,0 до +2,0) і відстань між лінзами (56–72 мм), потім зафіксуйте.', 'Оголів’я підтягніть колесом на батарейному блоці.', 'Для сильнішої короткозорості в комплекті є лінзи −2,0.'],
    why: 'Астигматизм окуляри не виправляють — у такому разі знадобляться окремі лінзи.' },
  { g: 'Зв’язок з дроном', t: 'Прив’язка до модуля', hl: ['dPWR'],
    do: ['Увімкніть окуляри й дрон.', 'Утримуйте кнопку живлення окулярів, поки вони не почнуть безперервно пищати, — це режим прив’язки.', 'На повітряному модулі натисніть кнопку прив’язки: індикатор блимає, а коли стане зеленим — окуляри показують картинку.'],
    why: 'Прив’язку роблять один раз: далі окуляри з’єднуються з цим модулем самі.', act: ['Увійти в режим прив’язки', () => { const D = GOG.dg; if (!D.on) dgPower(true); D.boot = 0; dgStartBind(); }] },
  { g: 'Зв’язок з дроном', t: 'Канал і смуга', hl: ['d5D'],
    do: ['Меню (натисніть 5D) → «Передавання»: канал авто або ручний.', 'Смуга 20, 40 чи 60 МГц: ширша дає більший бітрейт і кращу картинку, вужча — стабільніший зв’язок далеко й за перешкодами.', 'Race Mode — 100 кадрів/с і 20 МГц для найменшої затримки, коли поруч літають інші системи.'],
    why: 'Смуга — головний компроміс цифрової системи між якістю й дальністю.', act: ['Відкрити «Передавання»', () => { const D = GOG.dg; if (D.on && D.boot <= 0) { D.menu = 'main'; D.mi = 2; D.lvl = 1; D.si = 2; } }] },
  { g: 'Зв’язок з дроном', t: 'Індикатори лінку', hl: [],
    do: ['Угорі екрана — рівень сигналу, бітрейт (Мбіт/с) і затримка (мс).', 'Першим падає бітрейт: картинка гіршає, затримка росте. Це сигнал повернути ближче або піднятися вище.', 'Далі з’являється попередження про слабкий сигнал, а потім картинка зависає.'],
    why: 'Цифра не шумить, як аналог: картинка чиста майже до кінця, а зникає різко. Стежте за цифрами.' },
  { g: 'Екран і запис', t: 'OSD польотника', hl: ['d5D'],
    do: ['Щоб бачити напругу, таймер і LQ з Betaflight, на UART модуля вмикають MSP DisplayPort і вибирають HD-формат OSD.', 'Верхню смугу (сигнал, бітрейт, заряд, запис) малюють самі окуляри.', '5D уперед — панель камери: 100 або 60 кадрів/с, формат кадру.'],
    why: 'Без MSP DisplayPort окуляри покажуть відео, але не стан акумулятора дрона.', act: ['Відкрити панель камери', () => { const D = GOG.dg; if (D.on && D.boot <= 0) { D.menu = 'cam'; D.si = 0; } }] },
  { g: 'Екран і запис', t: 'Кнопка 5D і «Назад»', hl: ['d5D', 'dBACK'],
    do: ['Натиснути або вправо — меню окулярів; угору й униз — пересування; натиснути — вибір.', '5D уперед — налаштування камери, назад — швидке меню (запис та інше).', 'Кнопка «Назад» — на рівень вище або закрити меню.'],
    why: 'Усе керування в польоті — однією кнопкою, не знімаючи окуляри.', act: ['Відкрити швидке меню', () => { const D = GOG.dg; if (D.on && D.boot <= 0) { D.menu = 'quick'; D.si = 0; } }] },
  { g: 'Екран і запис', t: 'Запис', hl: ['dSD', 'd5D'],
    do: ['Запис іде на microSD окулярів (до 512 ГБ); на модулі з власною пам’яттю — ще й якісніший запис з камери.', 'Почати й зупинити — у швидкому меню (5D назад); автозапис при армуванні — у налаштуваннях.', 'Без картки запис не почнеться — окуляри про це скажуть.'],
    why: 'Запис у окулярах — те, що бачив пілот, разом з артефактами лінку; запис на модулі — чиста картинка з камери.', act: ['Почати запис', () => { if (GOG.dg.on && !GOG.dg.rec) dgRec(); }] },
  { g: 'Екран і запис', t: 'Real View', hl: ['dRV'],
    do: ['Двічі натисніть на правий бік окулярів — поверх відео з’явиться картинка з камер окулярів.', 'Так можна подивитися довкола, не знімаючи окуляри, наприклад перед зльотом.', 'Ще раз двічі натисніть — вимкнути.'],
    why: 'Зручно перевірити, що поруч нікого немає, не відриваючись від польоту.', warn: 'Літайте з помічником-спостерігачем, якщо цього вимагають правила, і лише на дозволених частотах.', act: ['Увімкнути Real View', () => { if (GOG.dg.on) GOG.dg.rv = true; }] }
];
const gogSteps = () => (GOG.dev === 'an' ? AN_STEPS : DG_STEPS);

/* ================= 3D-МОДЕЛІ ================= */
export let gogG = null;
const GP = { an: null, dg: null, anchor: {}, pick: [], scr: null, wheels: {}, antsDG: [], leds: [], fan: null, screenG: null };
const GM = {};
function gm() {
  GM.shell = new T.MeshStandardMaterial({ color: C('#2a2d31'), roughness: 0.55, metalness: 0.1 });
  GM.shellA = new T.MeshStandardMaterial({ color: C('#1c1e21'), roughness: 0.62, metalness: 0.08 });
  GM.glass = new T.MeshStandardMaterial({ color: C('#0a0c0f'), roughness: 0.12, metalness: 0.35 });
  GM.foam = new T.MeshStandardMaterial({ color: C('#8f949a'), roughness: 0.96 });
  GM.foamD = new T.MeshStandardMaterial({ color: C('#16181b'), roughness: 0.96 });
  GM.btn = new T.MeshStandardMaterial({ color: C('#3a3f45'), roughness: 0.45, metalness: 0.2 });
  GM.metal = new T.MeshStandardMaterial({ color: C('#b8bec5'), roughness: 0.3, metalness: 0.9 });
  GM.gold = new T.MeshStandardMaterial({ color: C('#d4a640'), roughness: 0.3, metalness: 0.9 });
  GM.black = new T.MeshStandardMaterial({ color: C('#0d0e10'), roughness: 0.5 });
  GM.ant = new T.MeshStandardMaterial({ color: C('#3b4046'), roughness: 0.5 });
  GM.red = new T.MeshStandardMaterial({ color: C('#c8392c'), roughness: 0.45 });
  GM.mod = new T.MeshStandardMaterial({ color: C('#30353c'), roughness: 0.5, metalness: 0.15 });
  GM.strap = new T.MeshStandardMaterial({ color: C('#202327'), roughness: 0.9 });
  GM.led = new T.MeshBasicMaterial({ color: C('#33383e'), toneMapped: false });
  GM.ledOn = new T.MeshBasicMaterial({ color: new T.Color('#57e08a'), toneMapped: false });
  GM.hit = new T.MeshBasicMaterial({ visible: false });
}
function mk(parent, geo, mat, pos, rot) {
  const m = new T.Mesh(geo, mat); if (pos) m.position.set(pos[0], pos[1], pos[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  parent.add(m); return m;
}
/* невидима зона влучання навколо дрібного органу керування + якір для підказки */
function ctlZone(parent, id, size, pos) {
  const h = mk(parent, box(size[0], size[1], size[2]), GM.hit, pos); h.userData.gid = id; GP.pick.push(h);
  const a = new T.Object3D(); a.position.set(pos[0], pos[1], pos[2]); parent.add(a); GP.anchor[id] = a;
  return h;
}
function shellGeo(w, h, d, r, bevel) {
  const g = new T.ExtrudeGeometry(rrect(w, h, r), { depth: d, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, -d / 2); return g;
}
function knurlWheel(r, w) { const g = cyl(r, r, w, 20); g.rotateZ(Math.PI / 2); return g; }
/* цифрові окуляри: суцільний корпус, складані антени-лопатки, 5D і «Назад» зверху праворуч, батарея в оголів’ї */
function buildDG() {
  const g = new T.Group();
  mk(g, shellGeo(8.4, 4.0, 3.2, 1.5, 0.35), GM.shell);
  mk(g, new T.ExtrudeGeometry(rrect(7.6, 3.3, 1.2), { depth: 0.08, bevelEnabled: false }), GM.glass, [0, 0, 1.93]);
  for (const sx of [-1, 1]) mk(g, cyl(0.22, 0.22, 0.1, 18), GM.black, [sx * 1.1, -1.05, 2.03], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 6; i++) mk(g, box(0.9, 0.04, 0.12), GM.black, [-1.5 + i * 0.6, 2.36, 0.2]);
  mk(g, new T.ExtrudeGeometry(rrect(7.8, 3.4, 1.3), { depth: 0.9, bevelEnabled: false }), GM.foam, [0, 0, -2.85]);
  /* антени */
  GP.antsDG = [];
  for (const sx of [-1, 1]) {
    const piv = new T.Group(); piv.position.set(sx * 3.55, 1.95, -0.6); g.add(piv);
    mk(piv, cyl(0.16, 0.16, 0.5, 12), GM.btn, [0, 0, 0], [0, 0, Math.PI / 2]);
    const pad = new T.Mesh(new T.ExtrudeGeometry(rrect(0.55, 3.0, 0.25), { depth: 0.14, bevelEnabled: false }), GM.ant);
    pad.position.set(0, 1.6, -0.07); piv.add(pad);
    piv.userData.sx = sx; GP.antsDG.push(piv);
  }
  ctlZone(g, 'dANT', [8.6, 1.2, 1.2], [0, 2.7, -0.6]);
  /* 5D і «Назад» */
  mk(g, cyl(0.13, 0.13, 0.35, 10), GM.btn, [-2.6, 2.48, 0.9]);
  GP.knob5d = mk(g, cyl(0.36, 0.32, 0.22, 18), GM.metal, [-2.6, 2.7, 0.9]);
  mk(g, cyl(0.28, 0.28, 0.14, 16), GM.btn, [-1.45, 2.42, 1.05]);
  ctlZone(g, 'd5D', [0.95, 0.8, 0.95], [-2.6, 2.6, 0.9]);
  ctlZone(g, 'dBACK', [0.8, 0.6, 0.8], [-1.45, 2.45, 1.05]);
  /* бокові: microSD і USB-C ліворуч (для пілота), зона Real View праворуч */
  mk(g, box(0.06, 0.18, 1.2), GM.black, [4.27, 0.5, 0.4]);
  mk(g, box(0.06, 0.32, 0.9), GM.black, [4.27, -0.7, 0.2]);
  ctlZone(g, 'dSD', [0.5, 0.6, 1.5], [4.3, 0.5, 0.4]);
  ctlZone(g, 'dUSB', [0.5, 0.6, 1.2], [4.3, -0.7, 0.2]);
  ctlZone(g, 'dRV', [0.5, 2.6, 2.6], [-4.3, 0, 0.3]);
  /* коліщата діоптрій/IPD знизу */
  for (const sx of [-1, 1]) mk(g, knurlWheel(0.42, 0.5), GM.metal, [sx * 1.9, -2.15, 0.4]);
  ctlZone(g, 'dIPD', [5.2, 0.9, 1.2], [0, -2.15, 0.4]);
  /* оголів’я з батареєю */
  const strap = mk(g, new T.TorusGeometry(4.4, 0.32, 8, 48, Math.PI), GM.strap, [0, 0.3, -2.9], [Math.PI / 2, 0, Math.PI]);
  strap.scale.set(1, 1.25, 1);
  const bat = mk(g, new T.ExtrudeGeometry(rrect(3.4, 2.2, 0.6), { depth: 1.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 2 }), GM.shell, [0, 0.1, -9.0]);
  bat.geometry.translate(0, 0, -0.65);
  mk(g, knurlWheel(0.38, 0.6), GM.btn, [0, -1.0, -9.0], [0, Math.PI / 2, 0]);
  GP.leds = [];
  for (let i = 0; i < 4; i++) GP.leds.push(mk(g, box(0.22, 0.08, 0.22), GM.led, [-0.75 + i * 0.5, 1.27, -8.7]));
  mk(g, cyl(0.26, 0.26, 0.16, 16), GM.btn, [1.25, 1.3, -9.15]);
  ctlZone(g, 'dPWR', [0.8, 0.7, 0.8], [1.25, 1.35, -9.15]);
  ctlZone(g, 'dLED', [2.2, 0.5, 0.8], [-0.0, 1.3, -8.7]);
  ctlZone(g, 'dBAT', [3.6, 2.4, 1.6], [0, 0.1, -9.6]);
  return g;
}
/* аналогові окуляри: тонкий корпус, модуль приймача з двома антенами спереду ліворуч, вентилятор праворуч,
 * два колеса й дві кнопки зверху, кнопка живлення на правій скроні, окремий акумулятор на ремінці */
function buildAN() {
  const g = new T.Group();
  mk(g, shellGeo(9.0, 3.3, 3.0, 0.9, 0.25), GM.shellA);
  mk(g, new T.ExtrudeGeometry(rrect(8.4, 2.8, 0.7), { depth: 0.06, bevelEnabled: false }), GM.glass, [0, 0, 1.76]);
  mk(g, new T.ExtrudeGeometry(rrect(8.6, 2.9, 0.8), { depth: 0.9, bevelEnabled: false }), GM.foamD, [0, 0, -2.6]);
  /* модуль приймача й антени (ліворуч для пілота = +x) */
  mk(g, box(2.7, 1.5, 0.9), GM.mod, [2.65, 0.75, 2.2]);
  mk(g, box(1.6, 0.12, 0.02), GM.gold, [2.65, 0.95, 2.66]);
  GP.anAnt = new T.Group(); g.add(GP.anAnt);
  for (const [sx, kind] of [[1.9, 'omni'], [3.4, 'patch']]) {
    mk(g, cyl(0.2, 0.2, 0.45, 12), GM.gold, [sx, 1.7, 2.2]);
    if (kind === 'omni') {
      mk(GP.anAnt, cyl(0.12, 0.12, 2.0, 10), GM.ant, [sx, 2.9, 2.2]);
      const cap = mk(GP.anAnt, new T.SphereGeometry(0.62, 20, 12), GM.red, [sx, 4.15, 2.2]); cap.scale.set(1, 0.62, 1);
    } else {
      mk(GP.anAnt, cyl(0.14, 0.14, 0.9, 10), GM.ant, [sx, 2.25, 2.2]);
      mk(GP.anAnt, box(1.9, 1.9, 0.35), GM.ant, [sx, 3.5, 2.35], [-0.12, 0, 0]);
    }
  }
  ctlZone(g, 'aANT', [3.4, 2.8, 1.2], [2.65, 3.2, 2.25]);
  ctlZone(g, 'aMOD', [2.8, 1.6, 1.0], [2.65, 0.75, 2.25]);
  /* вентилятор (праворуч = −x) */
  const fan = new T.Group(); fan.position.set(-2.7, 0.35, 1.82); g.add(fan);
  mk(fan, new T.TorusGeometry(0.75, 0.07, 6, 28), GM.btn);
  GP.fan = new T.Group(); fan.add(GP.fan);
  for (let i = 0; i < 5; i++) { const p = new T.Group(); p.rotation.z = i * 1.2566; GP.fan.add(p); mk(p, box(0.6, 0.18, 0.04), GM.btn, [0.32, 0, 0]); }
  ctlZone(g, 'aFAN', [1.8, 1.8, 0.4], [-2.7, 0.35, 1.9]);
  /* колеса й кнопки зверху */
  GP.wheels = {};
  for (const [id, sx] of [['aLW', 3.55], ['aRW', -3.55]]) { GP.wheels[id] = mk(g, knurlWheel(0.48, 0.32), GM.metal, [sx, 1.62, -0.35]); ctlZone(g, id, [0.8, 0.9, 1.2], [sx, 1.85, -0.35]); }
  for (const [id, sx] of [['aLB', 2.55], ['aRB', -2.55]]) { mk(g, cyl(0.27, 0.27, 0.16, 16), GM.btn, [sx, 1.72, -0.55]); ctlZone(g, id, [0.75, 0.6, 0.75], [sx, 1.8, -0.55]); }
  /* кнопка живлення на правій скроні */
  mk(g, cyl(0.3, 0.3, 0.16, 16), GM.btn, [-4.62, 0.15, -0.6], [0, 0, Math.PI / 2]);
  ctlZone(g, 'aPWR', [0.6, 0.8, 0.8], [-4.65, 0.15, -0.6]);
  /* порти */
  for (const [y, z] of [[-0.55, -0.3], [-0.55, 0.45], [0.35, 0.45]]) mk(g, box(0.06, 0.28, 0.45), GM.black, [4.62, y, z]);
  mk(g, box(0.06, 0.34, 0.75), GM.black, [-4.62, -0.6, 0.6]);
  mk(g, box(0.06, 0.16, 0.9), GM.black, [-4.62, -0.95, -0.4]);
  ctlZone(g, 'aDC', [0.6, 0.6, 0.8], [4.66, -0.55, -0.3]);
  ctlZone(g, 'aHDMI', [0.6, 0.6, 1.0], [-4.66, -0.6, 0.6]);
  ctlZone(g, 'aSD', [0.6, 0.4, 1.1], [-4.66, -0.95, -0.4]);
  /* IPD і фокус знизу */
  for (const sx of [-1, 1]) mk(g, box(0.5, 0.25, 0.5), GM.btn, [sx * 1.7, -1.78, 0.75]);
  mk(g, knurlWheel(0.38, 0.6), GM.metal, [0, -1.72, 0.2]);
  ctlZone(g, 'aIPD', [4.4, 0.6, 0.9], [0, -1.85, 0.8]);
  ctlZone(g, 'aFOC', [1.0, 0.8, 0.9], [0, -1.8, 0.1]);
  /* ремінець, акумулятор і кабель до DC */
  const strap = mk(g, new T.TorusGeometry(4.7, 0.28, 8, 48, Math.PI), GM.strap, [0, 0.1, -2.7], [Math.PI / 2, 0, Math.PI]);
  strap.scale.set(1, 1.25, 1);
  mk(g, box(3.6, 1.3, 2.2), GM.black, [0, 0.1, -8.9]);
  mk(g, box(3.4, 0.05, 1.2), GM.red, [0, 0.77, -8.9]);
  ctlZone(g, 'aBAT', [3.8, 1.5, 2.4], [0, 0.1, -8.9]);
  const cable = new T.CatmullRomCurve3([new T.Vector3(1.0, 0.1, -7.8), new T.Vector3(4.6, -0.6, -5.5), new T.Vector3(5.1, -0.8, -1.5), new T.Vector3(4.7, -0.55, -0.3)]);
  mk(g, new T.TubeGeometry(cable, 40, 0.09, 6, false), GM.black);
  return g;
}
/* екран пілота — площина з текстурою-canvas */
const SW = 640, SH = 360;
let scrCv = null, scrX = null, scrTex = null, worldCv = null, worldX = null, lowCv = null, lowX = null;
const noiseCv = [];
function gogScreenInit() {
  scrCv = document.createElement('canvas'); scrCv.width = SW; scrCv.height = SH; scrX = scrCv.getContext('2d');
  worldCv = document.createElement('canvas'); worldCv.width = SW; worldCv.height = SH; worldX = worldCv.getContext('2d');
  lowCv = document.createElement('canvas'); lowCv.width = SW / 8; lowCv.height = SH / 8; lowX = lowCv.getContext('2d');
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const x = c.getContext('2d'), im = x.createImageData(320, 180);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    x.putImageData(im, 0, 0); noiseCv.push(c);
  }
  scrTex = new T.CanvasTexture(scrCv); scrTex.encoding = T.sRGBEncoding; scrTex.generateMipmaps = false; scrTex.minFilter = T.LinearFilter;
}
export function gogInit() {
  gm();
  gogG = new T.Group(); gogG.visible = false; scene.add(gogG);
  GP.dg = buildDG(); GP.an = buildAN(); gogG.add(GP.dg, GP.an);
  gogScreenInit();
  const sg = new T.Group(); gogG.add(sg); GP.screenG = sg;
  mk(sg, box(16.8, 9.8, 0.4), GM.black, [0, 0, -0.25]);
  GP.scr = mk(sg, new T.PlaneGeometry(16, 9), new T.MeshBasicMaterial({ map: scrTex, toneMapped: false }));
  GP.glow = glowSprite('#ffb21a', 1.6); GP.glow.material.depthTest = false; GP.glow.renderOrder = 999; GP.glow.visible = false; gogG.add(GP.glow);
  gogLayout(); gogScreen();
}
function gogLayout() {
  const narrow = camera.aspect < 1.05;
  for (const k of ['an', 'dg']) { const m = GP[k]; m.visible = GOG.dev === k; m.rotation.y = 0.55; m.scale.setScalar(0.8); m.position.set(narrow ? 0 : -5.6, narrow ? -4.2 : 0.5, narrow ? 1.5 : 2.5); }
  GP.screenG.scale.setScalar(narrow ? 0.9 : 0.86); GP.screenG.position.set(narrow ? 0 : 7.2, narrow ? 5.6 : 2.4, narrow ? -4 : -5.5); GP.screenG.rotation.y = narrow ? 0 : -0.28;
}
export function gogFrame(view) {
  if (!ok3d || !gogG) return;
  GOG.view = view || GOG.view;
  document.querySelectorAll('[data-gview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.gview === GOG.view)));
  gogLayout();
  const m = GP[GOG.dev], sp = GP.screenG.position;
  m.updateMatrixWorld(true);
  if (GOG.view === 'goggles') setView(m.localToWorld(new T.Vector3(0, 0.6, -2.4)), -0.4, 0.42, fitDist(6.2));
  else if (GOG.view === 'screen') setView(sp.clone(), GP.screenG.rotation.y, 0.02, fitDist(7.4));
  else if (camera.aspect < 1.05) setView(new T.Vector3(0, 0.9, -1), -0.18, 0.3, fitDist(9.6));
  else setView(new T.Vector3(1.2, 0.9, -1.5), -0.18, 0.32, fitDist(13.6));
}
export function gogEnter() {
  if (!gogG) return;
  gogG.visible = true; ctl.auto = false; updateSpinBtn();
  gogFrame(GOG.view); GOG.scrT = 1;
}
export function gogExit() {
  if (gogG) gogG.visible = false;
  for (const [k, e] of LB) if (k.startsWith('gog')) e.on = false;
  GOG.hover = null; canvas.classList.remove('hovering');
}
export function gogTheme() { GOG.scrT = 1; }

/* ================= ЕКРАН ПІЛОТА ================= */
const OSD_F = (w, s) => `${w} ${s}px "IBM Plex Mono", ui-monospace, monospace`;
function osdText(x, t, px, py, align = 'left', size = 17, col = '#ffffff') {
  x.font = OSD_F(700, size); x.textAlign = align; x.textBaseline = 'middle';
  x.lineWidth = 4; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(t, px, py); x.fillStyle = col; x.fillText(t, px, py);
}
/* «вигляд з дрона»: небо, поле, лінія дерев, ворота, що наближаються; легкий крен і тангаж */
function drawWorld(t) {
  const x = worldX, roll = 0.16 * Math.sin(t * 0.45) + 0.05 * Math.sin(t * 1.3), pit = 16 * Math.sin(t * 0.33), yaw = 140 * Math.sin(t * 0.17);
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
  x.translate(SW / 2, SH * 0.42 + pit); x.rotate(roll);
  let gr = x.createLinearGradient(0, -SH, 0, 0); gr.addColorStop(0, '#3f7fd0'); gr.addColorStop(1, '#bcd6ec');
  x.fillStyle = gr; x.fillRect(-SW, -SH * 1.5, SW * 2, SH * 1.5);
  gr = x.createLinearGradient(0, 0, 0, SH); gr.addColorStop(0, '#6b8e4a'); gr.addColorStop(1, '#3e6a2c');
  x.fillStyle = gr; x.fillRect(-SW, 0, SW * 2, SH * 1.5);
  /* далекі пагорби */
  x.fillStyle = '#7d93a4';
  x.beginPath(); x.moveTo(-SW, 0);
  for (let i = -SW; i <= SW; i += 40) x.lineTo(i, -10 - 14 * (Math.sin((i + yaw * 0.3) * 0.012) + 1));
  x.lineTo(SW, 0); x.closePath(); x.fill();
  /* смуги поля в перспективі */
  x.strokeStyle = 'rgba(40,70,30,0.45)'; x.lineWidth = 2;
  const sh = (t * 90) % 60;
  for (let i = -12; i <= 12; i++) { x.beginPath(); x.moveTo(i * 8 + yaw * 0.05, 0); x.lineTo(i * 150 + yaw, SH * 1.2); x.stroke(); }
  for (let k = 0; k < 8; k++) { const z = (k * 60 + sh) / 480, y = Math.pow(z, 2.2) * SH * 1.1; x.strokeStyle = `rgba(40,70,30,${0.15 + z * 0.3})`; x.beginPath(); x.moveTo(-SW, y); x.lineTo(SW, y); x.stroke(); }
  /* лінія дерев */
  for (let i = 0; i < 26; i++) {
    const px = ((i * 61 + yaw * 0.6) % (SW * 1.6) + SW * 1.6) % (SW * 1.6) - SW * 0.8, h = 10 + (i * 37 % 13);
    x.fillStyle = i % 3 ? '#2f5530' : '#3b6436';
    x.beginPath(); x.moveTo(px - 7, 1); x.lineTo(px, -h); x.lineTo(px + 7, 1); x.closePath(); x.fill();
  }
  /* ворота траси */
  const z = (t * 0.17) % 1, s = 24 + 520 * z * z, gx = 60 * Math.sin(t * 0.6) * (1 - z) - yaw * 0.1;
  x.lineWidth = Math.max(2, s * 0.06); x.strokeStyle = '#ff8a1c'; x.globalAlpha = Math.min(1, z * 4);
  x.strokeRect(gx - s / 2, s * 0.06 - s * 0.7, s, s * 0.7); x.globalAlpha = 1;
  x.restore();
  /* пропелери в кадрі */
  x.fillStyle = 'rgba(20,20,20,0.22)';
  for (const sx of [-1, 1]) { x.beginPath(); x.ellipse(SW / 2 + sx * (SW / 2 + 10), -6, 110, 46, 0, 0, Math.PI * 2); x.fill(); }
}
function noise(x, a) {
  if (a <= 0.01) return;
  const n = noiseCv[(Math.random() * noiseCv.length) | 0], ox = (Math.random() * 300) | 0, oy = (Math.random() * 170) | 0;
  x.globalAlpha = a; x.imageSmoothingEnabled = false;
  x.drawImage(n, -ox, -oy, SW * 1.5, SH * 1.5);
  x.globalAlpha = 1; x.imageSmoothingEnabled = true;
}
function panel(x, px, py, w, h, a = 0.9) { x.fillStyle = `rgba(12,14,18,${a})`; x.beginPath(); if (x.roundRect) x.roundRect(px, py, w, h, 10); else x.rect(px, py, w, h); x.fill(); }
function list(x, px, py, w, rows, sel, title) {
  const rh = 30, h = rows.length * rh + (title ? 44 : 14);
  panel(x, px, py, w, h);
  let y = py + 8;
  if (title) { x.font = OSD_F(700, 15); x.fillStyle = '#ffb21a'; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillText(title, px + 14, y + 14); y += 34; }
  rows.forEach((r, i) => {
    if (i === sel) { x.fillStyle = 'rgba(255,178,26,0.9)'; x.fillRect(px + 6, y, w - 12, rh - 4); }
    x.font = OSD_F(i === sel ? 700 : 500, 14); x.textBaseline = 'middle'; x.textAlign = 'left';
    x.fillStyle = i === sel ? '#15110a' : r.dis ? '#7d858e' : '#e9ecef'; x.fillText(r.t, px + 16, y + (rh - 4) / 2);
    if (r.v) { x.textAlign = 'right'; x.fillText(r.v, px + w - 16, y + (rh - 4) / 2); }
    y += rh;
  });
}
function msgBox(x, t) {
  x.font = OSD_F(700, 16); const w = Math.min(SW - 40, x.measureText(t).width + 40);
  panel(x, (SW - w) / 2, SH * 0.62, w, 40, 0.82); x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, SW / 2, SH * 0.62 + 20);
}
function anFrame(x) {
  const A = GOG.an, L = GOG.lk, q = L.q;
  if (A.menu === 'play' && A.play && A.files) { x.drawImage(worldCv, 0, 0); osdText(x, `▶ PLAY · запис ${A.files}`, 18, SH - 24, 'left', 15); }
  else if (A.src === 'AV' || A.src === 'HDMI') {
    x.fillStyle = '#05070a'; x.fillRect(0, 0, SW, SH);
    osdText(x, `${A.src} IN · немає сигналу на вході`, SW / 2, SH / 2, 'center', 18, '#cfd5db');
  } else {
    if (q > 0.02) {
      x.drawImage(worldCv, 0, 0);
      x.fillStyle = 'rgba(255,236,214,0.07)'; x.fillRect(0, 0, SW, SH);
      if (q < 0.65) { x.globalCompositeOperation = 'saturation'; x.fillStyle = `rgba(128,128,128,${Math.min(1, (0.65 - q) * 1.6)})`; x.fillRect(0, 0, SW, SH); x.globalCompositeOperation = 'source-over'; }
      if (q < 0.55) for (let k = 0; k < 6; k++) { const y = Math.random() * SH | 0, h = 6 + Math.random() * 22 | 0, dx = (Math.random() - 0.5) * (1 - q) * 70; x.drawImage(scrCv, 0, y, SW, h, dx, y, SW, h); }
      if (q < 0.35) { const by = (GOG.t * 140) % (SH + 80) - 40; x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, by, SW, 26); }
      if (q > 0.15) {
        const j = q < 0.5 ? (Math.random() - 0.5) * 4 : 0;
        x.globalAlpha = Math.min(1, q * 1.6);
        osdText(x, '16.2V', 26 + j, SH - 30, 'left', 18); osdText(x, `0${Math.floor(GOG.t / 60) % 10}:${String(Math.floor(GOG.t) % 60).padStart(2, '0')}`, SW - 26 + j, SH - 30, 'right', 18);
        osdText(x, 'LQ 100', SW - 26 + j, SH - 56, 'right', 16); osdText(x, 'ANGLE', SW / 2 + j, SH - 30, 'center', 16);
        x.globalAlpha = 1;
      }
    } else { x.fillStyle = '#101010'; x.fillRect(0, 0, SW, SH); }
    noise(x, q <= 0.02 ? 1 : q >= 0.98 ? 0.035 : Math.min(1, 0.05 + Math.pow(1 - q, 1.35) * 0.95));
  }
  /* розгортка аналогового екрана */
  x.fillStyle = 'rgba(0,0,0,0.07)'; for (let y = 0; y < SH; y += 3) x.fillRect(0, y, SW, 1);
  /* верхній рядок — малюють окуляри */
  x.fillStyle = 'rgba(0,0,0,0.38)'; x.fillRect(0, 0, SW, 30);
  osdText(x, `${chName(A.band, A.ch)} ${BANDS[A.band][A.ch]}`, 12, 15, 'left', 15);
  osdText(x, A.mode, 168, 15, 'left', 13, '#cfd5db');
  for (let i = 0; i < 5; i++) { x.fillStyle = L.rssi > i * 20 + 5 && A.src === 'RF' ? '#ffffff' : 'rgba(255,255,255,0.25)'; x.fillRect(250 + i * 9, 22 - i * 3, 6, 4 + i * 3); }
  osdText(x, `${A.src === 'RF' ? L.rssi : 0}%`, 300, 15, 'left', 14);
  osdText(x, `${fmt(3.95 * A.batt, 1)}V`, SW - 12, 15, 'right', 15);
  if (A.rec) { x.fillStyle = Math.floor(GOG.t * 2) % 2 ? '#ff3b30' : '#a8241d'; x.beginPath(); x.arc(SW - 150, 15, 6, 0, Math.PI * 2); x.fill(); osdText(x, `REC ${String(Math.floor(A.recT / 60)).padStart(2, '0')}:${String(Math.floor(A.recT) % 60).padStart(2, '0')}`, SW - 140, 15, 'left', 13); }
  if (A.fan) osdText(x, 'FAN', SW - 205, 15, 'right', 12, '#cfd5db');
  /* налаштування каналу правим колесом */
  if (A.set) {
    panel(x, SW / 2 - 170, 52, 340, 92);
    const cells = [['ch', 'КАНАЛ', String(A.ch + 1)], ['band', 'БЕНД', A.band], ['mode', 'РЕЖИМ', A.mode]];
    cells.forEach(([k, n, v], i) => {
      const cx = SW / 2 - 112 + i * 112;
      if (A.set === k) { x.fillStyle = 'rgba(255,178,26,0.9)'; x.fillRect(cx - 50, 60, 100, 56); }
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = OSD_F(600, 11); x.fillStyle = A.set === k ? '#15110a' : '#9aa4ae'; x.fillText(n, cx, 72);
      x.font = OSD_F(700, 22); x.fillStyle = A.set === k ? '#15110a' : '#ffffff'; x.fillText(v, cx, 98);
    });
    x.font = OSD_F(500, 13); x.fillStyle = '#e9ecef'; x.fillText(`${chName(A.band, A.ch)} · ${BANDS[A.band][A.ch]} МГц`, SW / 2, 132);
  }
  if (A.menu === 'mode') list(x, SW / 2 - 190, 46, 380, AN_MODE_MENU.map(m => ({ t: m[1], v: m[0] === A.src ? '●' : '' })), A.mi, 'Режим');
  else if (A.menu === 'sys') list(x, SW / 2 - 200, 40, 400, AN_SYS.map(s => ({ t: s.t, v: s.v() })), A.mi, 'Системне меню');
  else if (A.menu === 'play' && !A.play) list(x, SW / 2 - 170, 60, 340, A.files ? Array.from({ length: Math.min(6, A.files) }, (_, i) => ({ t: `DVR_${String(A.files - i).padStart(3, '0')}.AVI`, v: '' })) : [{ t: 'Записів немає', v: '' }], A.mi, 'Playback');
  else if (A.menu === 'finder') {
    panel(x, 60, SH / 2 - 50, SW - 120, 100);
    x.textAlign = 'left'; x.font = OSD_F(700, 15); x.fillStyle = '#ffb21a'; x.textBaseline = 'middle'; x.fillText('DRONE FINDER', 80, SH / 2 - 26);
    x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(80, SH / 2, SW - 160, 22);
    x.fillStyle = L.rssi > 60 ? '#57e08a' : L.rssi > 30 ? '#ffb21a' : '#ff6b5b'; x.fillRect(80, SH / 2, (SW - 160) * L.rssi / 100, 22);
    x.font = OSD_F(600, 13); x.fillStyle = '#e9ecef'; x.textAlign = 'right'; x.fillText(`RSSI ${L.rssi}%`, SW - 80, SH / 2 - 26);
  } else if (A.menu === 'search' && A.search) {
    const s = A.search;
    panel(x, 40, 46, SW - 80, 180);
    x.font = OSD_F(700, 15); x.fillStyle = '#ffb21a'; x.textAlign = 'left'; x.textBaseline = 'middle';
    x.fillText(s.stage === 'ready' ? 'ПОШУК · натисніть колесо, щоб почати' : s.stage === 'scan' ? 'ПОШУК…' : `ЗНАЙДЕНО · ${chName(A.band, A.ch)} ${BANDS[A.band][A.ch]}`, 58, 68);
    const all = anAllCh(), bw = (SW - 120) / all.length;
    all.forEach(([b, i], k) => {
      const r = s.lvl ? s.lvl[k] : 0, h = 110 * r / 100;
      x.fillStyle = s.stage === 'done' && b === A.band && i === A.ch ? '#ffb21a' : k === s.i && s.stage === 'scan' ? '#ffffff' : 'rgba(160,190,220,0.8)';
      x.fillRect(60 + k * bw, 200 - h, Math.max(2, bw - 2), h);
    });
    x.font = OSD_F(500, 11); x.fillStyle = '#9aa4ae'; BAND_ORDER.forEach((b, i) => x.fillText(b, 60 + i * 8 * bw + 2, 214));
  }
  if (A.msgT > 0 && A.msg) msgBox(x, A.msg);
}
function dgTopBar(x, L) {
  const D = GOG.dg;
  x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, 0, SW, 30);
  for (let i = 0; i < 4; i++) { x.fillStyle = L.bars > i ? '#ffffff' : 'rgba(255,255,255,0.25)'; x.fillRect(12 + i * 8, 22 - i * 4, 5, 4 + i * 4); }
  osdText(x, D.bound ? 'O4' : '—', 50, 15, 'left', 13, '#cfd5db');
  const lc = L.st === 'ok' ? '#ffffff' : L.st === 'weak' ? '#ffb21a' : '#ff6b5b';
  osdText(x, L.br ? `${L.br} Мбіт/с` : '— Мбіт/с', 92, 15, 'left', 14, lc);
  osdText(x, L.lat ? `${L.lat} мс` : '— мс', 228, 15, 'left', 14, lc);
  osdText(x, `${L.fps}fps · ${L.bw}МГц`, 318, 15, 'left', 12, '#cfd5db');
  osdText(x, `${D.batt}%`, SW - 12, 15, 'right', 14);
  osdText(x, D.sd ? '2:14:30' : 'Немає SD', SW - 66, 15, 'right', 12, D.sd ? '#cfd5db' : '#ff6b5b');
  if (D.rec) { x.fillStyle = Math.floor(GOG.t * 2) % 2 ? '#ff3b30' : '#a8241d'; x.beginPath(); x.arc(SW - 196, 15, 6, 0, Math.PI * 2); x.fill(); osdText(x, `${String(Math.floor(D.recT / 60)).padStart(2, '0')}:${String(Math.floor(D.recT) % 60).padStart(2, '0')}`, SW - 186, 15, 'left', 12); }
}
function dgFrame(x, fresh) {
  const D = GOG.dg, L = GOG.lk;
  if (!D.bound) {
    x.fillStyle = '#14171b'; x.fillRect(0, 0, SW, SH);
    if (D.bind > 0) {
      const r = 30 + 10 * Math.sin(GOG.t * 6);
      x.strokeStyle = '#ffb21a'; x.lineWidth = 4; x.beginPath(); x.arc(SW / 2, SH / 2 - 20, r, 0, Math.PI * 2); x.stroke();
      osdText(x, D.linking > 0 ? 'Прив’язка…' : `Режим прив’язки · ${Math.ceil(D.bind)} с`, SW / 2, SH / 2 + 40, 'center', 18);
      osdText(x, 'Натисніть кнопку прив’язки на повітряному модулі', SW / 2, SH / 2 + 68, 'center', 13, '#cfd5db');
    } else {
      osdText(x, 'Немає зв’язку з повітряним модулем', SW / 2, SH / 2 - 6, 'center', 18);
      osdText(x, 'Утримайте кнопку живлення до сигналу, щоб прив’язати', SW / 2, SH / 2 + 24, 'center', 13, '#cfd5db');
    }
  } else if (L.st === 'lost') {
    if (D.frozen < 1.2) { x.drawImage(worldCv, 0, 0); x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 0, SW, SH); }
    else { x.fillStyle = '#1b1e22'; x.fillRect(0, 0, SW, SH); }
    osdText(x, 'Сигнал втрачено', SW / 2, SH / 2, 'center', 22, '#ff8a7a');
  } else {
    x.drawImage(worldCv, 0, 0);
    if (L.m < 6 && fresh) {
      /* макроблоки: частина кадру з низькою роздільністю */
      const pf = L.m < 0 ? 16 : 8; lowCv.width = SW / pf; lowCv.height = SH / pf;
      lowX.imageSmoothingEnabled = true; lowX.drawImage(worldCv, 0, 0, lowCv.width, lowCv.height);
      x.imageSmoothingEnabled = false;
      const n = L.m < 0 ? 14 : 5;
      for (let k = 0; k < n; k++) { const bx = (Math.random() * (lowCv.width - 6)) | 0, by = (Math.random() * (lowCv.height - 4)) | 0, bw = 3 + (Math.random() * 6 | 0), bh = 2 + (Math.random() * 4 | 0); x.drawImage(lowCv, bx, by, bw, bh, bx * pf, by * pf, bw * pf, bh * pf); }
      x.imageSmoothingEnabled = true;
    }
    if (D.osd) {
      osdText(x, '16.2V', 30, SH - 30, 'left', 17); osdText(x, `0${Math.floor(GOG.t / 60) % 10}:${String(Math.floor(GOG.t) % 60).padStart(2, '0')}`, SW - 30, SH - 30, 'right', 17);
      osdText(x, 'LQ 100', SW - 30, SH - 56, 'right', 15); osdText(x, 'ANGLE', SW / 2, SH - 30, 'center', 15); osdText(x, '2.1A', 30, SH - 56, 'left', 15);
    }
    if (L.st === 'weak') osdText(x, 'Слабкий сигнал', SW / 2, 54, 'center', 15, '#ffb21a');
  }
  if (D.heat && D.bound) { panel(x, 40, SH - 92, SW - 80, 34, 0.8); osdText(x, 'Висока температура модуля — потужність знижено', SW / 2, SH - 75, 'center', 13, '#ffb21a'); }
  if (D.rv) {
    panel(x, 16, 40, 200, 118, 0.9);
    const g = x.createLinearGradient(0, 46, 0, 152); g.addColorStop(0, '#9aa7b3'); g.addColorStop(0.55, '#c3ccd3'); g.addColorStop(0.56, '#6f7f5e'); g.addColorStop(1, '#55673f');
    x.fillStyle = g; x.fillRect(22, 46, 188, 106);
    x.fillStyle = '#3d4a33'; for (let i = 0; i < 6; i++) x.fillRect(30 + i * 30, 98 - (i % 2) * 6, 10, 10 + (i % 2) * 6);
    osdText(x, 'Real View', 30, 142, 'left', 12);
  }
  dgTopBar(x, L);
  if (D.menu === 'main') {
    panel(x, 60, 46, SW - 120, 230);
    DG_TABS.forEach((tb, i) => {
      const y = 62 + i * 46, on = i === D.mi;
      if (on) { x.fillStyle = D.lvl === 0 ? 'rgba(255,178,26,0.9)' : 'rgba(255,178,26,0.25)'; x.fillRect(70, y - 4, 150, 38); }
      x.font = OSD_F(on ? 700 : 500, 15); x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = on && D.lvl === 0 ? '#15110a' : '#e9ecef'; x.fillText(tb.t, 84, y + 15);
    });
    const items = dgItems();
    items.forEach((it, i) => {
      const y = 62 + i * 40, on = D.lvl === 1 && i === D.si;
      if (on) { x.fillStyle = 'rgba(255,178,26,0.9)'; x.fillRect(236, y - 2, SW - 312, 34); }
      x.font = OSD_F(on ? 700 : 500, 14); x.textAlign = 'left'; x.fillStyle = on ? '#15110a' : it.dis ? '#7d858e' : '#e9ecef'; x.fillText(it.t, 250, y + 15);
      x.textAlign = 'right'; x.fillText(it.v || '', SW - 88, y + 15);
    });
  } else if (D.menu === 'cam') list(x, SW / 2 - 180, 50, 360, DG_CAM(), D.si, 'Камера');
  else if (D.menu === 'quick') list(x, SW / 2 - 170, SH - 170, 340, DG_QUICK(), D.si, 'Швидке меню');
  if (D.msgT > 0 && D.msg) msgBox(x, D.msg);
}
export function gogScreen() {
  if (!scrX) return;
  const x = scrX, an = GOG.dev === 'an', dev = an ? GOG.an : GOG.dg;
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
  if (!dev.on) {
    x.fillStyle = '#030405'; x.fillRect(0, 0, SW, SH);
    x.fillStyle = 'rgba(255,255,255,0.05)'; x.beginPath(); x.ellipse(SW * 0.3, SH * 0.3, 160, 60, -0.4, 0, Math.PI * 2); x.fill();
    osdText(x, 'Окуляри вимкнені', SW / 2, SH / 2, 'center', 16, '#5c646c');
  } else if (dev.boot > 0) {
    x.fillStyle = '#0a0c0f'; x.fillRect(0, 0, SW, SH);
    const p = 1 - dev.boot / (an ? 1.6 : 2);
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(SW / 2 - 120, SH / 2 + 24, 240, 6);
    x.fillStyle = '#ffb21a'; x.fillRect(SW / 2 - 120, SH / 2 + 24, 240 * p, 6);
    osdText(x, 'Завантаження…', SW / 2, SH / 2 - 6, 'center', 18, '#e9ecef');
  } else {
    const D = GOG.dg, L = GOG.lk;
    /* цифра на слабкому сигналі пропускає кадри, а при втраті — зависає на останньому */
    const stall = !an && (L.st === 'lost' || (L.st === 'weak' && Math.random() < 0.35));
    if (an || (D.bound && !stall)) drawWorld(GOG.t);
    if (an) anFrame(x); else dgFrame(x, !stall);
  }
  const b = an ? GOG.an.bright / 8 : GOG.dg.bright / 5;
  if (dev.on && b < 0.99) { x.fillStyle = `rgba(0,0,0,${(1 - b) * 0.45})`; x.fillRect(0, 0, SW, SH); }
  scrTex.needsUpdate = true;
}

/* ================= КАДР ================= */
function gogStep(dt) {
  GOG.t += dt;
  const A = GOG.an, D = GOG.dg;
  if (A.boot > 0) A.boot = Math.max(0, A.boot - dt);
  if (D.boot > 0) D.boot = Math.max(0, D.boot - dt);
  if (A.msgT > 0) A.msgT -= dt; if (D.msgT > 0) D.msgT -= dt;
  if (A.set) { A.setT -= dt; if (A.setT <= 0) A.set = null; }
  if (A.rec) A.recT += dt; if (D.rec) D.recT += dt;
  if (A.search && A.search.stage === 'scan') {
    const s = A.search, all = anAllCh();
    s.t += dt; s.lvl = s.lvl || new Array(all.length).fill(0);
    const n = Math.min(all.length, Math.floor(s.t / 0.05));
    while (s.i < n) {
      const [b, i] = all[s.i], ob = A.band, oc = A.ch; A.band = b; A.ch = i;
      const r = anLink().rssi; A.band = ob; A.ch = oc; s.lvl[s.i] = r;
      if (!s.best || r > s.best[2]) s.best = [b, i, r];
      s.i++;
    }
    if (s.i >= all.length) { s.stage = 'done'; if (s.best && s.best[2] > 8) { A.band = s.best[0]; A.ch = s.best[1]; } else anMsg('Сигнал не знайдено'); gogChanged(); }
  }
  if (D.bind > 0) { D.bind -= dt; if (D.bind <= 0) { D.bind = 0; D.bound = true; dgMsg('Час прив’язки вийшов'); } }
  if (D.linking > 0) { D.linking -= dt; if (D.linking <= 0) { D.linking = 0; D.bind = 0; D.bound = true; dgMsg('Прив’язано: O4 Air Unit'); gogChanged(); } }
  if (D.leds > 0) D.leds -= dt;
  gogSolve();
  if (GOG.dev === 'dg' && GOG.lk.st === 'lost') D.frozen += dt; else D.frozen = 0;
}
function gogVisual(dt, now) {
  if (!gogG) return;
  const D = GOG.dg;
  GP.an.visible = GOG.dev === 'an'; GP.dg.visible = GOG.dev === 'dg';
  for (const p of GP.antsDG) { const tgt = D.ants ? p.userData.sx * 0.22 : 0, tx = D.ants ? 0 : -1.45; p.rotation.z += (tgt - p.rotation.z) * Math.min(1, dt * 8); p.rotation.x += (tx - p.rotation.x) * Math.min(1, dt * 8); }
  GP.anAnt.visible = GOG.anAnt;
  if (GP.fan && GOG.an.fan && GOG.an.on) GP.fan.rotation.z -= dt * 25;
  const lv = D.leds > 0 ? Math.ceil(D.batt / 25) : 0;
  GP.leds.forEach((l, i) => { l.material = i < lv ? GM.ledOn : GM.led; });
  /* підсвітка органу керування */
  GOG.hlT = Math.max(0, GOG.hlT - dt);
  const hl = GOG.hl.filter(id => GP.anchor[id] && id[0] === (GOG.dev === 'an' ? 'a' : 'd'));
  GP.glow.visible = GOG.hlT > 0 && hl.length > 0;
  if (GP.glow.visible) { const id = hl[Math.floor(now * 0.8) % hl.length]; GP.anchor[id].getWorldPosition(GP.glow.position); const s = 1.5 + Math.sin(now * 6) * 0.35; GP.glow.scale.set(s, s, s); }
  /* підказка */
  GOG.tipT = Math.max(0, GOG.tipT - dt);
  const tipId = GOG.hover || (GOG.tipT > 0 ? GOG.tip : null);
  const tl = label('gogTip', GOG.tipHtml || '', 'tag rtip gtip');
  tl.on = !!tipId && !!GP.anchor[tipId] && !!GOG.tipHtml && gogG.visible;
  if (tl.on) { tl.pos = GP.anchor[tipId].getWorldPosition(new T.Vector3()); tl.oy = -26; }
  /* підписи органів керування */
  for (const [id, c] of Object.entries(CTL)) {
    const l = label('gogL_' + id, c.n, 'tag sm');
    if (!LBL_IDS.includes(id)) { l.on = false; continue; }
    l.on = GOG.labels && gogG.visible && id[0] === (GOG.dev === 'an' ? 'a' : 'd') && !!GP.anchor[id] && GOG.view !== 'screen' && GOG.hover !== id;
    if (l.on) l.pos = GP.anchor[id].getWorldPosition(new T.Vector3());
  }
  const sc = label('gogScr', `<b>Екран окулярів</b><span class="lx"> · очима пілота</span>`, 'tag');
  sc.on = gogG.visible && GOG.view === 'both' && camera.aspect >= 1.05; if (sc.on) sc.pos = GP.screenG.localToWorld(new T.Vector3(0, 5.4, 0));
}
export function tickGog(dt, now) {
  if (!gogG || !gogG.visible) return;
  gogStep(dt);
  gogVisual(dt, now);
  GOG.scrT += dt; if (GOG.scrT > 0.066) { GOG.scrT = 0; gogScreen(); }
  GOG.uiT += dt; if (GOG.uiT > 0.15) { GOG.uiT = 0; gogReadout(); }
}

/* ================= ОРГАНИ КЕРУВАННЯ: ОПИСИ ================= */
const CTL = {
  aLW: { n: 'Ліве колесо', d: 'крутити — гучність; натиснути — режими (RF, AV, HDMI, Playback); утримати — Drone Finder' },
  aRW: { n: 'Праве колесо', d: 'натиснути — канал → бенд → MIX/DIV, крутити — змінити; утримати — пошук' },
  aLB: { n: 'Ліва кнопка', d: 'запис DVR старт/стоп; у Playback — видалити файл' },
  aRB: { n: 'Права кнопка', d: 'системне меню / назад; утримати — центр head tracker' },
  aPWR: { n: 'Живлення', d: 'утримати — увімк/вимк; натиснути — вентилятор' },
  aANT: { n: 'Антени приймача', d: 'всеспрямована + патч на SMA; клік — зняти/закрутити' },
  aMOD: { n: 'Модуль приймача', d: 'SteadyView, 48 каналів 5,8 ГГц, режими MIX1–3 і DIV' },
  aFAN: { n: 'Вентилятор', d: 'не дає лінзам пітніти; вмикається кнопкою живлення' },
  aIPD: { n: 'Повзунок IPD', d: 'відстань між лінзами 58–71 мм' },
  aFOC: { n: 'Колесо фокуса', d: 'від −2 до +6 діоптрій' },
  aDC: { n: 'Вхід DC 5,5×2,1', d: 'живлення 2S–6S від акумулятора' },
  aHDMI: { n: 'Вхід HDMI', d: 'для зовнішнього цифрового модуля' },
  aSD: { n: 'Слот SD', d: 'DVR: FAT32, Class 10, до 128 ГБ' },
  aBAT: { n: 'Акумулятор', d: 'окремий, на ремінці; кабель до DC' },
  d5D: { n: 'Кнопка 5D', d: 'натиснути/вправо — меню; вперед — камера; назад — швидке меню' },
  dBACK: { n: 'Кнопка «Назад»', d: 'на рівень вище / закрити меню' },
  dPWR: { n: 'Живлення', d: 'натиснути — заряд; натиснути + утримати 2 с — увімк/вимк; утримати до сигналу — прив’язка' },
  dLED: { n: 'Індикатори заряду', d: 'чотири рівні заряду батареї' },
  dANT: { n: 'Антени', d: 'розкладіть перед польотом; клік — скласти/розкласти' },
  dSD: { n: 'Слот microSD', d: 'запис до 512 ГБ, MOV' },
  dUSB: { n: 'USB-C', d: 'активація й оновлення, перенесення записів' },
  dRV: { n: 'Правий бік', d: 'двічі натиснути — Real View PiP' },
  dIPD: { n: 'Коліщата лінз', d: 'діоптрії −6,0…+2,0 і IPD 56–72 мм' },
  dBAT: { n: 'Батарея в оголів’ї', d: '3000 мА·год, близько 3 годин; колесо — підтягнути оголів’я' }
};
/* підписи — лише основні органи, щоб не перекривалися */
const LBL_IDS = ['aLW', 'aRW', 'aLB', 'aRB', 'aPWR', 'aANT', 'aFAN', 'aIPD', 'd5D', 'dBACK', 'dPWR', 'dANT', 'dRV', 'dIPD', 'dLED', 'dSD'];
function gogTip(id, html) { GOG.tip = id; GOG.tipHtml = html; GOG.tipT = 2.6; }
function gogTipCtl(id) { const c = CTL[id]; if (c) gogTip(id, `<b>${c.n}</b> · ${c.d}`); }
export function gogHighlight(ids, sec = 5) { GOG.hl = ids || []; GOG.hlT = ids && ids.length ? sec : 0; }

/* ================= ВКАЗІВНИК НА 3D-МОДЕЛІ ================= */
const gogPtr = new Map();
let lastTap = { id: null, t: 0 };
export function gogPtrOn() { return !!gogG && gogG.visible && S.mode === 'goggles'; }
export function gogOwns(id) { return gogPtr.has(id); }
function gogHit(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const pre = GOG.dev === 'an' ? 'a' : 'd';
  const pick = GP.pick.filter(m => m.userData.gid[0] === pre && m.parent.visible);
  for (const h of raycaster.intersectObjects(pick, false)) return h.object.userData.gid;
  return null;
}
const HOLDABLE = { aPWR: 0.8, aRW: 0.8, aLW: 0.8, aRB: 0.8, dPWR: 1.3 };
const act = (id, kind) => (id[0] === 'a' ? anAct(id, kind) : dgAct(id, kind));
export function gogDown(e) {
  const id = gogHit(e.clientX, e.clientY); if (!id) return false;
  const g = { id, held: false, timer: null };
  if (HOLDABLE[id]) g.timer = setTimeout(() => { g.held = true; act(id, 'hold'); gogSync(); }, HOLDABLE[id] * 1000);
  gogPtr.set(e.pointerId, g);
  return true;
}
export function gogMove() { /* органи окулярів не тягнуться */ }
export function gogUp(e) {
  const g = gogPtr.get(e.pointerId); if (!g) return;
  gogPtr.delete(e.pointerId); clearTimeout(g.timer);
  if (g.held || e.type !== 'pointerup') return;
  const now = performance.now();
  if (g.id === 'dRV') { if (lastTap.id === 'dRV' && now - lastTap.t < 450) { act('dRV', 'double'); lastTap = { id: null, t: 0 }; } else { lastTap = { id: 'dRV', t: now }; gogTipCtl('dRV'); } }
  else if (['aLW', 'aRW', 'aLB', 'aRB', 'aPWR', 'aANT', 'd5D', 'dBACK', 'dPWR', 'dANT'].includes(g.id)) act(g.id, 'press');
  else gogTipCtl(g.id);
  gogSync();
}
export function gogHover(cx, cy) {
  const id = gogHit(cx, cy);
  canvas.classList.toggle('hovering', !!id);
  if (id !== GOG.hover) { GOG.hover = id; if (id) gogTipCtl(id); }
}
export function gogWheel(e) {
  const id = gogHit(e.clientX, e.clientY); if (!id) return false;
  const k = e.deltaY > 0 ? 'down' : 'up';
  if (id === 'aLW' || id === 'aRW' || id === 'd5D') { act(id, k); gogSync(); return true; }
  return false;
}

/* ================= ПАНЕЛЬ ================= */
function pressSeg(el, key, val) { if (el) el.querySelectorAll(`[data-${key}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === String(val)))); }
const btn = (k, t, extra = '') => `<button type="button" class="tbtn" data-gk="${k}"${extra}>${t}</button>`;
function ctlRow(name, btns) { return `<div class="gk-r"><span class="lab-k">${name}</span><div class="gk-b">${btns.join('')}</div></div>`; }
function renderControls() {
  const el = $('gogCtl'); if (!el) return;
  setHTML(el, GOG.dev === 'an'
    ? ctlRow('Ліве колесо', [btn('aLW:up', '▲'), btn('aLW:press', 'Натиснути'), btn('aLW:down', '▼'), btn('aLW:hold', 'Утримати')])
      + ctlRow('Праве колесо', [btn('aRW:up', '▲'), btn('aRW:press', 'Натиснути'), btn('aRW:down', '▼'), btn('aRW:hold', 'Утримати')])
      + ctlRow('Ліва кнопка', [btn('aLB:press', 'Запис DVR')])
      + ctlRow('Права кнопка', [btn('aRB:press', 'Меню / назад'), btn('aRB:hold', 'Утримати')])
      + ctlRow('Живлення', [btn('aPWR:press', 'Натиснути'), btn('aPWR:hold', 'Утримати')])
    : ctlRow('Кнопка 5D', [btn('d5D:up', '▲ вперед'), btn('d5D:left', '◀'), btn('d5D:press', 'Натиснути'), btn('d5D:right', '▶'), btn('d5D:down', '▼ назад')])
      + ctlRow('«Назад»', [btn('dBACK:press', 'Натиснути')])
      + ctlRow('Живлення', [btn('dPWR:press', 'Натиснути'), btn('dPWR:presshold', 'Натиснути + утримати 2 с'), btn('dPWR:hold', 'Утримати до сигналу')])
      + ctlRow('Правий бік', [btn('dRV:double', 'Двічі натиснути')])
      + ctlRow('Модуль на дроні', [btn('link:press', 'Кнопка прив’язки')]));
}
function renderLink() {
  const el = $('gogLink'); if (!el) return;
  const seg = (k, opts) => `<div class="seg sm" role="group">${opts.map(([v, t]) => `<button type="button" data-${k}="${v}">${t}</button>`).join('')}</div>`;
  const row = (n, h) => `<div class="lab-row"><span class="lab-k">${n}</span>${h}</div>`;
  setHTML(el, (GOG.dev === 'an'
    ? row('VTX: бенд', seg('gvb', VTX_BANDS.map(b => [b, b])))
      + row('VTX: канал', seg('gvc', [0, 1, 2, 3, 4, 5, 6, 7].map(i => [i, String(i + 1)])))
      + row('VTX: потужність', seg('gvp', [['25', '25 мВт'], ['200', '200 мВт'], ['600', '600 мВт'], ['pit', 'Pit mode']]))
      + row('Поляризація', `<div class="gk-pol"><span>дрон</span>${seg('gpd', [['RHCP', 'RHCP'], ['LHCP', 'LHCP']])}<span>окуляри</span>${seg('gpg', [['RHCP', 'RHCP'], ['LHCP', 'LHCP']])}</div>`)
      + row('Окуляри', seg('gtg', [['ant', 'Антени закручені'], ['sd', 'SD-картка']]))
    : row('Смуга', seg('gbw', [['20', '20 МГц'], ['40', '40 МГц'], ['60', '60 МГц']]))
      + row('Режим', seg('gtg', [['race', 'Race Mode'], ['ants', 'Антени розкладені'], ['osd', 'OSD (MSP DisplayPort)'], ['sd', 'microSD']])))
    + `<label class="slider" for="gogDist"><span>Відстань</span><input type="range" id="gogDist" min="0" max="1000" step="1"><output id="gogDistOut" for="gogDist"></output></label>`
    + row('Перешкоди', seg('gob', OBST.map(o => [o.id, o.n]))));
}
function renderSteps() {
  const el = $('gogSteps'); if (!el) return;
  const st = gogSteps();
  setHTML(el, st.map((s, i) => `<li class="${i === GOG.step ? 'cur' : ''}" data-i="${i}">
    <div class="gs-h"><button type="button" data-gstp="${i}"><span class="n">${i + 1}</span><b><small class="gs-g">${s.g}</small>${s.t}</b></button></div>
    <div class="gs-b"><ol class="gs-do">${s.do.map(d => `<li>${d}</li>`).join('')}</ol>
      <p class="gs-why"><b>Навіщо.</b> ${s.why}</p>${s.warn ? `<p class="gs-warn"><b>Увага.</b> ${s.warn}</p>` : ''}
      <div class="gs-links">${s.hl.length ? `<button type="button" class="lnk" data-gshow="${i}">Показати на окулярах</button>` : ''}${s.act ? `<button type="button" class="lnk" data-gdo="${i}">${s.act[0]}</button>` : ''}</div>
    </div></li>`).join(''));
  setText($('gogPos'), `${GOG.step + 1} / ${st.length}`);
  $('gogPrev').disabled = GOG.step === 0; $('gogNext').disabled = GOG.step === st.length - 1;
}
function gogStepGo(i) {
  const st = gogSteps(); GOG.step = clamp(i, 0, st.length - 1);
  renderSteps(); gogHighlight(st[GOG.step].hl);
  if (ok3d && S.mode === 'goggles' && st[GOG.step].hl.length && GOG.view === 'screen') gogFrame('both');
}
export function gogSetDev(dev) {
  if (GOG.dev === dev) return;
  GOG.dev = dev; GOG.step = 0; GOG.scen = null; GOG.hover = null; GOG.hl = [];
  renderControls(); renderLink(); renderSteps(); gogChanged(); gogSync();
  if (ok3d && S.mode === 'goggles') gogFrame(GOG.view);
}
function gogChanged() { gogSolve(); GOG.scrT = 1; GOG.uiT = 1; }
export function gogSync() {
  const el = $('gogPanel'); if (!el) return;
  pressSeg($('gogDev'), 'gdev', GOG.dev);
  const list = GOG.dev === 'an' ? AN_SCEN : DG_SCEN;
  setHTML($('gogScen'), list.map(s => `<button type="button" data-gscn="${s.id}">${s.name}</button>`).join(''));
  pressSeg($('gogScen'), 'gscn', GOG.scen || '');
  const sc = list.find(q => q.id === GOG.scen), note = $('gogScenNote'); note.hidden = !sc; if (sc) setText(note, sc.note);
  const V = GOG.avtx, D = GOG.dg, A = GOG.an;
  pressSeg(el, 'gvb', V.band); pressSeg(el, 'gvc', V.ch); pressSeg(el, 'gvp', V.pit ? 'pit' : V.mw);
  pressSeg(el, 'gpd', V.pol); pressSeg(el, 'gpg', GOG.gPol); pressSeg(el, 'gbw', D.race ? '' : D.bw); pressSeg(el, 'gob', GOG.obst);
  el.querySelectorAll('[data-gtg]').forEach(b => {
    const k = b.dataset.gtg, v = GOG.dev === 'an' ? (k === 'ant' ? GOG.anAnt : A.sd) : D[k];
    b.setAttribute('aria-pressed', String(!!v));
  });
  el.querySelectorAll('[data-gbw]').forEach(b => { b.disabled = D.race; });
  const inp = $('gogDist'); if (inp && document.activeElement !== inp) inp.value = distToX(GOG.dist);
  setText($('gogDistOut'), kmTxt(GOG.dist));
  gogReadout();
}
function gogVerdict() {
  const L = GOG.lk || gogSolve();
  if (GOG.dev === 'an') {
    const A = GOG.an;
    if (!A.on) return { cls: 'info', t: 'ВИМКНЕНО', m: 'утримайте живлення' };
    if (A.boot > 0) return { cls: 'info', t: 'ЗАВАНТАЖЕННЯ', m: '' };
    if (A.src !== 'RF') return { cls: 'warn', t: `${A.src} IN`, m: 'вхід без сигналу' };
    if (L.q >= 0.95) return { cls: 'ok', t: 'ЧИСТО', m: `${chName(A.band, A.ch)} · ${L.fg} МГц` };
    if (L.q > 0.25) return { cls: 'warn', t: 'ШУМ', m: `RSSI ${L.rssi} %` };
    return { cls: 'bad', t: 'СНІГ', m: L.det > 4 ? 'не той канал' : 'немає сигналу' };
  }
  const D = GOG.dg;
  if (!D.on) return { cls: 'info', t: 'ВИМКНЕНО', m: 'натисніть + утримайте живлення' };
  if (D.boot > 0) return { cls: 'info', t: 'ЗАВАНТАЖЕННЯ', m: '' };
  if (L.st === 'nobind') return { cls: 'bad', t: D.bind > 0 ? 'ПРИВ’ЯЗКА' : 'НЕ ПРИВ’ЯЗАНО', m: D.bind > 0 ? 'натисніть кнопку на модулі' : 'немає модуля' };
  if (L.st === 'lost') return { cls: 'bad', t: 'НЕМАЄ СИГНАЛУ', m: 'картинка зависла' };
  if (L.st === 'weak') return { cls: 'warn', t: 'СЛАБКИЙ СИГНАЛ', m: `${L.br} Мбіт/с · ${L.lat} мс` };
  return { cls: 'ok', t: 'HD', m: `${L.br} Мбіт/с · ${L.lat} мс` };
}
function gogWhy() {
  const L = GOG.lk;
  if (GOG.dev === 'an') {
    const A = GOG.an, V = GOG.avtx;
    if (!A.on) return 'Окуляри вимкнені: утримайте кнопку живлення.';
    if (A.boot > 0) return 'Окуляри завантажуються.';
    if (A.src !== 'RF') return `Обрано вхід ${A.src} IN, а до нього нічого не під’єднано. Ліве колесо → режим RF Normal.`;
    if (L.det > 4) return `Канали не збігаються: окуляри на ${chName(A.band, A.ch)} (${L.fg} МГц), VTX — на ${chName(V.band, V.ch)} (${L.fv} МГц), різниця ${L.det} МГц. Праве колесо → канал і бенд, або утримайте його й запустіть пошук.`;
    if (!GOG.anAnt) return 'Антени окулярів зняті: приймач майже нічого не чує. Закрутіть антени на SMA модуля.';
    if (V.pit && L.q < 0.95) return 'VTX у pit mode випромінює частки мілівата — картинку видно лише за кілька метрів.';
    if (L.pol && L.q < 0.95) return `Різна поляризація (дрон ${V.pol}, окуляри ${GOG.gPol}) коштує ≈20 дБ. Поставте антени однієї поляризації.`;
    if (L.q < 0.95) return `Рівень ${fmt(Math.round(L.prx))} дБм — біля порогу прийому: ${kmTxt(GOG.dist)}${GOG.obst ? `, ${OBST[GOG.obst].n.toLowerCase()} на лінії` : ''}. Підніміться вище, наблизьтеся або збільште потужність VTX у межах дозволеного.`;
    return `Рівень ${fmt(Math.round(L.prx))} дБм, запас ${fmt(Math.round(L.m))} дБ: картинка чиста. Окуляри й VTX на ${L.fg} МГц.`;
  }
  const D = GOG.dg;
  if (!D.on) return 'Окуляри вимкнені: натисніть кнопку живлення, а потім натисніть і утримуйте 2 секунди.';
  if (D.boot > 0) return 'Окуляри завантажуються.';
  if (L.st === 'nobind') return D.bind > 0 ? 'Окуляри в режимі прив’язки: натисніть кнопку прив’язки на повітряному модулі.' : 'Окуляри не прив’язані до модуля: утримуйте кнопку живлення до безперервного сигналу, потім натисніть кнопку прив’язки на модулі.';
  const parts = [];
  if (!D.ants) parts.push('антени складені');
  if (GOG.obst) parts.push(OBST[GOG.obst].n.toLowerCase());
  if (D.heat) parts.push('модуль перегрівся й знизив потужність');
  const ctx = parts.length ? ` (${parts.join(', ')})` : '';
  if (L.st === 'lost') return `Сигнал нижче порогу на ${fmt(Math.round(-L.m))} дБ${ctx}: картинка зависає й зникає. Наблизьтеся, підніміться вище${L.bw > 20 ? ', звузьте смугу' : ''}${D.ants ? '' : ', розкладіть антени'}.`;
  if (L.st === 'weak') return `Запас лише ${fmt(Math.round(L.m))} дБ${ctx}: бітрейт ${L.br} Мбіт/с, затримка ${L.lat} мс, з’являються квадрати.${L.bw > 20 ? ' Вужча смуга дасть стабільніший зв’язок.' : ''}`;
  if (!D.osd) return 'Відео є, але OSD польотника немає: на UART модуля в Betaflight увімкніть MSP DisplayPort і HD-формат OSD.';
  return `Запас ${fmt(Math.round(L.m))} дБ: бітрейт ${L.br} Мбіт/с, затримка ${L.lat} мс при ${L.fps} кадрах/с, смуга ${L.bw} МГц.`;
}
export function gogReadout() {
  const el = $('gogPanel'); if (!el || el.hidden) return;
  const v = gogVerdict(), L = GOG.lk;
  const stat = $('gogStat'); stat.className = 'rad-stat ' + v.cls;
  setHTML(stat, `<b>${v.t}</b><em>${v.m}</em><p>${gogWhy()}</p>`);
  const hud = $('gogHud');
  if (hud && !hud.hidden) {
    hud.className = 'rad-hud ' + v.cls;
    setText($('ghS'), v.t); setText($('ghM'), DEV_NAME[GOG.dev]);
    if (GOG.dev === 'an') {
      setText($('ghK1'), 'Канал'); setText($('ghV1'), `${chName(GOG.an.band, GOG.an.ch)}`);
      setText($('ghK2'), 'VTX'); setText($('ghV2'), `${chName(GOG.avtx.band, GOG.avtx.ch)}`);
      setText($('ghK3'), 'RSSI'); setText($('ghV3'), GOG.an.on ? `${L.rssi} %` : '—');
      setText($('ghK4'), 'Рівень'); setText($('ghV4'), `${fmt(Math.round(L.prx))}`);
    } else {
      setText($('ghK1'), 'Бітрейт'); setText($('ghV1'), L.br ? `${L.br}` : '—');
      setText($('ghK2'), 'Затримка'); setText($('ghV2'), L.lat ? `${L.lat} мс` : '—');
      setText($('ghK3'), 'Смуга'); setText($('ghV3'), `${L.bw} МГц`);
      setText($('ghK4'), 'Запас'); setText($('ghV4'), GOG.dg.bound ? `${fmt(Math.round(L.m))} дБ` : '—');
    }
  }
  const led = $('gogLed');
  if (led) {
    const D = GOG.dg, s = D.linking > 0 || D.bind > 0 ? ['blink', 'блимає червоним — прив’язка'] : D.bound ? ['ok', 'зелений — прив’язано'] : ['bad', 'червоний — не прив’язано'];
    led.className = 'gog-led ' + s[0]; setText(led, `Індикатор модуля: ${s[1]}`); led.hidden = GOG.dev !== 'dg';
  }
}
export function gogUIInit() {
  const el = $('gogPanel'); if (!el) return;
  renderControls(); renderLink(); renderSteps(); gogSolve();
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.gdev) { gogSetDev(d.gdev); return; }
    if (d.gk) { const [id, kind] = d.gk.split(':'); act(id, kind); gogHighlight([id], 2.5); }
    else if (d.gscn) gogScenario(d.gscn);
    else if (d.gvb) { GOG.avtx.band = d.gvb; GOG.scen = null; }
    else if (d.gvc) { GOG.avtx.ch = +d.gvc; GOG.scen = null; }
    else if (d.gvp) { GOG.avtx.pit = d.gvp === 'pit'; if (d.gvp !== 'pit') GOG.avtx.mw = +d.gvp; GOG.scen = null; }
    else if (d.gpd) { GOG.avtx.pol = d.gpd; GOG.scen = null; }
    else if (d.gpg) { GOG.gPol = d.gpg; GOG.scen = null; }
    else if (d.gbw) { GOG.dg.bw = +d.gbw; GOG.scen = null; }
    else if (d.gob) { GOG.obst = +d.gob; GOG.scen = null; }
    else if (d.gtg) {
      const k = d.gtg; GOG.scen = null;
      if (GOG.dev === 'an') { if (k === 'ant') GOG.anAnt = !GOG.anAnt; else GOG.an.sd = !GOG.an.sd; }
      else GOG.dg[k] = !GOG.dg[k];
    }
    else if (d.gstp) { gogStepGo(+d.gstp); return; }
    else if (d.gshow) { gogHighlight(gogSteps()[+d.gshow].hl, 6); if (ok3d && GOG.view === 'screen') gogFrame('both'); return; }
    else if (d.gdo) { const s = gogSteps()[+d.gdo]; GOG.scen = null; s.act[1](); gogHighlight(s.hl, 4); if (ok3d && GOG.view === 'goggles' && S.mode === 'goggles') gogFrame('both'); }
    else if (b.id === 'gogPrev') { gogStepGo(GOG.step - 1); return; }
    else if (b.id === 'gogNext') { gogStepGo(GOG.step + 1); return; }
    else if (b.id === 'gogLbl') { GOG.labels = !GOG.labels; b.setAttribute('aria-pressed', String(GOG.labels)); return; }
    else return;
    gogChanged(); gogSync();
  });
  el.addEventListener('input', e => { if (e.target.id === 'gogDist') { GOG.dist = xToDist(+e.target.value); GOG.scen = null; gogChanged(); gogSync(); } });
  document.querySelectorAll('[data-gview]').forEach(b => b.addEventListener('click', () => gogFrame(b.dataset.gview)));
  gogSync();
  /* без WebGL симуляція йде без 3D: панель і вердикт працюють */
  if (!ok3d) setInterval(() => { if (S.mode === 'goggles') { gogStep(0.1); gogReadout(); } }, 100);
}
