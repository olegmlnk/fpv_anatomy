/* Курс по БПЛА · розділ «Пульт»: 3D-репліка TX16S з робочими стіками, тумблерами, потенціометрами, слайдерами
 * й тримами; канали EdgeTX (CH1–CH12), режими Betaflight (AUX-діапазони) і спрощений симулятор дрона, який
 * реагує на ті канали, що дійшли до польотника через ExpressLRS.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content → options → core → builders → whoop → anim → demos → signals → antlab → radio → guides → ui */
'use strict';
/* ================= ПУЛЬТ TX16S ================= */
const RDEG = Math.PI / 180;
/* Органи керування в координатах лицьової панелі (см): x — праворуч, y — угору, z — до пілота.
 * Положення тумблера: 0 = ↑ (від себе, −100 %), 1 = середина (0 %), 2 = ↓ (до себе, +100 %). */
const SWITCHES = {
  SA: { n: 3, face: 'front', x: -10.85, y: 5.5, lev: 1.2, where: 'спереду ліворуч, зовнішній' },
  SB: { n: 3, face: 'front', x: -8.55, y: 5.95, lev: 1.2, where: 'спереду ліворуч, внутрішній' },
  SC: { n: 3, face: 'front', x: 8.55, y: 5.95, lev: 1.2, where: 'спереду праворуч, внутрішній' },
  SD: { n: 3, face: 'front', x: 10.85, y: 5.5, lev: 1.2, where: 'спереду праворуч, зовнішній' },
  SE: { n: 3, face: 'top', x: -8.3, z: -1.45, lev: 1.5, where: 'зверху ліворуч, передній ряд' },
  SF: { n: 2, face: 'top', x: -10.45, z: -3.5, lev: 2.0, where: 'зверху ліворуч, задній ряд' },
  SG: { n: 3, face: 'top', x: 8.3, z: -1.45, lev: 1.5, where: 'зверху праворуч, передній ряд' },
  SH: { n: 2, face: 'top', x: 10.45, z: -3.5, lev: 2.0, mom: true, where: 'зверху праворуч, задній ряд, без фіксації' }
};
const SW_ORDER = Object.keys(SWITCHES);
const ANALOGS = {
  S1: { kind: 'pot', x: -4.7, y: 6.05, name: 'потенціометр S1' },
  S2: { kind: 'pot', x: 4.7, y: 6.05, name: 'потенціометр S2' },
  LS: { kind: 'slider', side: -1, name: 'лівий слайдер LS' },
  RS: { kind: 'slider', side: 1, name: 'правий слайдер RS' }
};
const TRIMS = {
  T1: { x: -8.9, y: -6.55, hor: true, len: 2.4, what: 'рискання' },
  T4: { x: 8.9, y: -6.55, hor: true, len: 2.4, what: 'крену' },
  T3: { x: -5.55, y: -2.9, hor: false, len: 2.4, what: 'газу' },
  T2: { x: 5.55, y: -2.9, hor: false, len: 2.4, what: 'тангажу' },
  T5: { x: -2.25, y: -5.0, hor: true, len: 1.9, what: '', extra: true },
  T6: { x: 2.25, y: -5.0, hor: true, len: 1.9, what: '', extra: true }
};
const NAVS = { SYS: [-6.45, 4.05], MDL: [-6.45, 3.05], TELE: [-6.45, 2.05], 'PAGE<': [6.45, 4.05], 'PAGE>': [6.45, 3.05], RTN: [6.45, 2.05] };
const NAV_TXT = {
  SYS: '<b>SYS</b> · налаштування пульта', MDL: '<b>MDL</b> · налаштування моделі (мікшер)', TELE: '<b>TELE</b> · довге натискання — монітор каналів',
  'PAGE<': '<b>PAGE&lt;</b> · попередня сторінка', 'PAGE>': '<b>PAGE&gt;</b> · наступна сторінка', RTN: '<b>RTN</b> · назад, на головний екран'
};
const GIM = { x: 8.9, y: -2.9, max: 25 };
const SIX_V = [-1, -0.6, -0.2, 0.2, 0.6, 1];
const SRC_LIST = [...SW_ORDER, 'S1', 'S2', 'LS', 'RS', '6P', '—'];
const CH_FIX = { 1: ['Ail', 'крен · правий стік ↔'], 2: ['Ele', 'тангаж · правий стік ↕'], 3: ['Thr', 'газ · лівий стік ↕'], 4: ['Rud', 'рискання · лівий стік ↔'] };
const BF_MAPS = { AETR: { roll: 0, pitch: 1, thr: 2, yaw: 3 }, TAER: { thr: 0, roll: 1, pitch: 2, yaw: 3 } };
const MODE_DEF = [
  { id: 'arm', name: 'ARM', d: 'армування: мотори можуть крутитися' },
  { id: 'angle', name: 'ANGLE', d: 'самовирівнювання: стік задає кут нахилу' },
  { id: 'horizon', name: 'HORIZON', d: 'біля центру як ANGLE, на краю стіка — фліпи' },
  { id: 'beeper', name: 'BEEPER', d: 'пищалка, щоб знайти дрон' },
  { id: 'turtle', name: 'FLIP OVER AFTER CRASH', d: 'turtle: перевернути дрон моторами' },
  { id: 'fs', name: 'FAILSAFE', d: 'перевірка failsafe перемикачем' }
];
const RANGES = [[900, 1300], [1300, 1700], [1700, 2100], [900, 1700], [1300, 2100]];
const RAD_PAGES = ['main', 'tele', 'mon', 'mix'];
const PAGE_TITLE = { main: 'Квадро ELRS', tele: 'Телеметрія', mon: 'Монітор каналів', mix: 'Мікшер', sys: 'Налаштування пульта' };
const FLAG_TXT = {
  RXLOSS: 'немає сигналу від приймача',
  FAILSAFE: 'активний failsafe',
  THROTTLE: 'газ не на мінімумі: канал газу вище min_check ≈1050 мкс',
  ANGLE: 'дрон нахилений більше ніж на 25° (small_angle): перевернутий армиться лише з turtle',
  ARMSWITCH: 'ARM увімкнули, коли армування було заборонене: вимкніть і знову увімкніть ARM',
  BADRX: 'зв’язок з’явився, коли ARM уже був увімкнений: вимкніть ARM'
};
const RAD_SCEN = [
  { id: 'ok', name: 'Правильно', note: 'Типове налаштування: ARM на CH5 (SF, 2 положення), режими на CH6 (SB), біпер на CH7 (SH), turtle на CH8 (SE). Порядок каналів AETR збігається на пульті й у Betaflight.' },
  { id: 'trim', name: 'Тример газу', note: 'Тример газу T3 зсунуто вгору: навіть зі стіком унизу канал газу вищий за min_check (1050 мкс), і Betaflight не армиться (THROTTLE). На квадрокоптері трими тримають у нулі: стабілізацію робить польотник.' },
  { id: 'map', name: 'Карта каналів', note: 'Пульт видає AETR, а в Betaflight вибрано TAER. Газом польотник вважає CH1 (крен), а там 1500 мкс: армування заблоковано (THROTTLE), а стіки керують не тими осями. Порядок каналів має збігатися: Receiver → Channel Map.' },
  { id: 'rev', name: 'Реверс тангажу', note: 'CH2 інвертовано в мікшері: стік від себе дає менше 1500 мкс, і дрон летить назад. Перевіряйте напрямки у вкладці Receiver: стік угору або вправо — значення зростає.' },
  { id: 'arm3', name: 'ARM на 3-позиційному', note: 'ARM перенесено на 3-позиційний SC. У стандартних режимах перемикачів ExpressLRS (Hybrid, Wide) CH5 передається одним бітом: середнє положення стає «низом», тому армування спрацьовує лише в нижньому положенні. ARM на CH5 ставлять на 2-позиційний тумблер.' },
  { id: 'early', name: 'ARM до зв’язку', note: 'ARM увімкнули, поки не було зв’язку. Коли приймач з’єднався, Betaflight бачить увімкнений ARM і блокує армування (BADRX), доки ARM не вимкнуть. Це захист від раптового запуску моторів.' },
  { id: 'fs', name: 'Втрата зв’язку', note: 'Дрон злітає й висить, а потім зв’язок обривається. За ≈0,3 с без пакетів — стадія 1: стіки по центру, газ на мінімумі, і дрон починає знижуватися. Через failsafe_delay — стадія 2: Drop вимикає мотори, Land сідає з фіксованим газом. Поверніть зв’язок кнопкою нижче й вимкніть ARM, щоб армуватися знову.' }
];

const RAD = {
  st: { lx: 0, ly: -1, rx: 0, ry: 0 }, hold: { L: 0, R: 0 },
  sw: {}, swDir: {}, an: { S1: 0, S2: 0, LS: 0, RS: 0 }, six: 0,
  trim: { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0, T6: 0 },
  mix: {}, modes: [], map: 'AETR', fsProc: 'drop',
  power: true, link: true, warn: null, page: 'main', view: 'pilot', sound: false,
  tx: new Array(16).fill(1500), rx: new Array(16).fill(1500),
  scen: 'ok', keys: {}, tip: null, tipT: 0, hover: null, hl: null, hlT: 0, uiT: 0, scrT: 0, ant: 0, antT: 0, roller: 0,
  pressed: {}, earlyT: 0
};
SW_ORDER.forEach(k => { RAD.sw[k] = 0; RAD.swDir[k] = 1; });
const FCS = {
  ch: new Array(16).fill(1500), last: null, lostT: 0, fs: 0, fsT: 0, armed: false, latch: false, badrx: false, hadRx: true,
  flags: [], act: {}, mode: 'angle', turtle: false, crashed: false, msg: '', timer: 0, used: 0, volt: 16.8, cur: 0, beep: null, beepT: 0
};
const DRS = { p: null, v: null, q: null, w: null, ground: true, inv: false, flip: 0, flipAx: null, flipQ: null, out: 0, wall: 0, ang: [0, 0, 0, 0] };
const RAD_PHY = { U: 6, PADZ: -125, BX: 14, ZN: 6, ZF: -20, YMAX: 9, G: 9.81, TMAX: 3.2 * 9.81, IDLE: 0.055, DRAG: 1.1, FS_DELAY: 1.5, H0: -0.25 };

function radDefaults() {
  RAD.mix = {};
  for (let i = 1; i <= 4; i++) RAD.mix[i] = { src: CH_FIX[i][0], inv: false };
  [['SF', 5], ['SB', 6], ['SH', 7], ['SE', 8], ['SA', 9], ['SC', 10], ['SD', 11], ['6P', 12]].forEach(([s, c]) => { RAD.mix[c] = { src: s, inv: false }; });
  RAD.modes = [
    { id: 'arm', aux: 1, r: 2 }, { id: 'angle', aux: 2, r: 0 }, { id: 'horizon', aux: 2, r: 1 },
    { id: 'beeper', aux: 3, r: 2 }, { id: 'turtle', aux: 4, r: 2 }, { id: 'fs', aux: 0, r: 2 }
  ];
  RAD.map = 'AETR'; RAD.fsProc = 'drop';
  for (const k in RAD.trim) RAD.trim[k] = 0;
}
radDefaults();

/* ---------- значення джерел і каналів (EdgeTX) ---------- */
function srcVal(s) {
  const st = RAD.st, tr = RAD.trim;
  switch (s) {
    case 'Ail': return st.rx + tr.T4 / 100;
    case 'Ele': return st.ry + tr.T2 / 100;
    case 'Thr': return st.ly + tr.T3 / 100;
    case 'Rud': return st.lx + tr.T1 / 100;
    case '6P': return SIX_V[RAD.six];
    case '—': return 0;
  }
  if (SWITCHES[s]) return RAD.sw[s] - 1;
  if (s in RAD.an) return RAD.an[s];
  return 0;
}
/* 100 % = 512 одиниць: 1500 ± 512 мкс → 988…2012 мкс; обмеження виходів ±100 % */
function radChannels() {
  for (let i = 1; i <= 16; i++) {
    const m = RAD.mix[i]; let v = m ? srcVal(m.src) : 0;
    if (m && m.inv) v = -v;
    RAD.tx[i - 1] = Math.round(1500 + 512 * clamp(v, -1, 1));
  }
}
const radLinkOk = () => RAD.power && RAD.link && !RAD.warn;
const auxName = n => (n ? `AUX${n} · CH${n + 4}` : '—');
const rngTxt = i => `${RANGES[i][0]}–${RANGES[i][1]}`;
const swPosTxt = id => (SWITCHES[id].n === 2 ? (RAD.sw[id] ? '↓' : '↑') : ['↑', '–', '↓'][RAD.sw[id]]);
/* куди веде орган керування: канал → AUX → режим Betaflight */
function radRoute(src) {
  const out = [];
  for (let c = 1; c <= 12; c++) {
    const m = RAD.mix[c]; if (!m || m.src !== src) continue;
    const md = c >= 5 ? RAD.modes.filter(x => x.aux === c - 4).map(x => MODE_DEF.find(d => d.id === x.id).name) : [];
    out.push({ c, md });
  }
  return out;
}
function routeTxt(src) {
  const r = radRoute(src);
  if (!r.length) return 'не призначений у мікшері';
  return r.map(x => `CH${x.c}${x.c >= 5 ? ` (AUX${x.c - 4})` : ''}${x.md.length ? ' → ' + x.md.join(', ') : ''}`).join('; ');
}

/* ---------- органи керування ---------- */
function swSet(id, pos) {
  if (RAD.sw[id] === pos) return;
  RAD.sw[id] = pos; radTipCtl(id);
}
function swCycle(id, back) {
  const d = SWITCHES[id];
  if (d.n === 2) { swSet(id, RAD.sw[id] ? 0 : 2); return; }
  let dir = back ? -RAD.swDir[id] : RAD.swDir[id], p = RAD.sw[id] + dir;
  if (p < 0 || p > 2) { dir = -dir; p = RAD.sw[id] + dir; }
  if (!back) RAD.swDir[id] = dir;
  swSet(id, p);
}
function trimStep(id, d) {
  RAD.trim[id] = clamp(RAD.trim[id] + d, -25, 25);
  const t = TRIMS[id]; if (RP.trim && RP.trim[id]) RP.trim[id].a = d;
  radTip(id, `<b>${id}</b> · ${t.extra ? 'додатковий трим' : 'трим ' + t.what} · ${RAD.trim[id] > 0 ? '+' : ''}${RAD.trim[id]} %`);
}
function radNav(id) {
  if (!RAD.power) return;
  if (RAD.warn) { if (id === 'RTN' && RAD.warn === 'sw') radWarnClear(); return; }
  const i = RAD_PAGES.indexOf(RAD.page);
  if (id === 'SYS') RAD.page = 'sys';
  else if (id === 'MDL') RAD.page = 'mix';
  else if (id === 'TELE') RAD.page = 'mon';
  else if (id === 'RTN') RAD.page = 'main';
  else if (id === 'PAGE>') RAD.page = RAD_PAGES[(Math.max(0, i) + 1) % RAD_PAGES.length];
  else if (id === 'PAGE<') RAD.page = RAD_PAGES[(Math.max(0, i) + RAD_PAGES.length - 1) % RAD_PAGES.length];
  RAD.scrT = 1;
  radTip(id, NAV_TXT[id]);
}
/* увімкнення пульта: EdgeTX перевіряє газ і тумблери; радіомодуль стартує після перевірок */
function radPower(on) {
  RAD.power = on;
  if (on) {
    RAD.page = 'main';
    if (RAD.st.ly > -0.95) RAD.warn = 'thr';
    else if (SW_ORDER.some(k => RAD.sw[k] !== 0)) RAD.warn = 'sw';
    else RAD.warn = null;
  } else RAD.warn = null;
  RAD.scrT = 1; radDirtyUI();
}
function radWarnClear() { RAD.warn = null; RAD.scrT = 1; radDirtyUI(); }
function radWarnCheck() {
  if (RAD.warn === 'thr' && RAD.st.ly <= -0.95) { RAD.warn = SW_ORDER.some(k => RAD.sw[k] !== 0) ? 'sw' : null; RAD.scrT = 1; }
  else if (RAD.warn === 'sw' && SW_ORDER.every(k => RAD.sw[k] === 0)) { RAD.warn = null; RAD.scrT = 1; }
}

/* ---------- польотник: прийом, failsafe, режими, армування ---------- */
function fcStep(dt) {
  const map = BF_MAPS[RAD.map];
  let ok = radLinkOk();
  /* ExpressLRS: AUX1 (CH5) передається одним бітом — «верх», лише якщо значення вище центру */
  if (ok) { for (let i = 0; i < 16; i++) RAD.rx[i] = RAD.tx[i]; RAD.rx[4] = RAD.tx[4] > 1500 ? 2000 : 1000; }
  /* режим FAILSAFE з перемикача імітує втрату сигналу (failsafe_switch_mode = STAGE1) */
  const fsBox = ok && rangeOn('fs', RAD.rx);
  const lost = !ok || fsBox;
  let ch;
  if (!lost) {
    ch = RAD.rx.slice(); FCS.last = ch.slice(); FCS.lostT = 0;
    if (FCS.fs) { FCS.fs = 0; FCS.landing = false; }
  } else {
    FCS.lostT += dt;
    ch = (FCS.last || RAD.rx).slice();
    if (FCS.lostT > 0.3) {
      if (!FCS.fs) { FCS.fs = 1; FCS.fsT = 0; }
      /* стадія 1: стіки по центру, газ на мінімумі; AUX тримають останнє значення */
      ch[map.roll] = 1500; ch[map.pitch] = 1500; ch[map.yaw] = 1500; ch[map.thr] = 885;
    }
  }
  if (FCS.fs === 1) {
    FCS.fsT += dt;
    if (FCS.fsT >= RAD_PHY.FS_DELAY) {
      FCS.fs = 2;
      if (RAD.fsProc === 'drop' || !FCS.armed || DRS.ground) { if (FCS.armed) radDisarm('Failsafe, стадія 2 (Drop): мотори вимкнено'); }
      else FCS.landing = true;
    }
  }
  FCS.ch = ch;
  /* режими: діапазон активний, якщо start ≤ значення < end */
  const act = {};
  for (const m of RAD.modes) act[m.id] = rangeOn(m.id, ch);
  FCS.act = act;
  FCS.mode = act.angle ? 'angle' : act.horizon ? 'horizon' : 'acro';
  /* прапорці заборони армування */
  const rxOk = !lost, armSw = act.arm;
  /* ARM вимкнули після failsafe чи удару — старе повідомлення більше не актуальне */
  if (FCS.prevArm && !armSw && !FCS.armed && !DRS.inv && !FCS.turtle) FCS.msg = '';
  FCS.prevArm = armSw;
  if (rxOk && !FCS.hadRx && armSw) FCS.badrx = true;
  if (rxOk && !armSw) FCS.badrx = false;
  FCS.hadRx = rxOk;
  const f = [];
  if (!rxOk) f.push('RXLOSS');
  if (FCS.fs) f.push('FAILSAFE');
  if (ch[map.thr] > 1050) f.push('THROTTLE');
  if (radTilt() > 25 && !act.turtle) f.push('ANGLE');
  if (FCS.badrx) f.push('BADRX');
  if (!armSw) FCS.latch = false;
  if (FCS.latch) f.push('ARMSWITCH');
  FCS.flags = FCS.armed ? [] : f;
  if (!FCS.armed && armSw && f.length && !FCS.latch && !f.includes('BADRX')) FCS.latch = true;
  if (!FCS.armed && armSw && !f.length) radArm();
  else if (FCS.armed && !armSw) radDisarm('Дизарм перемикачем ARM');
  else if (FCS.armed && FCS.turtle && !act.turtle) radDisarm('Turtle вимкнули під час армування: Betaflight дизармить');
  if (FCS.armed) FCS.timer += dt;
  /* біпер: режим BEEPER або втрата сигналу */
  FCS.beepOn = act.beeper || FCS.fs > 0;
  const rc = { roll: (ch[map.roll] - 1500) / 512, pitch: (ch[map.pitch] - 1500) / 512, yaw: (ch[map.yaw] - 1500) / 512, thr: clamp((ch[map.thr] - 1000) / 1000, 0, 1) };
  FCS.rc = rc;
  /* батарея 4S, спрощено */
  FCS.cur = FCS.armed ? 0.8 + 38 * Math.pow(DRS.out, 1.6) : 0.15;
  FCS.used += FCS.cur * dt / 3.6;
  FCS.volt = Math.max(13.2, 16.8 - 2.4 * FCS.used / 1500 - 0.011 * FCS.cur);
}
function rangeOn(id, ch) {
  const m = RAD.modes.find(x => x.id === id); if (!m || !m.aux) return false;
  const v = ch[m.aux + 3], r = RANGES[m.r];
  return v >= r[0] && v < r[1];
}
function radArm() {
  FCS.armed = true; FCS.turtle = !!FCS.act.turtle; FCS.crashed = false;
  FCS.msg = FCS.turtle ? 'Армовано в режимі turtle: мотори крутяться у зворотний бік' : 'Армовано';
  radBeep('arm');
}
function radDisarm(why) {
  if (!FCS.armed) return;
  FCS.armed = false; FCS.turtle = false; FCS.landing = false; FCS.msg = why || 'Дизарм';
  if (FCS.act.arm) FCS.latch = true;
  radBeep('disarm');
}
function radTilt() {
  if (!DRS.q) return 0;
  const u = new T.Vector3(0, 1, 0).applyQuaternion(DRS.q);
  return Math.acos(clamp(u.y, -1, 1)) / RDEG;
}

/* ---------- симулятор дрона (метри, секунди) ---------- */
function actualRate(s) { const a = Math.abs(s); return 70 * s + 600 * a * (0.54 * Math.pow(s, 5) + 0.46 * s); }
function radResetDrone() {
  if (!window.THREE) return;
  DRS.p = new T.Vector3(); DRS.v = new T.Vector3(); DRS.q = new T.Quaternion(); DRS.w = new T.Vector3();
  DRS.ground = true; DRS.inv = false; DRS.flip = 0; DRS.out = 0; DRS.wall = 0;
  FCS.crashed = false;
}
function radCrash(inv) {
  DRS.v.set(0, 0, 0); DRS.w.set(0, 0, 0); DRS.ground = true; DRS.p.y = 0;
  const f = new T.Vector3(0, 0, -1).applyQuaternion(DRS.q); f.y = 0;
  const yaw = f.lengthSq() > 1e-4 ? Math.atan2(-f.x, -f.z) : 0;
  DRS.q.setFromEuler(new T.Euler(0, yaw, inv ? Math.PI : 0, 'YXZ'));
  DRS.inv = inv; FCS.crashed = FCS.armed || inv;
  FCS.msg = inv ? 'Дрон перевернувся. Вимкніть ARM; щоб стати на ноги — turtle (FLIP OVER AFTER CRASH)' : 'Жорстке приземлення: мотори вперлися в землю — вимкніть ARM';
}
function drStep(dtAll) {
  const P = RAD_PHY, n = Math.max(1, Math.ceil(dtAll / 0.008)), dt = dtAll / n;
  for (let s = 0; s < n; s++) drSub(dt, P);
}
const _v1 = window.THREE ? new T.Vector3() : null, _v2 = window.THREE ? new T.Vector3() : null, _q1 = window.THREE ? new T.Quaternion() : null;
function drSub(dt, P) {
  const rc = FCS.rc || { roll: 0, pitch: 0, yaw: 0, thr: 0 };
  const q = DRS.q, w = DRS.w;
  const up = _v1.set(0, 1, 0).applyQuaternion(q);
  const fwd = _v2.set(0, 0, -1).applyQuaternion(q);
  const rightY = new T.Vector3(1, 0, 0).applyQuaternion(q).y;
  let out = 0, tRoll = 0, tPitch = 0, tYaw = 0;
  const flying = FCS.armed && !FCS.crashed && !FCS.turtle;
  if (flying) {
    let thr = rc.thr, mode = FCS.mode, roll = rc.roll, pitch = rc.pitch;
    if (FCS.landing) { thr = Math.max(0, (P.G / P.TMAX - P.IDLE) / (1 - P.IDLE) - 0.06); mode = 'angle'; roll = 0; pitch = 0; }
    out = P.IDLE + (1 - P.IDLE) * thr;
    const rollCur = Math.atan2(-rightY, up.y) / RDEG, pitchCur = Math.atan2(-fwd.y, up.y) / RDEG;
    const lvl = (s, cur) => clamp(6 * (s * 55 - cur), -500, 500);
    if (mode === 'angle') { tRoll = lvl(roll, rollCur); tPitch = lvl(pitch, pitchCur); }
    else if (mode === 'horizon') {
      const k1 = clamp((Math.abs(roll) - 0.5) / 0.5, 0, 1), k2 = clamp((Math.abs(pitch) - 0.5) / 0.5, 0, 1);
      tRoll = (1 - k1) * lvl(roll, rollCur) + k1 * actualRate(roll); tPitch = (1 - k2) * lvl(pitch, pitchCur) + k2 * actualRate(pitch);
    } else { tRoll = actualRate(roll); tPitch = actualRate(pitch); }
    tYaw = FCS.landing ? 0 : actualRate(rc.yaw);
  }
  DRS.out = out;
  /* кутові швидкості в осях дрона: x — праворуч, y — угору, z — назад */
  const tw = _q1;
  const target = new T.Vector3(-tPitch, -tYaw, -tRoll).multiplyScalar(RDEG);
  if (DRS.ground && !DRS.inv && !(flying && out * P.TMAX * up.y > P.G * 0.98)) { target.x = 0; target.z = 0; if (!flying) target.y = 0; }
  w.lerp(target, 1 - Math.exp(-dt * 28));
  const wl = w.length();
  if (wl > 1e-6 && !DRS.inv) { tw.setFromAxisAngle(_v2.copy(w).divideScalar(wl), wl * dt); q.multiply(tw).normalize(); }
  /* turtle: перевернутий дрон, мотори реверсом, стік задає бік */
  if (FCS.armed && FCS.turtle && DRS.inv) {
    const s = Math.abs(rc.roll) > Math.abs(rc.pitch) ? rc.roll : rc.pitch;
    if (Math.abs(s) > 0.35) {
      if (!DRS.flipQ) { DRS.flipQ = q.clone(); DRS.flipAx = Math.abs(rc.roll) > Math.abs(rc.pitch) ? new T.Vector3(0, 0, Math.sign(rc.roll)) : new T.Vector3(-Math.sign(rc.pitch), 0, 0); }
      DRS.flip = Math.min(1, DRS.flip + dt * 1.25 * Math.abs(s));
      q.copy(DRS.flipQ).multiply(new T.Quaternion().setFromAxisAngle(DRS.flipAx, Math.PI * smooth(0, 1, DRS.flip)));
      if (DRS.flip >= 1) {
        DRS.inv = false; DRS.flip = 0; DRS.flipQ = null; FCS.crashed = false;
        const f = new T.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0;
        q.setFromEuler(new T.Euler(0, Math.atan2(-f.x, -f.z), 0, 'YXZ'));
        FCS.msg = 'Дрон на ногах. Вимкніть ARM, вимкніть turtle, знову ARM — і можна летіти';
      }
    }
    DRS.out = Math.abs(s) * 0.5;
  }
  /* сили */
  const a = new T.Vector3(0, -P.G, 0);
  if (out > 0) a.addScaledVector(up, out * P.TMAX);
  const v = DRS.v, sp = v.length();
  a.addScaledVector(v, -P.DRAG - 0.04 * sp);
  if (DRS.ground && a.y <= 0 && !(flying && out * P.TMAX * up.y > P.G)) {
    a.set(0, 0, 0); v.y = Math.max(0, v.y); v.x *= Math.exp(-dt * 7); v.z *= Math.exp(-dt * 7);
  }
  v.addScaledVector(a, dt);
  DRS.p.addScaledVector(v, dt);
  /* земля */
  const p = DRS.p;
  if (p.y <= 0) {
    if (!DRS.ground) {
      const impact = -v.y, tilt = Math.acos(clamp(up.y, -1, 1)) / RDEG, hs = Math.hypot(v.x, v.z);
      if (tilt > 100 || impact > 7 || (tilt > 55 && (impact > 2 || hs > 4))) radCrash(tilt > 90);
    }
    p.y = 0; if (v.y < 0) v.y = 0; DRS.ground = true;
    if (FCS.landing && FCS.armed) radDisarm('Failsafe, стадія 2 (Land): сів і вимкнув мотори');
    if (!DRS.inv && !flying) { _q1.copy(q); const f = new T.Vector3(0, 0, -1).applyQuaternion(q); f.y = 0; if (f.lengthSq() > 1e-4) q.slerp(new T.Quaternion().setFromEuler(new T.Euler(0, Math.atan2(-f.x, -f.z), 0, 'YXZ')), 1 - Math.exp(-dt * 10)); }
  } else if (p.y > 0.02) DRS.ground = false;
  /* межі арени */
  DRS.wall = Math.max(0, DRS.wall - dt);
  if (Math.abs(p.x) > P.BX) { p.x = Math.sign(p.x) * P.BX; v.x *= -0.25; DRS.wall = 1.2; }
  if (p.z > P.ZN) { p.z = P.ZN; v.z *= -0.25; DRS.wall = 1.2; }
  if (p.z < P.ZF) { p.z = P.ZF; v.z *= -0.25; DRS.wall = 1.2; }
  if (p.y > P.YMAX) { p.y = P.YMAX; v.y = Math.min(0, v.y); DRS.wall = 1.2; }
}

/* ---------- звук біпера (WebAudio, вмикається вручну) ---------- */
let radAC = null, radOsc = null, radGain = null;
function radAudio(on) {
  if (!on) { if (radGain) radGain.gain.value = 0; return; }
  try {
    if (!radAC) {
      radAC = new (window.AudioContext || window.webkitAudioContext)();
      radOsc = radAC.createOscillator(); radGain = radAC.createGain();
      radOsc.type = 'square'; radOsc.frequency.value = 2700; radGain.gain.value = 0;
      radOsc.connect(radGain).connect(radAC.destination); radOsc.start();
    }
    if (radAC.state === 'suspended') radAC.resume();
  } catch (e) { RAD.sound = false; }
}
function radBeep(kind) { FCS.beep = kind; FCS.beepT = 0; }
function radBeeper(dt) {
  FCS.beepT += dt;
  let on = false;
  if (FCS.beep === 'arm') { on = FCS.beepT < 0.45; if (FCS.beepT > 0.5) FCS.beep = null; }
  else if (FCS.beep === 'disarm') { on = FCS.beepT < 0.12 || (FCS.beepT > 0.22 && FCS.beepT < 0.34); if (FCS.beepT > 0.4) FCS.beep = null; }
  else if (FCS.beepOn) on = FCS.fs ? (FCS.beepT % 0.8) < 0.4 : (FCS.beepT % 0.24) < 0.1;
  FCS.beepNow = on;
  if (radGain) radGain.gain.value = on && RAD.sound && S.mode === 'radio' ? 0.035 : 0;
}

/* ================= 3D-МОДЕЛЬ ================= */
let radG = null, radTX = null, radDr = null, radScreenCv = null, radScreenTex = null, radDecalCv = null, radDecalTex = null;
const RP = { stick: {}, sw: {}, pot: {}, sl: {}, trim: {}, six: [], nav: {}, anchor: {} };
const RM = {};
let radPick = [];
function radMats() {
  RM.body = new T.MeshStandardMaterial({ color: C('#25282d'), roughness: 0.62, metalness: 0.08 });
  RM.alu = new T.MeshStandardMaterial({ color: C('#a6adb5'), roughness: 0.3, metalness: 0.9 });
  RM.chrome = new T.MeshStandardMaterial({ color: C('#e0e3e7'), roughness: 0.15, metalness: 1 });
  RM.black = new T.MeshStandardMaterial({ color: C('#131518'), roughness: 0.45, metalness: 0.2 });
  RM.rubber = new T.MeshStandardMaterial({ color: C('#0e0f11'), roughness: 0.95 });
  RM.btn = new T.MeshStandardMaterial({ color: C('#30353b'), roughness: 0.5 });
  RM.bezel = new T.MeshStandardMaterial({ color: C('#08090b'), roughness: 0.16, metalness: 0.4 });
  RM.cap = new T.MeshStandardMaterial({ color: C('#3a4047'), roughness: 0.32, metalness: 0.55 });
  RM.white = new T.MeshStandardMaterial({ color: C('#f1f1ea'), roughness: 0.4 });
  const kt = canvasTex(64, 64, (x, w) => {
    x.fillStyle = '#4a4f55'; x.fillRect(0, 0, w, w); x.strokeStyle = '#17191c'; x.lineWidth = 3;
    for (let i = -64; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke(); x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke(); }
  });
  kt.wrapS = kt.wrapT = T.RepeatWrapping; kt.repeat.set(5, 2);
  RM.knurl = new T.MeshStandardMaterial({ color: C('#9aa0a7'), map: kt, roughness: 0.4, metalness: 0.8 });
  RM.hit = new T.MeshBasicMaterial({ visible: false });
}
/* контур корпусу: права половина через сплайн, ліва — дзеркально */
function radOutline() {
  const R = [[0, 7.6], [4.5, 7.6], [9.2, 7.5], [11.9, 7.0], [13.1, 5.6], [13.45, 3.0], [13.5, 0], [13.3, -3.4], [12.9, -6.4], [12.0, -8.8], [10.5, -10.2], [8.6, -10.5], [6.9, -9.9], [5.1, -8.6], [2.7, -7.6], [0, -7.3]];
  const half = new T.SplineCurve(R.map(([x, y]) => new T.Vector2(x, y))).getSpacedPoints(90);
  half[0].x = 0; half[half.length - 1].x = 0;
  const left = half.slice(1, -1).reverse().map(p => new T.Vector2(-p.x, p.y));
  return { half, pts: half.concat(left) };
}
function radTopY(x) {
  const ax = Math.abs(x); let best = null;
  for (const p of RP.half) if (p.y > 3 && (!best || Math.abs(p.x - ax) < Math.abs(best.x - ax))) best = p;
  return best.y;
}
function radSideX(y) {
  let best = null;
  for (const p of RP.half) if (p.x > 9 && (!best || Math.abs(p.y - y) < Math.abs(best.y - y))) best = p;
  return best.x;
}
function pick3(m, rc) { m.userData.rc = rc; radPick.push(m); return m; }
function radBuildTX() {
  const g = new T.Group();
  const o = radOutline(); RP.half = o.half; RP.outline = o.pts;
  const shape = new T.Shape(o.pts);
  const bodyGeo = new T.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: true, bevelThickness: 0.45, bevelSize: 0.45, bevelSegments: 3, curveSegments: 6 });
  bodyGeo.translate(0, 0, -5.05);
  const body = new T.Mesh(bodyGeo, RM.body); g.add(body); pick3(body, { k: 'body' });
  const back = new T.Mesh(new T.ExtrudeGeometry(rrect(19.5, 10.5, 2.4), { depth: 2.2, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.4, bevelSegments: 2 }), RM.body);
  back.geometry.translate(0, 0.8, -7.9); g.add(back);
  mesh(g, box(6.6, 6.2, 1.0), RM.black, [0, 1.6, -8.5]);
  /* друк на панелі */
  radDecalCv = document.createElement('canvas');
  radDecalTex = new T.CanvasTexture(radDecalCv); radDecalTex.encoding = T.sRGBEncoding; radDecalTex.anisotropy = 8;
  /* ShapeGeometry дає UV у координатах контуру — переводимо в 0…1 за габаритами панелі */
  radDecalTex.repeat.set(1 / 27, 1 / 18.1); radDecalTex.offset.set(13.5 / 27, 10.5 / 18.1);
  radDrawDecal();
  const dec = new T.Mesh(new T.ShapeGeometry(shape, 4), new T.MeshBasicMaterial({ map: radDecalTex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  dec.position.z = 0.012; dec.renderOrder = 1; g.add(dec);
  /* екран 4,3″ (480×272) */
  mesh(g, new T.ExtrudeGeometry(rrect(10.8, 6.6, 0.35), { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1 }), RM.bezel, [0, 1.95, 0]);
  radScreenCv = document.createElement('canvas'); radScreenCv.width = 480; radScreenCv.height = 272;
  radScreenTex = new T.CanvasTexture(radScreenCv); radScreenTex.encoding = T.sRGBEncoding; radScreenTex.anisotropy = 4;
  pick3(mesh(g, new T.PlaneGeometry(9.5, 5.4), new T.MeshBasicMaterial({ map: radScreenTex, toneMapped: false }), [0, 1.95, 0.27]), { k: 'screen' });
  /* стіки на холах */
  for (const sx of [-1, 1]) {
    const gx = sx * GIM.x, gy = GIM.y, id = sx < 0 ? 'L' : 'R';
    const fs = rrect(5.4, 5.4, 0.6), hole = new T.Path(); hole.absarc(0, 0, 2.05, 0, Math.PI * 2, true); fs.holes.push(hole);
    mesh(g, new T.ExtrudeGeometry(fs, { depth: 0.18, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 24 }), RM.alu, [gx, gy, 0.02]);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(g, cyl(0.14, 0.14, 0.08, 10), RM.black, [gx + a * 2.25, gy + b * 2.25, 0.27], [Math.PI / 2, 0, 0]);
    const boot = mesh(g, new T.SphereGeometry(2.05, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), RM.rubber, [gx, gy, 0.04], [Math.PI / 2, 0, 0]); boot.scale.set(1, 0.22, 1);
    const piv = new T.Group(); piv.position.set(gx, gy, -1.4); g.add(piv);
    const sg = cyl(0.16, 0.16, 3.1, 12); sg.rotateX(Math.PI / 2); sg.translate(0, 0, 1.55);
    const eg = cyl(0.4, 0.36, 2.0, 24); eg.rotateX(Math.PI / 2); eg.translate(0, 0, 4.05);
    const cg = cyl(0.4, 0.4, 0.06, 24); cg.rotateX(Math.PI / 2); cg.translate(0, 0, 5.08);
    const hg = cyl(0.75, 0.75, 3.2, 8); hg.rotateX(Math.PI / 2); hg.translate(0, 0, 3.6);
    piv.add(pick3(new T.Mesh(sg, RM.chrome), { k: 'stick', id }), pick3(new T.Mesh(eg, RM.knurl), { k: 'stick', id }), new T.Mesh(cg, RM.chrome), pick3(new T.Mesh(hg, RM.hit), { k: 'stick', id }));
    const tip = new T.Object3D(); tip.position.z = 5.2; piv.add(tip);
    RP.stick[id] = piv; RP.anchor[id] = tip;
  }
  /* трими-гойдалки */
  for (const [id, t] of Object.entries(TRIMS)) {
    const grp = new T.Group(); grp.position.set(t.x, t.y, 0.02); g.add(grp);
    const w = t.hor ? t.len : 0.62, h = t.hor ? 0.62 : t.len;
    mesh(grp, new T.ExtrudeGeometry(rrect(w + 0.28, h + 0.28, 0.3), { depth: 0.05, bevelEnabled: false }), RM.black);
    const rk = new T.Group(); rk.position.z = 0.05; grp.add(rk);
    rk.add(pick3(new T.Mesh(new T.ExtrudeGeometry(rrect(w, h, 0.28), { depth: 0.28, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1 }), RM.btn), { k: 'trim', id }));
    for (const s of [-1, 1]) mesh(rk, box(t.hor ? 0.06 : 0.34, t.hor ? 0.34 : 0.06, 0.04), RM.cap, t.hor ? [s * (w / 2 - 0.3), 0, 0.37] : [0, s * (h / 2 - 0.3), 0.37]);
    RP.trim[id] = { rk, hor: t.hor, a: 0, k: 0 }; RP.anchor[id] = grp;
  }
  /* тумблери */
  for (const [id, d] of Object.entries(SWITCHES)) {
    const grp = new T.Group(); g.add(grp);
    if (d.face === 'front') grp.position.set(d.x, d.y, 0.02);
    else { grp.position.set(d.x, radTopY(d.x) + 0.45, d.z); grp.rotation.x = -Math.PI / 2; }
    mesh(grp, cyl(0.42, 0.42, 0.16, 6), RM.chrome, [0, 0, 0.08], [Math.PI / 2, 0, 0]);
    mesh(grp, cyl(0.26, 0.26, 0.3, 14), RM.chrome, [0, 0, 0.3], [Math.PI / 2, 0, 0]);
    const piv = new T.Group(); piv.position.z = 0.42; grp.add(piv);
    const L = d.lev, lg = cyl(0.075, 0.115, L, 10); lg.rotateX(Math.PI / 2); lg.translate(0, 0, L / 2);
    piv.add(pick3(new T.Mesh(lg, RM.chrome), { k: 'sw', id }));
    pick3(mesh(piv, cyl(0.15, 0.13, 0.34, 12), RM.chrome, [0, 0, L], [Math.PI / 2, 0, 0]), { k: 'sw', id });
    const hg = cyl(0.5, 0.5, L + 0.7, 8); hg.rotateX(Math.PI / 2); hg.translate(0, 0, (L + 0.7) / 2);
    piv.add(pick3(new T.Mesh(hg, RM.hit), { k: 'sw', id }));
    const tip = new T.Object3D(); tip.position.z = L + 0.3; piv.add(tip);
    RP.sw[id] = { piv, a: -30 * RDEG }; RP.anchor[id] = tip;
  }
  /* потенціометри S1/S2 */
  for (const id of ['S1', 'S2']) {
    const a = ANALOGS[id], grp = new T.Group(); grp.position.set(a.x, a.y, 0.02); g.add(grp);
    mesh(grp, cyl(0.74, 0.74, 0.05, 28), RM.black, [0, 0, 0.025], [Math.PI / 2, 0, 0]);
    const rot = new T.Group(); grp.add(rot);
    pick3(mesh(rot, cyl(0.55, 0.6, 0.55, 24), RM.black, [0, 0, 0.32], [Math.PI / 2, 0, 0]), { k: 'pot', id });
    mesh(rot, cyl(0.43, 0.43, 0.04, 24), RM.cap, [0, 0, 0.61], [Math.PI / 2, 0, 0]);
    mesh(rot, box(0.07, 0.34, 0.03), RM.white, [0, 0.22, 0.64]);
    RP.pot[id] = rot; RP.anchor[id] = rot;
  }
  /* слайдери LS/RS на боках */
  for (const id of ['LS', 'RS']) {
    const s = ANALOGS[id].side, wx = radSideX(3.0) + 0.45, grp = new T.Group(); grp.position.set(s * wx, 3.0, -2.6); g.add(grp);
    mesh(grp, box(0.1, 3.9, 0.55), RM.rubber, [s * 0.02, 0, 0]);
    const kn = new T.Group(); grp.add(kn);
    pick3(mesh(kn, box(0.5, 0.8, 1.0), RM.black, [s * 0.24, 0, 0]), { k: 'slider', id });
    for (const yy of [-0.22, 0, 0.22]) mesh(kn, box(0.04, 0.07, 0.86), RM.cap, [s * 0.5, yy, 0]);
    pick3(mesh(kn, box(1.4, 1.6, 1.6), RM.hit, [s * 0.4, 0, 0]), { k: 'slider', id });
    RP.sl[id] = { kn, grp }; RP.anchor[id] = kn;
  }
  /* шість кнопок над екраном */
  for (let i = 0; i < 6; i++) {
    const m = new T.MeshStandardMaterial({ color: C('#e9e9e2'), roughness: 0.4, emissive: C('#ff9a00'), emissiveIntensity: 0 });
    const b = pick3(mesh(g, new T.ExtrudeGeometry(rrect(0.84, 0.5, 0.12), { depth: 0.24, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 }), m, [-2.9 + i * 1.16, 6.0, 0.02]), { k: 'six', id: i });
    RP.six.push(b);
  }
  RP.anchor['6P'] = RP.six[2];
  /* кнопки меню, колесо, живлення */
  for (const [id, [x, y]] of Object.entries(NAVS)) {
    RP.nav[id] = pick3(mesh(g, new T.ExtrudeGeometry(rrect(0.98, 0.6, 0.29), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 }), RM.btn, [x, y, 0.02]), { k: 'nav', id });
    RP.anchor[id] = RP.nav[id];
  }
  const rl = new T.Group(); rl.position.set(6.45, 0.85, 0.02); g.add(rl);
  mesh(rl, cyl(0.72, 0.72, 0.06, 28), RM.black, [0, 0, 0.03], [Math.PI / 2, 0, 0]);
  RP.roll = new T.Group(); rl.add(RP.roll);
  pick3(mesh(RP.roll, cyl(0.58, 0.58, 0.34, 24), RM.cap, [0, 0, 0.22], [Math.PI / 2, 0, 0]), { k: 'roller' });
  mesh(RP.roll, box(0.08, 0.22, 0.03), RM.white, [0, 0.36, 0.4]);
  RP.anchor.ROLL = rl;
  const pw = pick3(mesh(g, cyl(0.5, 0.5, 0.2, 24), RM.btn, [0, -5.0, 0.12], [Math.PI / 2, 0, 0]), { k: 'pwr' });
  RP.pwrLed = new T.MeshBasicMaterial({ color: C('#3d8bff'), toneMapped: false });
  mesh(g, new T.TorusGeometry(0.62, 0.05, 8, 32), RP.pwrLed, [0, -5.0, 0.05]);
  RP.anchor.PWR = pw;
  /* ручка й антена */
  const hp = [[-5.6, 7.3], [-5.5, 9.2], [-4.0, 10.3], [0, 10.7], [4.0, 10.3], [5.5, 9.2], [5.6, 7.3]].map(([x, y]) => new T.Vector3(x, y, 0));
  const hm = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(hp), 48, 0.55, 10, false), RM.body);
  hm.scale.set(1, 1, 1.9); hm.position.z = -2.9; g.add(hm);
  const ag = new T.Group(); ag.position.set(7.0, radTopY(7.0) + 0.5, -4.2); g.add(ag);
  mesh(ag, cyl(0.3, 0.3, 1.2, 14), RM.black, [0, 0, 0], [0, 0, Math.PI / 2]);
  RP.ant = new T.Group(); ag.add(RP.ant);
  const bg = new T.ExtrudeGeometry(rrect(1.1, 8.0, 0.5), { depth: 0.42, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 }); bg.translate(0, 4.2, -0.21);
  pick3(new T.Mesh(bg, RM.black), { k: 'ant' }); RP.ant.add(radPick[radPick.length - 1]);
  RP.ant.rotation.x = -0.3; RP.anchor.ANT = ag;
  return g;
}
function radDrawDecal() {
  if (!radDecalCv) return;
  const minX = -13.5, maxY = 7.6, W = 27, H = 18.1, CW = 2048, CH = Math.round(CW * H / W), k = CW / W;
  radDecalCv.width = CW; radDecalCv.height = CH;
  const x = radDecalCv.getContext('2d'), P = (ux, uy) => [(ux - minX) * k, (maxY - uy) * k];
  x.clearRect(0, 0, CW, CH);
  x.strokeStyle = 'rgba(255,255,255,0.07)'; x.lineWidth = 3; x.beginPath();
  RP.outline.forEach((p, i) => { const [px, py] = P(p.x * 0.975, p.y * 0.975 - 0.05); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
  x.closePath(); x.stroke();
  const txt = (t, ux, uy, size = 0.4, al = 'center', col = 'rgba(214,218,222,0.88)') => {
    const [px, py] = P(ux, uy); x.font = `600 ${Math.round(size * k)}px "IBM Plex Mono", ui-monospace, monospace`;
    x.fillStyle = col; x.textAlign = al; x.textBaseline = 'middle'; x.fillText(t, px, py);
  };
  for (const [id, d] of Object.entries(SWITCHES)) {
    if (d.face === 'front') txt(id, d.x, d.y - 0.95);
    else txt(id, d.x + (d.z < -2 ? -0.15 * Math.sign(d.x) : 0), d.z < -2 ? 6.75 : 7.05, 0.36);
  }
  txt('S1', -4.7, 5.25, 0.34); txt('S2', 4.7, 5.25, 0.34);
  for (let i = 0; i < 6; i++) txt(String(i + 1), -2.9 + i * 1.16, 5.48, 0.26, 'center', 'rgba(214,218,222,0.6)');
  for (const [id, [nx, ny]] of Object.entries(NAVS)) txt(id, nx + (nx < 0 ? -0.72 : 0.72), ny, 0.3, nx < 0 ? 'right' : 'left');
  for (const [id, t] of Object.entries(TRIMS)) {
    if (t.hor && !t.extra) txt(id, t.x + (t.x < 0 ? -1.6 : 1.6), t.y, 0.3, t.x < 0 ? 'right' : 'left', 'rgba(214,218,222,0.62)');
    else txt(id, t.x, t.y - (t.hor ? 0.6 : t.len / 2 + 0.42), 0.28, 'center', 'rgba(214,218,222,0.62)');
  }
  txt('POWER', 0, -5.78, 0.26, 'center', 'rgba(214,218,222,0.62)');
  txt('MODE 2', 0, -6.75, 0.24, 'center', 'rgba(214,218,222,0.4)');
  radDecalTex.needsUpdate = true;
}
function radBuildDrone() {
  const g = new T.Group(), k = 3.5, inner = new T.Group(); inner.scale.setScalar(k); g.add(inner);
  const carbon = new T.MeshStandardMaterial({ color: C('#25292d'), roughness: 0.55, metalness: 0.25 });
  const motorM = new T.MeshStandardMaterial({ color: C('#7b5ce0'), roughness: 0.35, metalness: 0.7 });
  const battM = new T.MeshStandardMaterial({ color: C('#C93B2B'), roughness: 0.5 });
  const bladeM = new T.MeshStandardMaterial({ color: C('#E8820F'), roughness: 0.45 });
  RP.blurM = new T.MeshBasicMaterial({ color: C('#E8820F'), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  mesh(inner, box(1.3, 0.3, 2.6), carbon, [0, 0.25, 0]);
  RP.props = [];
  /* мотори 1–4 за Betaflight: задній правий, передній правий, задній лівий, передній лівий; Props In */
  [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].forEach(([sx, sz, dir]) => {
    const arm = mesh(inner, box(0.3, 0.12, 2.5), carbon, [sx * 0.88, 0.16, sz * 0.88]); arm.rotation.y = Math.atan2(sx, sz);
    mesh(inner, cyl(0.3, 0.3, 0.35, 16), motorM, [sx * 1.75, 0.38, sz * 1.75]);
    const pg = new T.Group(); pg.position.set(sx * 1.75, 0.6, sz * 1.75); inner.add(pg);
    mesh(pg, box(2.5, 0.03, 0.22), bladeM); mesh(pg, cyl(0.12, 0.12, 0.12, 10), carbon, [0, 0.03, 0]);
    const blur = mesh(inner, new T.CircleGeometry(1.32, 40), RP.blurM, [sx * 1.75, 0.63, sz * 1.75], [-Math.PI / 2, 0, 0]); blur.renderOrder = 3;
    RP.props.push({ g: pg, dir });
  });
  mesh(inner, box(1.0, 0.55, 1.8), battM, [0, 0.7, 0.1]);
  mesh(inner, box(0.55, 0.55, 0.5), carbon, [0, 0.45, -1.35]);
  mesh(inner, cyl(0.17, 0.19, 0.2, 16), RM.black, [0, 0.45, -1.68], [Math.PI / 2, 0, 0]);
  const arrowM = new T.MeshBasicMaterial({ color: C('#FFB21A'), toneMapped: false });
  const ar = mesh(inner, new T.ConeGeometry(0.28, 0.6, 3), arrowM, [0, 1.0, -0.45], [-Math.PI / 2, 0, 0]); ar.scale.set(1, 1, 0.35);
  RP.beepM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  RP.beepR = [0, 1].map(() => { const r = new T.Mesh(new T.RingGeometry(0.9, 1.0, 48), RP.beepM.clone()); r.rotation.x = -Math.PI / 2; r.renderOrder = 6; radG.add(r); return r; });
  return g;
}
function drawRadGround() {
  const size = 1024, span = 360, px = size / span, cv = RP.gtex.image;
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, size, size);
  for (let i = 0; i <= span; i += 6) {
    const p = Math.round(i * px) + 0.5, maj = i % 30 === 0;
    x.strokeStyle = maj ? css('--mat-major') : css('--mat-minor'); x.lineWidth = maj ? 1.6 : 1;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, size); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(size, p); x.stroke();
  }
  /* межа арени й майданчик зльоту */
  const P = RAD_PHY, cz = RP.groundZ, toPx = (wx, wz) => [(wx + span / 2) * px, (wz - cz + span / 2) * px];
  const [ax, ay] = toPx(-P.BX * P.U, P.ZF * P.U + P.PADZ), [bx, by] = toPx(P.BX * P.U, P.ZN * P.U + P.PADZ);
  x.setLineDash([10, 8]); x.strokeStyle = css('--mat-text'); x.lineWidth = 2; x.strokeRect(ax, ay, bx - ax, by - ay); x.setLineDash([]);
  const [cx, cy] = toPx(0, P.PADZ);
  x.strokeStyle = css('--accent'); x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, 13 * px, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 5 * px, cy - 6 * px); x.lineTo(cx - 5 * px, cy + 6 * px); x.moveTo(cx + 5 * px, cy - 6 * px); x.lineTo(cx + 5 * px, cy + 6 * px); x.moveTo(cx - 5 * px, cy); x.lineTo(cx + 5 * px, cy); x.stroke();
  x.globalCompositeOperation = 'destination-in';
  const gr = x.createRadialGradient(size / 2, size / 2, size * 0.18, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';
  RP.gtex.needsUpdate = true;
}
function radBuildArena() {
  const a = new T.Group(); radG.add(a); RP.arena = a;
  RP.groundZ = RAD_PHY.PADZ - 40;
  RP.gtex = new T.CanvasTexture(document.createElement('canvas')); RP.gtex.encoding = T.sRGBEncoding; RP.gtex.anisotropy = 8;
  drawRadGround();
  const gm = new T.Mesh(new T.PlaneGeometry(360, 360), new T.MeshBasicMaterial({ map: RP.gtex, transparent: true, depthWrite: false, toneMapped: false }));
  gm.rotation.x = -Math.PI / 2; gm.position.set(0, 0, RP.groundZ); gm.renderOrder = -2; a.add(gm);
  const gateM = new T.MeshStandardMaterial({ color: C('#E8820F'), roughness: 0.5 });
  const gz = RAD_PHY.PADZ - 66;
  for (const sx of [-1, 1]) mesh(a, cyl(0.7, 0.7, 30, 10), gateM, [sx * 18, 15, gz]);
  mesh(a, box(37.4, 1.4, 1.4), gateM, [0, 30, gz]);
  const coneM = new T.MeshStandardMaterial({ color: C('#E8A200'), roughness: 0.6 });
  const P = RAD_PHY;
  [[-1, P.ZF], [1, P.ZF], [-1, P.ZN], [1, P.ZN]].forEach(([sx, z]) => mesh(a, new T.ConeGeometry(2.2, 5, 16), coneM, [sx * P.BX * P.U, 2.5, P.PADZ + z * P.U]));
  RP.shadow = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: TEX.shadow, color: 0x000000, transparent: true, depthWrite: false, toneMapped: false }));
  RP.shadow.rotation.x = -Math.PI / 2; RP.shadow.renderOrder = -1; a.add(RP.shadow);
}
function radInit() {
  radMats();
  radG = new T.Group(); radG.visible = false; scene.add(radG);
  radBuildArena();
  radTX = radBuildTX(); radTX.position.set(0, 14, 0); radTX.rotation.x = -0.5; radG.add(radTX);
  radDr = radBuildDrone(); RP.arena.add(radDr);
  RP.glow = glowSprite('#ffb21a', 3.2); RP.glow.material.depthTest = false; RP.glow.renderOrder = 999; RP.glow.visible = false; radG.add(RP.glow);
  radResetDrone(); radChannels(); radScreen();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { radDrawDecal(); radScreen(); });
}
function radEnter() {
  if (!radG) return;
  radG.visible = true; RP.arena.visible = true; radTX.visible = true;
  if (RAD.view === 'guide' || RAD.view === 'free') RAD.view = 'pilot';
  ctl.auto = false; updateSpinBtn();
  radFrame(RAD.view);
  RAD.scrT = 1; radDirtyUI();
}
function radExit() {
  if (radG) radG.visible = false;
  for (const [k, e] of LB) if (k.startsWith('rad')) e.on = false;
  RAD.keys = {}; RAD.hold.L = RAD.hold.R = 0; RAD.hover = null;
  if (radGain) radGain.gain.value = 0;
  canvas.classList.remove('hovering');
}
function radTheme() { if (radG) drawRadGround(); }
function radDronePos(out) {
  const P = RAD_PHY, p = DRS.p || { x: 0, y: 0, z: 0 };
  return (out || new T.Vector3()).set(p.x * P.U, p.y * P.U + 2.0, P.PADZ + p.z * P.U);
}
/* «Пілот»: камера стоїть над пультом (як очі пілота) і лише повертається: пульт унизу кадру, дрон — над ним.
 * Якщо дрон піднявся чи відлетів так, що обидва не влазять, у кадрі лишається дрон. */
function radPilotAim() {
  const vf = camera.fov * RDEG, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const D = Math.max(87, 15.5 / Math.tan(hf / 2)), el = 0.49;
  const pos = new T.Vector3(0, 14 + D * Math.sin(el), D * Math.cos(el));
  radTX.updateMatrixWorld(true);
  const ang = p => Math.atan2(pos.y - p.y, Math.hypot(p.x - pos.x, p.z - pos.z));
  const aTop = ang(radTX.localToWorld(new T.Vector3(0, 12.6, -2))), aBot = ang(radTX.localToWorld(new T.Vector3(0, -10.6, 0.5)));
  const dp = radDronePos(), aD = ang(dp);
  let top = Math.min(aD - 6 * RDEG, aTop - 1.5 * RDEG), bot = aBot + 2 * RDEG;
  const span = vf * 0.94;
  if (bot - top > span) bot = top + span;
  const pitch = (top + bot) / 2, yaw = -Math.atan2(dp.x - pos.x, pos.z - dp.z) * 0.55, d = 100;
  ctl.tYaw = ctl.yaw + wrapPi(yaw - ctl.yaw); ctl.tPitch = pitch; ctl.tDist = d;
  ctl.tTarget.set(pos.x - d * Math.cos(pitch) * Math.sin(yaw), pos.y - d * Math.sin(pitch), pos.z - d * Math.cos(pitch) * Math.cos(yaw));
}
function radFrame(view) {
  if (!ok3d || !radG) return;
  RAD.view = view || RAD.view;
  document.querySelectorAll('[data-rview]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.rview === RAD.view)));
  if (RAD.view === 'radio') setView(new T.Vector3(0, 14.9, -0.5), 0, 0.6, fitDist(14.2));
  else if (RAD.view === 'drone') setView(radDronePos(), 0, 0.32, fitDist(28));
  else if (RAD.view === 'pilot') radPilotAim();
}
/* користувач сам обертає чи масштабує — камера перестає стежити */
function radFreeView() { if (RAD.view !== 'free') { RAD.view = 'free'; document.querySelectorAll('[data-rview]').forEach(b => b.setAttribute('aria-pressed', 'false')); } }

/* ---------- кадр: візуал ---------- */
function radVisual(dt, now) {
  const st = RAD.st, kk = 1 - Math.exp(-dt * 18);
  for (const id of ['L', 'R']) {
    const u = id === 'L' ? st.lx : st.rx, v = id === 'L' ? st.ly : st.ry, piv = RP.stick[id];
    piv.rotation.set(-v * GIM.max * RDEG, u * GIM.max * RDEG, 0);
  }
  for (const id of SW_ORDER) { const s = RP.sw[id], t = (RAD.sw[id] - 1) * 30 * RDEG; s.a += (t - s.a) * kk; s.piv.rotation.x = s.a; }
  for (const id of ['S1', 'S2']) RP.pot[id].rotation.z = -RAD.an[id] * 150 * RDEG;
  for (const id of ['LS', 'RS']) RP.sl[id].kn.position.y += (RAD.an[id] * 1.5 - RP.sl[id].kn.position.y) * kk;
  for (const id in RP.trim) {
    const t = RP.trim[id]; t.k += ((t.a ? 1 : 0) - t.k) * (1 - Math.exp(-dt * 30));
    if (t.a && !RAD.pressed[id]) t.a *= Math.exp(-dt * 12), Math.abs(t.a) < 0.05 && (t.a = 0);
    const ang = Math.sign(t.a) * t.k * 9 * RDEG;
    if (t.hor) t.rk.rotation.y = -ang; else t.rk.rotation.x = ang;
  }
  RP.six.forEach((b, i) => { const on = RAD.power && i === RAD.six; b.material.emissiveIntensity = on ? 1.3 : RAD.power ? 0.03 : 0; b.material.color.copy(C(on ? '#ffcf70' : '#e9e9e2')); b.position.z = on ? -0.05 : 0.02; });
  for (const id in RP.nav) RP.nav[id].position.z += ((RAD.pressed[id] ? -0.08 : 0.02) - RP.nav[id].position.z) * kk;
  RP.roll.rotation.z += (-RAD.roller * 0.5 - RP.roll.rotation.z) * kk;
  RP.pwrLed.color.copy(C(RAD.power ? '#3d8bff' : '#1a1d22'));
  RP.ant.rotation.x += ((RAD.ant ? -1.45 : -0.3) - RP.ant.rotation.x) * (1 - Math.exp(-dt * 6));
  /* дрон */
  const dp = radDronePos(_v1);
  radDr.position.set(dp.x, dp.y - 2.0 + RAD_PHY.H0, dp.z);
  if (DRS.q) radDr.quaternion.copy(DRS.q);
  const spin = FCS.armed ? (FCS.turtle ? DRS.out * 40 : 12 + DRS.out * 70) : 0;
  RP.props.forEach((pp, i) => {
    let d = pp.dir; if (FCS.turtle) d = -d;
    const active = !FCS.turtle || (i % 2 === (FCS.rc && FCS.rc.roll > 0 ? 0 : 1));
    DRS.ang[i] += (active && !FCS.crashed ? spin : 0) * d * dt; pp.g.rotation.y = DRS.ang[i];
  });
  RP.blurM.opacity = FCS.crashed ? 0 : Math.min(0.32, spin / 80);
  const h = Math.max(0, dp.y - 2);
  RP.shadow.position.set(dp.x, 0.05, dp.z);
  const ss = 18 + h * 0.35; RP.shadow.scale.set(ss, ss, 1); RP.shadow.material.opacity = 0.75 * Math.exp(-h / 70);
  /* біпер */
  RP.beepR.forEach((r, i) => {
    const on = FCS.beepNow || (FCS.beepOn && !reduceMotion);
    const ph = (now * 1.4 + i * 0.5) % 1;
    r.visible = RP.arena.visible && (!!FCS.beepOn || !!FCS.beep);
    r.position.set(dp.x, dp.y + 1.5, dp.z); r.scale.setScalar(4 + ph * 14); r.material.opacity = (on ? 0.7 : 0.35) * (1 - ph);
    r.material.color.copy(C(FCS.fs ? TC['--bad'] : TC['--accent']));
  });
  /* мітки */
  const v = radVerdict();
  const ar = RP.arena.visible;
  const ld = label('radDr', `<b>${v.t}</b><span class="lx"> · ${v.m}</span>`, 'lv ' + v.cls); ld.pos = dp.clone().add(new T.Vector3(0, 9, 0)); ld.on = ar;
  const lw = label('radWall', 'межа арени', 'tag sm'); lw.pos = dp.clone().add(new T.Vector3(0, -4, 0)); lw.on = ar && DRS.wall > 0;
  const bp = label('radBeep', FCS.fs ? 'біп · RX втрачено' : 'біп', 'tag sm'); bp.pos = dp.clone().add(new T.Vector3(0, 5, 0)); bp.on = ar && !!FCS.beepOn;
  RAD.tipT = Math.max(0, RAD.tipT - dt);
  const tipId = RAD.hover || (RAD.tipT > 0 ? RAD.tip : null);
  const tl = label('radTip', RAD.tipHtml || '', 'tag rtip');
  tl.on = !!tipId && !!RP.anchor[tipId] && !!RAD.tipHtml && radTX.visible;
  if (tl.on) { tl.pos = RP.anchor[tipId].getWorldPosition(new T.Vector3()); tl.oy = -26; }
  /* підсвітка органу керування (з гайдів або сценаріїв) */
  RAD.hlT = Math.max(0, RAD.hlT - dt);
  RP.glow.visible = !!RAD.hl && RAD.hlT > 0 && !!RP.anchor[RAD.hl] && radTX.visible;
  if (RP.glow.visible) { RP.anchor[RAD.hl].getWorldPosition(RP.glow.position); const s = 3.2 + Math.sin(now * 6) * 0.8; RP.glow.scale.set(s, s, s); }
  /* камера «пілот» стежить за дроном, «дрон» — веде його */
  if (ctl.drag) radFreeView();
  else if (RAD.view === 'drone') ctl.tTarget.copy(dp);
  else if (RAD.view === 'pilot') radPilotAim();
}
function radVerdict() {
  if (!radLinkOk() && !FCS.fs) return { t: 'НЕМАЄ ЗВ’ЯЗКУ', m: RAD.power ? (RAD.warn ? 'пульт чекає перевірки' : 'приймач не чує пульт') : 'пульт вимкнено', cls: 'bad' };
  if (FCS.fs) return { t: 'FAILSAFE', m: FCS.fs === 1 ? 'стадія 1' : `стадія 2 · ${RAD.fsProc === 'drop' ? 'Drop' : 'Land'}`, cls: 'bad' };
  if (FCS.armed && FCS.turtle) return { t: 'TURTLE', m: 'мотори реверсом', cls: 'warn' };
  if (FCS.armed && FCS.crashed) return { t: 'УДАР', m: 'вимкніть ARM', cls: 'bad' };
  if (FCS.armed) return { t: 'ARMED', m: FCS.mode.toUpperCase(), cls: 'ok' };
  if (FCS.act.arm && FCS.flags.length) return { t: 'НЕ АРМИТЬСЯ', m: FCS.flags[0], cls: 'warn' };
  return { t: 'DISARMED', m: FCS.mode.toUpperCase(), cls: 'info' };
}
function radTip(id, html) { RAD.tip = id; RAD.tipHtml = html; RAD.tipT = 2.6; radDirtyUI(); }
function radCtlTip(id) {
  if (SWITCHES[id]) return `<b>${id} ${swPosTxt(id)}</b> · ${SWITCHES[id].n} пол.${SWITCHES[id].mom ? ', без фіксації' : ''} · ${routeTxt(id)}`;
  if (ANALOGS[id]) return `<b>${id}</b> · ${ANALOGS[id].name} · ${Math.round(RAD.an[id] * 100)} % · ${routeTxt(id)}`;
  if (id === 'L') return `<b>Лівий стік</b> · газ ${Math.round((RAD.st.ly + 1) * 50)} % (CH3) · рискання (CH4)`;
  if (id === 'R') return '<b>Правий стік</b> · тангаж (CH2) · крен (CH1) · з пружиною';
  if (TRIMS[id]) return `<b>${id}</b> · ${TRIMS[id].extra ? 'додатковий трим, ні на що не призначений' : 'трим ' + TRIMS[id].what} · ${RAD.trim[id]} %`;
  if (id === '6P') return `<b>6POS</b> · кнопка ${RAD.six + 1} · ${routeTxt('6P')}`;
  if (NAV_TXT[id]) return NAV_TXT[id];
  if (id === 'ROLL') return '<b>Колесо</b> · прокрутка меню, натискання — вибір';
  if (id === 'PWR') return `<b>Живлення</b> · ${RAD.power ? 'вимкнути пульт — дрон втратить зв’язок' : 'увімкнути пульт'}`;
  if (id === 'ANT') return '<b>Антена ELRS</b> · складається на петлі; у польоті — розкладена';
  return '';
}
function radTipCtl(id) { radTip(id, radCtlTip(id)); }

/* ---------- кадр ---------- */
function radInputs(dt) {
  const k = RAD.keys, st = RAD.st, a = 1 - Math.exp(-dt * 12);
  if (k.KeyW) st.ly = Math.min(1, st.ly + dt * 0.8);
  if (k.KeyS) st.ly = Math.max(-1, st.ly - dt * 0.8);
  const yaw = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), pit = (k.ArrowUp ? 1 : 0) - (k.ArrowDown ? 1 : 0), rol = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
  if (!RAD.hold.L) st.lx += (yaw - st.lx) * a;
  if (!RAD.hold.R) { st.rx += (rol - st.rx) * a; st.ry += (pit - st.ry) * a; }
  for (const key of ['lx', 'rx', 'ry']) if (Math.abs(st[key]) < 0.004) st[key] = 0;
  if (RAD.earlyT > 0) { RAD.earlyT -= dt; if (RAD.earlyT <= 0) { RAD.link = true; radDirtyUI(); } }
  /* демонстрація failsafe: зліт, висіння, обрив зв’язку */
  if (RAD.demo === 'fs') {
    const t = (RAD.demoT += dt);
    if (t > 0.3 && t < 2.4) st.ly = -0.22; else if (t >= 2.4 && t < 3.4) st.ly = -0.45;
    if (t >= 3.4) { RAD.link = false; RAD.demo = null; radDirtyUI(); }
  }
  radWarnCheck();
}
function radStep(dt) {
  radInputs(dt);
  radChannels();
  fcStep(dt);
  if (DRS.p) drStep(dt);
  radBeeper(dt);
}
function tickRad(dt, now) {
  if (!radG) return;
  radStep(dt);
  radVisual(dt, now);
  RAD.uiT += dt; if (RAD.uiT > 0.08) { RAD.uiT = 0; radReadout(); }
  RAD.scrT += dt; if (RAD.scrT > 0.12) { RAD.scrT = 0; radScreen(); }
}

/* ---------- екран пульта (EdgeTX, спрощено) ---------- */
function radScreen() {
  if (!radScreenCv) return;
  const x = radScreenCv.getContext('2d'), W = 480, H = 272, F = (w, s) => `${w} ${s}px "IBM Plex Mono", ui-monospace, monospace`;
  const AC = '#ffb21a', TX = '#e9ecef', MU = '#8f99a3', BG = '#171b20', PN = '#20262d';
  x.textBaseline = 'middle'; x.textAlign = 'left';
  if (!RAD.power) { x.fillStyle = '#030405'; x.fillRect(0, 0, W, H); radScreenTex.needsUpdate = true; return; }
  x.fillStyle = BG; x.fillRect(0, 0, W, H);
  x.fillStyle = '#0c0e11'; x.fillRect(0, 0, W, 30);
  x.fillStyle = AC; x.fillRect(0, 0, 36, 30);
  x.fillStyle = '#111'; x.font = F(700, 18); x.textAlign = 'center'; x.fillText('≡', 18, 15);
  x.textAlign = 'left'; x.fillStyle = TX; x.font = F(600, 15);
  x.fillText(RAD.warn ? 'Перевірка' : PAGE_TITLE[RAD.page], 46, 15);
  x.textAlign = 'right'; x.font = F(500, 13); x.fillStyle = MU; x.fillText('7,9 В', W - 10, 15);
  const lq = radLinkOk() ? 100 : 0;
  for (let i = 0; i < 4; i++) { x.fillStyle = lq > i * 25 ? (lq ? TX : MU) : '#3a424a'; x.fillRect(W - 112 + i * 7, 22 - i * 4, 5, 4 + i * 4); }
  x.fillStyle = radLinkOk() ? '#57C08A' : '#FF6B5B'; x.font = F(600, 12); x.fillText('ELRS', W - 64, 15);
  if (RAD.warn) {
    x.fillStyle = '#3a2410'; x.fillRect(20, 52, W - 40, 190); x.strokeStyle = AC; x.lineWidth = 2; x.strokeRect(20, 52, W - 40, 190);
    x.textAlign = 'center'; x.fillStyle = AC; x.font = F(700, 22); x.fillText(RAD.warn === 'thr' ? 'ГАЗ НЕ НА МІНІМУМІ' : 'ПЕРЕМИКАЧІ', W / 2, 92);
    x.fillStyle = TX; x.font = F(500, 15);
    if (RAD.warn === 'thr') { x.fillText('Опустіть лівий стік униз.', W / 2, 140); x.fillText('Радіомодуль увімкнеться після перевірки.', W / 2, 166); }
    else {
      const bad = SW_ORDER.filter(k => RAD.sw[k] !== 0);
      x.fillText(`Не в початковому положенні: ${bad.join(', ')}`, W / 2, 136);
      x.fillText('Поверніть їх угору (↑)', W / 2, 162); x.fillStyle = MU; x.fillText('або RTN — пропустити', W / 2, 188);
    }
    radScreenTex.needsUpdate = true; return;
  }
  const p = RAD.page;
  if (p === 'main') {
    const trimBar = (val, cx, cy, len, hor) => {
      x.fillStyle = '#2c333b'; if (hor) x.fillRect(cx - len / 2, cy - 3, len, 6); else x.fillRect(cx - 3, cy - len / 2, 6, len);
      x.fillStyle = MU; if (hor) x.fillRect(cx - 1, cy - 6, 2, 12); else x.fillRect(cx - 6, cy - 1, 12, 2);
      const o = val / 25 * (len / 2 - 6); x.fillStyle = val ? AC : TX;
      if (hor) x.fillRect(cx + o - 5, cy - 6, 10, 12); else x.fillRect(cx - 6, cy - o - 5, 12, 10);
    };
    trimBar(RAD.trim.T1, 120, 256, 170, true); trimBar(RAD.trim.T4, 360, 256, 170, true);
    trimBar(RAD.trim.T3, 14, 150, 170, false); trimBar(RAD.trim.T2, W - 14, 150, 170, false);
    trimBar(RAD.trim.T5, 214, 232, 52, true); trimBar(RAD.trim.T6, 266, 232, 52, true);
    x.textAlign = 'center'; x.fillStyle = MU; x.font = F(500, 13); x.fillText('Таймер 1', W / 2, 60);
    const t = Math.floor(FCS.timer); x.fillStyle = FCS.armed ? AC : TX; x.font = F(600, 50);
    x.fillText(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, W / 2, 104);
    x.font = F(600, 20); x.fillStyle = FCS.armed && radLinkOk() ? '#57C08A' : TX; x.fillText(radLinkOk() ? radFM() : 'Телеметрія втрачена', W / 2, 150);
    x.font = F(500, 13); x.fillStyle = MU;
    x.fillText(`RxBt ${radLinkOk() ? fmt(FCS.volt, 1) + ' В' : '—'}   RQly ${lq} %   S1 ${Math.round(RAD.an.S1 * 100)}   S2 ${Math.round(RAD.an.S2 * 100)}`, W / 2, 186);
    x.fillText(`LS ${Math.round(RAD.an.LS * 100)}   RS ${Math.round(RAD.an.RS * 100)}   6P ${RAD.six + 1}`, W / 2, 208);
  } else if (p === 'tele') {
    const ok = radLinkOk(), rows = [['1RSS', ok ? `${Math.round(-38 - 20 * Math.log10(1 + Math.hypot(DRS.p ? DRS.p.x : 0, DRS.p ? DRS.p.z - 14 : 14) / 5))} дБм` : '—'], ['RQly', `${ok ? 100 : 0} %`], ['TPWR', ok ? '100 мВт' : '—'], ['RxBt', ok ? `${fmt(FCS.volt, 1)} В` : '—'], ['Curr', ok ? `${fmt(FCS.cur, 1)} А` : '—'], ['FM', ok ? radFM() : '—']];
    rows.forEach(([k, v], i) => {
      const cx = 16 + (i % 2) * 228, cy = 44 + Math.floor(i / 2) * 74;
      x.fillStyle = PN; x.fillRect(cx, cy, 220, 64);
      x.textAlign = 'left'; x.fillStyle = MU; x.font = F(500, 13); x.fillText(k, cx + 12, cy + 18);
      x.fillStyle = ok ? TX : MU; x.font = F(600, 24); x.fillText(v, cx + 12, cy + 44);
    });
  } else if (p === 'mon') {
    for (let i = 0; i < 16; i++) {
      const cx = 10 + Math.floor(i / 8) * 236, cy = 46 + (i % 8) * 27, v = RAD.tx[i], m = RAD.mix[i + 1];
      x.textAlign = 'left'; x.fillStyle = TX; x.font = F(600, 12); x.fillText(`CH${i + 1}`, cx, cy);
      x.fillStyle = MU; x.font = F(500, 11); x.fillText(i < 4 ? CH_FIX[i + 1][0] : m ? m.src : '—', cx + 40, cy);
      x.fillStyle = '#2c333b'; x.fillRect(cx + 82, cy - 6, 100, 12);
      const o = (v - 1500) / 512 * 50; x.fillStyle = AC; x.fillRect(cx + 132 + Math.min(0, o), cy - 6, Math.abs(o) || 1, 12);
      x.fillStyle = MU; x.fillRect(cx + 131, cy - 8, 2, 16);
      x.textAlign = 'right'; x.fillStyle = TX; x.font = F(500, 11); x.fillText(String(v), cx + 226, cy);
    }
  } else if (p === 'mix') {
    for (let c = 1; c <= 12; c++) {
      const cx = 12 + Math.floor((c - 1) / 6) * 234, cy = 52 + ((c - 1) % 6) * 34, m = RAD.mix[c];
      x.fillStyle = PN; x.fillRect(cx, cy - 13, 222, 26);
      x.textAlign = 'left'; x.fillStyle = AC; x.font = F(600, 13); x.fillText(`CH${c}`, cx + 8, cy);
      x.fillStyle = TX; x.font = F(500, 13); x.fillText(`${m.inv ? '−' : ''}${c <= 4 ? m.src : m.src === '—' ? '—' : m.src}`, cx + 62, cy);
      x.textAlign = 'right'; x.fillStyle = MU; x.font = F(500, 11); x.fillText(c <= 4 ? 'стік' : `AUX${c - 4}`, cx + 212, cy);
    }
  } else if (p === 'sys') {
    const lines = [['Режим стіків', 'Mode 2 (газ ліворуч)'], ['Калібрування', 'виконано'], ['Вбудований модуль', 'ExpressLRS 2,4 ГГц'], ['Протокол', 'CRSF'], ['Батарея пульта', '7,9 В (2S)'], ['Прошивка', 'EdgeTX']];
    lines.forEach(([k, v], i) => {
      const cy = 52 + i * 34; x.fillStyle = i % 2 ? BG : PN; x.fillRect(10, cy - 15, W - 20, 30);
      x.textAlign = 'left'; x.fillStyle = MU; x.font = F(500, 13); x.fillText(k, 22, cy);
      x.textAlign = 'right'; x.fillStyle = TX; x.font = F(600, 13); x.fillText(v, W - 22, cy);
    });
  }
  radScreenTex.needsUpdate = true;
}
/* режим польоту в телеметрії CRSF, як його передає Betaflight */
function radFM() {
  if (FCS.fs) return '!FS!';
  if (!FCS.armed && FCS.flags.length) return '!ERR';
  const m = FCS.mode === 'angle' ? 'STAB' : FCS.mode === 'horizon' ? 'HOR' : 'AIR';
  return m + (FCS.armed ? '' : '*');
}

/* ================= ВКАЗІВНИК НА 3D-ПУЛЬТІ ================= */
const radPtr = new Map();
function radOwns(id) { return radPtr.has(id); }
/* органи 3D-пульта відгукуються в розділі «Пульт» і на кроках гайдів, де показано пульт */
function radPtrOn() { return !!radTX && radG.visible && radTX.visible && (S.mode === 'radio' || S.mode === 'guides'); }
function radHit(cx, cy) {
  if (!radTX || !radTX.visible) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  for (const h of raycaster.intersectObjects(radPick, false)) {
    const rc = h.object.userData.rc; if (!rc) continue;
    if (rc.k === 'body') return null;
    return Object.assign({ point: h.point }, rc);
  }
  return null;
}
const stagePt = e => { const r = stageEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function stickTip(id, u, v) {
  const piv = RP.stick[id], e = new T.Euler(-v * GIM.max * RDEG, u * GIM.max * RDEG, 0);
  const p = new T.Vector3(0, 0, 5.2).applyEuler(e).add(piv.position);
  return toScreen(p.applyMatrix4(piv.parent.matrixWorld));
}
function ctlId(h) {
  if (h.k === 'stick' || h.k === 'sw' || h.k === 'pot' || h.k === 'slider' || h.k === 'trim' || h.k === 'nav') return h.id;
  return { six: '6P', roller: 'ROLL', pwr: 'PWR', ant: 'ANT' }[h.k] || null;
}
function radDown(e) {
  const h = radHit(e.clientX, e.clientY); if (!h || h.k === 'screen') return false;
  const p = stagePt(e), g = { k: h.k, id: h.id, x0: p.x, y0: p.y, lx: p.x, ly: p.y, moved: 0, shift: e.shiftKey };
  if (h.k === 'stick') {
    RAD.hold[h.id] = 1;
    const u = h.id === 'L' ? RAD.st.lx : RAD.st.rx, v = h.id === 'L' ? RAD.st.ly : RAD.st.ry;
    const c = stickTip(h.id, 0, 0), ex = stickTip(h.id, 1, 0), ey = stickTip(h.id, 0, 1), cur = stickTip(h.id, u, v);
    g.c = c; g.ex = { x: ex.x - c.x, y: ex.y - c.y }; g.ey = { x: ey.x - c.x, y: ey.y - c.y }; g.off = { x: p.x - cur.x, y: p.y - cur.y };
  } else if (h.k === 'sw') { if (SWITCHES[h.id].mom) swSet(h.id, 2); else radTipCtl(h.id); }
  else if (h.k === 'trim') {
    const loc = RP.trim[h.id].rk.worldToLocal(h.point.clone()), d = TRIMS[h.id].hor ? (loc.x >= 0 ? 1 : -1) : (loc.y >= 0 ? 1 : -1);
    RAD.pressed[h.id] = 1; trimStep(h.id, d);
    g.rep = setTimeout(function rep() { trimStep(h.id, d); g.rep = setTimeout(rep, 70); }, 380);
  } else if (h.k === 'six') { RAD.six = h.id; radTipCtl('6P'); }
  else if (h.k === 'nav') { RAD.pressed[h.id] = 1; radNav(h.id); }
  else if (h.k === 'slider') {
    const kn = RP.sl[h.id].kn.parent, a = toScreen(new T.Vector3(0, -1.5, 0).applyMatrix4(kn.matrixWorld)), b = toScreen(new T.Vector3(0, 1.5, 0).applyMatrix4(kn.matrixWorld));
    g.a = a; g.b = b; radTipCtl(h.id);
  } else radTipCtl(ctlId(h) || '');
  radPtr.set(e.pointerId, g);
  return true;
}
function radMove(e) {
  const g = radPtr.get(e.pointerId); if (!g) return;
  const p = stagePt(e), dx = p.x - g.lx, dy = p.y - g.ly; g.lx = p.x; g.ly = p.y;
  g.moved = Math.max(g.moved, Math.hypot(p.x - g.x0, p.y - g.y0));
  if (g.k === 'stick') {
    const rx = p.x - g.off.x - g.c.x, ry = p.y - g.off.y - g.c.y, det = g.ex.x * g.ey.y - g.ey.x * g.ex.y;
    if (Math.abs(det) < 1e-3) return;
    const u = clamp((rx * g.ey.y - ry * g.ey.x) / det, -1, 1), v = clamp((g.ex.x * ry - g.ex.y * rx) / det, -1, 1);
    if (g.id === 'L') { RAD.st.lx = u; RAD.st.ly = v; } else { RAD.st.rx = u; RAD.st.ry = v; }
    radTipCtl(g.id);
  } else if (g.k === 'pot') { RAD.an[g.id] = clamp(RAD.an[g.id] + (dx - dy) * 0.008, -1, 1); if (Math.abs(RAD.an[g.id]) < 0.03) RAD.an[g.id] = 0; radTipCtl(g.id); }
  else if (g.k === 'slider') {
    const vx = g.b.x - g.a.x, vy = g.b.y - g.a.y, L2 = vx * vx + vy * vy || 1, t = ((p.x - g.a.x) * vx + (p.y - g.a.y) * vy) / L2;
    RAD.an[g.id] = clamp(t * 2 - 1, -1, 1); if (Math.abs(RAD.an[g.id]) < 0.04) RAD.an[g.id] = 0; radTipCtl(g.id);
  } else if (g.k === 'roller') {
    g.acc = (g.acc || 0) + dy;
    while (Math.abs(g.acc) > 28) { const d = Math.sign(g.acc); g.acc -= d * 28; RAD.roller += d; radNav(d > 0 ? 'PAGE>' : 'PAGE<'); }
  }
}
function radUp(e) {
  const g = radPtr.get(e.pointerId); if (!g) return;
  radPtr.delete(e.pointerId);
  if (g.k === 'stick') RAD.hold[g.id] = 0;
  else if (g.k === 'sw') { if (SWITCHES[g.id].mom) swSet(g.id, 0); else if (g.moved < 12) swCycle(g.id, g.shift); }
  else if (g.k === 'trim') { clearTimeout(g.rep); RAD.pressed[g.id] = 0; }
  else if (g.k === 'nav') RAD.pressed[g.id] = 0;
  else if (g.k === 'roller' && g.moved < 6) { RAD.roller += 1; radNav('RTN'); }
  else if (g.k === 'pwr' && e.type === 'pointerup') { radPower(!RAD.power); radTipCtl('PWR'); }
  else if (g.k === 'ant' && g.moved < 6) { RAD.ant = RAD.ant ? 0 : 1; radTipCtl('ANT'); }
}
function radHover(cx, cy) {
  const h = radHit(cx, cy), id = h ? ctlId(h) : null;
  canvas.classList.toggle('hovering', !!id);
  if (id !== RAD.hover) { RAD.hover = id; if (id) RAD.tipHtml = radCtlTip(id); }
}
function radWheel(e) {
  const h = radHit(e.clientX, e.clientY); if (!h) { radFreeView(); return false; }
  const d = e.deltaY > 0 ? -1 : 1;
  if (h.k === 'pot' || h.k === 'slider') { RAD.an[h.id] = clamp(Math.round((RAD.an[h.id] + d * 0.05) * 100) / 100, -1, 1); radTipCtl(h.id); return true; }
  if (h.k === 'roller') { RAD.roller -= d; radNav(d < 0 ? 'PAGE>' : 'PAGE<'); return true; }
  return false;
}
function radDblClick(e) {
  const h = radHit(e.clientX, e.clientY);
  if (h && (h.k === 'pot' || h.k === 'slider')) { RAD.an[h.id] = 0; radTipCtl(h.id); return true; }
  return !!h;
}

/* ================= ПАНЕЛЬ ================= */
let radUIDirty = true;
function radDirtyUI() { radUIDirty = true; }
function radSwBtn(id) {
  const d = SWITCHES[id];
  return `<button type="button" class="swb" data-rsw="${id}"><b>${id}</b><span class="pips n${d.n}">${d.n === 3 ? '<i></i><i></i><i></i>' : '<i></i><i></i>'}</span><small data-rsr="${id}"></small></button>`;
}
function radUIInit() {
  const el = $('radPanel'); if (!el) return;
  $('radSw').innerHTML = SW_ORDER.map(radSwBtn).join('');
  $('radAn').innerHTML = ['S1', 'S2', 'LS', 'RS'].map(id => `<label class="slider" for="ra${id}"><span>${id}</span><input type="range" id="ra${id}" data-ran="${id}" min="-100" max="100" step="1" value="0"><output id="ra${id}Out" for="ra${id}">0</output></label>`).join('')
    + `<div class="lab-row"><span class="lab-k">6POS</span><div class="seg sm" id="raSix" role="group" aria-label="Шість кнопок">${[1, 2, 3, 4, 5, 6].map(i => `<button type="button" data-rsix="${i - 1}">${i}</button>`).join('')}</div></div>`;
  const srcOpts = SRC_LIST.map(s => `<option value="${s}">${s === '—' ? '— немає' : s}</option>`).join('');
  $('radMix').innerHTML = Array.from({ length: 12 }, (_, i) => {
    const c = i + 1, fix = CH_FIX[c];
    return `<div class="mx-r" data-ch="${c}"><span class="mx-n"><b>CH${c}</b><small>${c <= 4 ? fix[0] : 'AUX' + (c - 4)}</small></span>`
      + (fix ? `<span class="mx-src">${fix[1]}</span>` : `<label class="vh" for="rmx${c}">Джерело CH${c}</label><select id="rmx${c}" data-rmix="${c}">${srcOpts}</select>`)
      + `<label class="mx-inv"><input type="checkbox" data-rinv="${c}"><span>реверс</span></label><span class="mx-bar"><i></i></span><output data-rout="${c}">1500</output></div>`;
  }).join('');
  const auxOpts = ['<option value="0">—</option>'].concat(Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}">AUX${i + 1} · CH${i + 5}</option>`)).join('');
  const rngOpts = RANGES.map((r, i) => `<option value="${i}">${r[0]}–${r[1]}</option>`).join('');
  $('radModes').innerHTML = MODE_DEF.map(m => `<div class="md-r" data-rmd="${m.id}"><span class="md-n"><b>${m.name}</b><small>${m.d}</small></span>`
    + `<label class="vh" for="rma${m.id}">Канал для ${m.name}</label><select id="rma${m.id}" data-raux="${m.id}">${auxOpts}</select>`
    + `<label class="vh" for="rmr${m.id}">Діапазон для ${m.name}</label><select id="rmr${m.id}" data-rrng="${m.id}">${rngOpts}</select>`
    + `<span class="md-bar"><i class="rg"></i><b class="mk"></b></span></div>`).join('');
  $('radScen').innerHTML = RAD_SCEN.map(s => `<button type="button" data-rscen="${s.id}">${s.name}</button>`).join('');
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.rsw) { if (!SWITCHES[d.rsw].mom) swCycle(d.rsw, e.shiftKey); }
    else if (d.rsix) { RAD.six = +d.rsix; radTipCtl('6P'); }
    else if (d.rscen) radScenario(d.rscen);
    else if (d.rfs) RAD.fsProc = d.rfs;
    else if (d.rmap) RAD.map = d.rmap;
    else if (d.ract) radAction(d.ract);
    radDirtyUI(); radReadout();
  });
  el.addEventListener('pointerdown', e => { const b = e.target.closest('[data-rsw]'); if (b && SWITCHES[b.dataset.rsw].mom) { swSet(b.dataset.rsw, 2); b.setPointerCapture(e.pointerId); } });
  const momUp = e => { const b = e.target.closest('[data-rsw]'); if (b && SWITCHES[b.dataset.rsw].mom) swSet(b.dataset.rsw, 0); };
  el.addEventListener('pointerup', momUp); el.addEventListener('pointercancel', momUp);
  el.addEventListener('input', e => { const t = e.target; if (t.dataset.ran) { RAD.an[t.dataset.ran] = +t.value / 100; radTipCtl(t.dataset.ran); } });
  el.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (d.rmix) RAD.mix[+d.rmix].src = t.value;
    else if (d.rinv) RAD.mix[+d.rinv].inv = t.checked;
    else if (d.raux) RAD.modes.find(m => m.id === d.raux).aux = +t.value;
    else if (d.rrng) RAD.modes.find(m => m.id === d.rrng).r = +t.value;
    else return;
    RAD.scen = null; radDirtyUI(); radReadout();
  });
  radPads();
  document.querySelectorAll('[data-rview]').forEach(b => b.addEventListener('click', () => radFrame(b.dataset.rview)));
  const KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  const typing = t => t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName));
  document.addEventListener('keydown', e => {
    if (S.mode !== 'radio' || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (KEYS.includes(e.code)) { RAD.keys[e.code] = true; e.preventDefault(); return; }
    if (e.repeat) return;
    if (e.code === 'Space') { swCycle('SF'); e.preventDefault(); }
    else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') swSet('SB', +e.code.slice(5) - 1);
    else if (e.code === 'KeyE') swCycle('SE');
    else if (e.code === 'KeyH') swSet('SH', 2);
    else return;
    radDirtyUI();
  });
  document.addEventListener('keyup', e => { if (KEYS.includes(e.code)) RAD.keys[e.code] = false; if (e.code === 'KeyH' && S.mode === 'radio') swSet('SH', 0); });
  window.addEventListener('blur', () => { RAD.keys = {}; });
  radReadout();
  if (!ok3d) setInterval(() => { if (S.mode === 'radio') { radStep(0.05); radReadout(); } }, 50);
}
function radPads() {
  document.querySelectorAll('.pad[data-pad]').forEach(pad => {
    const id = pad.dataset.pad;
    const set = e => {
      const r = pad.getBoundingClientRect(), u = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1), v = clamp(1 - ((e.clientY - r.top) / r.height) * 2, -1, 1);
      if (id === 'L') { RAD.st.lx = u; RAD.st.ly = v; } else { RAD.st.rx = u; RAD.st.ry = v; }
    };
    pad.addEventListener('pointerdown', e => { pad.setPointerCapture(e.pointerId); RAD.hold[id] = 1; pad.classList.add('on'); set(e); e.preventDefault(); });
    pad.addEventListener('pointermove', e => { if (RAD.hold[id] && pad.hasPointerCapture(e.pointerId)) set(e); });
    const up = () => { RAD.hold[id] = 0; pad.classList.remove('on'); };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
  });
}
function radAction(a) {
  if (a === 'link') { RAD.link = !RAD.link; RAD.earlyT = 0; }
  else if (a === 'power') radPower(!RAD.power);
  else if (a === 'flip') {
    if (DRS.p) { radCrash(true); if (FCS.armed) radDisarm('Дрон перекинуто: Betaflight дизармить за перемикачем'); FCS.msg = 'Дрон лежить догори дриґом. Turtle: SE ↓ → ARM → відхиліть правий стік'; }
  } else if (a === 'reset') { radResetAll(false); }
  else if (a === 'sound') { RAD.sound = !RAD.sound; radAudio(RAD.sound); }
  else if (a === 'trim0') { for (const k in RAD.trim) RAD.trim[k] = 0; }
}
function radResetAll(full) {
  FCS.armed = false; FCS.turtle = false; FCS.fs = 0; FCS.lostT = 0; FCS.latch = false; FCS.badrx = false; FCS.landing = false;
  /* скидання = зв’язок є, ARM вимкнено: інакше ARM, увімкнений до першого кроку симуляції, дав би хибний BADRX */
  FCS.hadRx = true; FCS.prevArm = false;
  FCS.timer = 0; FCS.used = 0; FCS.msg = ''; FCS.last = null;
  RAD.link = true; RAD.earlyT = 0; RAD.warn = null; RAD.power = true; RAD.demo = null; RAD.demoT = 0;
  SW_ORDER.forEach(k => { RAD.sw[k] = 0; RAD.swDir[k] = 1; });
  RAD.st.ly = -1; RAD.st.lx = RAD.st.rx = RAD.st.ry = 0;
  if (full) { radDefaults(); RAD.an.S1 = RAD.an.S2 = RAD.an.LS = RAD.an.RS = 0; RAD.six = 0; }
  radResetDrone(); radDirtyUI();
}
function radScenario(id) {
  const s = RAD_SCEN.find(q => q.id === id); if (!s) return;
  radResetAll(true); RAD.scen = id;
  if (id === 'trim') { RAD.trim.T3 = 20; radHighlight('T3'); }
  else if (id === 'map') RAD.map = 'TAER';
  else if (id === 'rev') { RAD.mix[2].inv = true; radHighlight('R'); }
  else if (id === 'arm3') { RAD.mix[5].src = 'SC'; RAD.mix[10].src = 'SF'; radHighlight('SC'); }
  else if (id === 'early') { RAD.link = false; RAD.sw.SF = 2; RAD.earlyT = 1.6; radHighlight('SF'); }
  else if (id === 'fs') { RAD.sw.SF = 2; RAD.demo = 'fs'; RAD.demoT = 0; if (ok3d && RAD.view !== 'pilot') radFrame('pilot'); }
  else radHighlight('SF');
  radDirtyUI(); radReadout();
}
function radHighlight(id, sec = 4) { RAD.hl = id; RAD.hlT = sec; }
function radReadout() {
  const el = $('radPanel'); if (!el || el.hidden) return;
  const v = radVerdict(), map = BF_MAPS[RAD.map], ch = FCS.ch;
  const stat = $('radStat'); stat.className = 'rad-stat ' + v.cls;
  let why = '';
  if (!RAD.power) why = 'Пульт вимкнено: приймач не отримує пакетів, польотник бачить RXLOSS.';
  else if (RAD.warn) why = RAD.warn === 'thr' ? 'EdgeTX не вмикає радіомодуль, доки газ не на мінімумі.' : 'EdgeTX попереджає про перемикачі: поверніть їх угору (↑) або натисніть RTN.';
  else if (FCS.fs) why = FCS.fs === 1 ? `Сигнал зник ${fmt(FCS.lostT, 1)} с тому. Стадія 1: стіки по центру, газ на мінімумі. Повернеться зв’язок — політ триває.` : `Стадія 2: процедура ${RAD.fsProc === 'drop' ? 'Drop — мотори вимкнено, дрон падає' : 'Land — вирівнюється й знижується, після посадки вимикає мотори'}.`;
  else if (!FCS.armed && FCS.act.arm && FCS.flags.length) why = FCS.flags.map(f => `<b>${f}</b> — ${FLAG_TXT[f]}`).join('<br>');
  else if (FCS.msg && (FCS.crashed || DRS.inv || FCS.turtle || /Failsafe|Turtle|перекинуто|ногах/.test(FCS.msg))) why = FCS.msg;
  else if (!FCS.armed) {
    const am = RAD.modes.find(m => m.id === 'arm'), src = am && am.aux ? RAD.mix[am.aux + 4] : null;
    why = am && am.aux ? `Щоб армувати: газ униз, потім ${src && src.src !== '—' ? `<b>${src.src}</b>` : 'перемикач'} на CH${am.aux + 4} у діапазон ${rngTxt(am.r)} мкс.` : 'ARM не призначено на жоден AUX — дрон не армиться.';
  } else why = `Газ ${Math.round(FCS.rc.thr * 100)} % · висота ${fmt(DRS.p ? DRS.p.y : 0, 1)} м · ${FCS.mode === 'angle' ? 'стік задає кут нахилу' : FCS.mode === 'horizon' ? 'біля центру — вирівнювання, на краю — обертання' : 'стік задає швидкість обертання, кут не тримається'}.`;
  setHTML(stat, `<b>${v.t}</b><em>${v.m}</em><p>${why}</p>`);
  /* HUD на сцені */
  const hud = $('radHud');
  if (hud && !hud.hidden) {
    hud.className = 'rad-hud ' + v.cls;
    setText($('rhS'), v.t); setText($('rhM'), v.m);
    setText($('rhT'), `${Math.round(clamp((RAD.tx[2] - 988) / 1024, 0, 1) * 100)} %`);
    setText($('rhA'), `${fmt(DRS.p ? DRS.p.y : 0, 1)} м`);
    setText($('rhL'), `${radLinkOk() ? 100 : 0} %`);
    setText($('rhF'), radFM());
  }
  /* тумблери */
  for (const id of SW_ORDER) {
    const b = el.querySelector(`[data-rsw="${id}"]`); if (!b) continue;
    const pos = RAD.sw[id], n = SWITCHES[id].n;
    b.querySelectorAll('.pips i').forEach((i, k) => i.classList.toggle('on', n === 3 ? k === pos : k === (pos ? 1 : 0)));
    b.setAttribute('aria-pressed', String(pos !== 0));
    b.setAttribute('aria-label', `${id}: положення ${swPosTxt(id)}`);
  }
  if (radUIDirty) {
    for (const id of SW_ORDER) { const r = radRoute(id), s = el.querySelector(`[data-rsr="${id}"]`); if (s) setText(s, r.length ? r.map(x => x.md.length ? x.md[0] : `CH${x.c}`).join(' · ') : '—'); }
    for (let c = 5; c <= 12; c++) { const s = el.querySelector(`[data-rmix="${c}"]`); if (s && s.value !== RAD.mix[c].src) s.value = RAD.mix[c].src; }
    for (let c = 1; c <= 12; c++) { const s = el.querySelector(`[data-rinv="${c}"]`); if (s) s.checked = !!RAD.mix[c].inv; }
    for (const m of RAD.modes) { const a = el.querySelector(`[data-raux="${m.id}"]`), r = el.querySelector(`[data-rrng="${m.id}"]`); if (a) a.value = String(m.aux); if (r) r.value = String(m.r); }
    pressSeg($('radScen'), 'rscen', RAD.scen || '');
    const sc = RAD_SCEN.find(q => q.id === RAD.scen), note = $('radScenNote'); note.hidden = !sc; if (sc) setText(note, sc.note);
    pressSeg($('radFs'), 'rfs', RAD.fsProc); pressSeg($('radMap'), 'rmap', RAD.map);
    $('radLinkBtn').setAttribute('aria-pressed', String(!RAD.link)); setText($('radLinkBtn'), RAD.link ? 'Обірвати зв’язок' : 'Відновити зв’язок');
    $('radPwrBtn').setAttribute('aria-pressed', String(!RAD.power)); setText($('radPwrBtn'), RAD.power ? 'Вимкнути пульт' : 'Увімкнути пульт');
    $('radSndBtn').setAttribute('aria-pressed', String(RAD.sound));
    radUIDirty = false;
  }
  pressSeg($('raSix'), 'rsix', RAD.six);
  for (const id of ['S1', 'S2', 'LS', 'RS']) {
    const inp = $('ra' + id), val = Math.round(RAD.an[id] * 100);
    if (inp && document.activeElement !== inp && +inp.value !== val) inp.value = val;
    setText($('ra' + id + 'Out'), String(val));
  }
  /* пади стіків */
  const knob = (id, u, v) => {
    const k = el.querySelector(`.pad[data-pad="${id}"] i`); if (!k) return;
    const t = `left:calc(15px + (100% - 30px) * ${((u + 1) / 2).toFixed(3)});top:calc(15px + (100% - 30px) * ${((1 - v) / 2).toFixed(3)})`;
    if (k.dataset.t !== t) { k.style.cssText = t; k.dataset.t = t; }
  };
  knob('L', RAD.st.lx, RAD.st.ly); knob('R', RAD.st.rx, RAD.st.ry);
  setText($('padLv'), `газ ${Math.round((RAD.st.ly + 1) * 50)} % · рискання ${Math.round(RAD.st.lx * 100)}`);
  setText($('padRv'), `тангаж ${Math.round(RAD.st.ry * 100)} · крен ${Math.round(RAD.st.rx * 100)}`);
  /* канали: що видає пульт і що отримує польотник */
  const bfName = i => (i === map.roll ? 'Roll' : i === map.pitch ? 'Pitch' : i === map.yaw ? 'Yaw' : i === map.thr ? 'Throttle' : null);
  for (let c = 1; c <= 12; c++) {
    const row = el.querySelector(`.mx-r[data-ch="${c}"]`); if (!row) continue;
    const tx = RAD.tx[c - 1], fc = ch[c - 1], bar = row.querySelector('.mx-bar i');
    const o = (tx - 1500) / 512 * 50, st = `left:${(50 + Math.min(0, o)).toFixed(1)}%;width:${Math.max(0.6, Math.abs(o)).toFixed(1)}%`;
    if (bar.dataset.s !== st) { bar.style.cssText = st; bar.dataset.s = st; }
    const out = row.querySelector('output'), lbl = c === 5 && radLinkOk() && fc !== tx ? `${tx} → ${fc}` : String(tx);
    setText(out, lbl);
    const small = row.querySelector('.mx-n small'), nm = c <= 4 ? `${CH_FIX[c][0]} → ${bfName(c - 1) || '?'}` : `AUX${c - 4}`;
    setText(small, nm);
    row.classList.toggle('mism', c <= 4 && bfName(c - 1) !== { 1: 'Roll', 2: 'Pitch', 3: 'Throttle', 4: 'Yaw' }[c]);
  }
  /* режими */
  for (const m of RAD.modes) {
    const row = el.querySelector(`[data-rmd="${m.id}"]`); if (!row) continue;
    const r = RANGES[m.r], rg = row.querySelector('.rg'), mk = row.querySelector('.mk');
    const pc = vv => clamp((vv - 900) / 1200 * 100, 0, 100);
    const st = `left:${pc(r[0]).toFixed(1)}%;width:${(pc(r[1]) - pc(r[0])).toFixed(1)}%`;
    if (rg.dataset.s !== st) { rg.style.cssText = st; rg.dataset.s = st; }
    const val = m.aux ? ch[m.aux + 3] : null;
    mk.style.display = val == null ? 'none' : '';
    if (val != null) { const l = `${pc(val).toFixed(1)}%`; if (mk.style.left !== l) mk.style.left = l; }
    row.classList.toggle('on', !!FCS.act[m.id]);
  }
  setText($('radTrims'), `T1 ${RAD.trim.T1} · T2 ${RAD.trim.T2} · T3 ${RAD.trim.T3} · T4 ${RAD.trim.T4} · T5 ${RAD.trim.T5} · T6 ${RAD.trim.T6}`);
}
