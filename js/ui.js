/* Курс по БПЛА · перемикачі режимів і платформ, специфікація, конфігуратор, бічна панель, події.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= UI: MODES, PLATFORMS, BOM, DEMOS, CONFIGURATOR, DRAWER ================= */
const $ = id => document.getElementById(id);
const bomEl = $('bom'), slotsEl = $('slots'), statsEl = $('stats'), warnsEl = $('warns'), profEl = $('profile');
const drawerEl = $('drawer'), drBody = $('drBody'), scrimEl = $('scrim');
let lastCalc = null, deltaTimer = null;
const fmtG = w => (w ? `${fmt(w, w % 1 ? 1 : 0)} г` : '—');
const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const setHTML = (el, h) => { if (el && el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } };

const LEDE = {
  build: 'Наведіть або торкніться деталі — з’явиться підказка; подвійний клік відкриває повний опис з видами компонента. Праворуч — специфікація, анімації та конфігуратор: міняйте вузли й дивіться, як змінюються маса, тяга й час польоту.',
  signals: 'Оберіть ланцюжок — і сигнал пройде дроном крок за кроком: звідки, куди й яким протоколом. Схема перебудовується під вибрані компоненти й платформу.',
  antennas: 'Стенд «виносна станція ↔ дрон»: оберіть антени, поляризацію, відстань і положення дрона — і подивіться, чому зв’язок є або зникає.'
};
const HINT = {
  build: ['Наведіть — підказка · клік — фокус · подвійний клік — опис · тягніть — обертати', 'Тап — фокус · двічі — опис · тягніть — обертати'],
  signals: ['Тягніть — обертати · колесо або щипок — масштаб · кроки ланцюжка — праворуч', 'Тягніть — обертати · кроки ланцюжка — нижче'],
  antennas: ['Оболонка — діаграма спрямованості · кільця — хвилі · стрілки — вектор поля E', 'Оболонка — діаграма · кільця — хвилі · стрілки — поле E']
};
const GL_LABEL = {
  build: '3D-модель дрона. Тягніть, щоб обертати; колесо миші або щипок — масштаб.',
  signals: '3D-схема проходження сигналів у дроні.',
  antennas: '3D-стенд: виносна станція, дрон, діаграми спрямованості антен і хвилі між ними.'
};

function specsFor(id) {
  const r = lastCalc || calc(), o = id === 'cam' ? camOpt() : opt(id), N = plat().motors;
  switch (id) {
    case 'frame': return [['Геометрія', o.name], ['Колісна база', L.wb ? `${L.wb} мм` : o.sub], ['Маса', fmtG(o.g)]];
    case 'motors': return [['Мотор', o.name], ['Без навантаження', `≈${fmt(Math.round(r.rpmMax / 100) * 100)} об/хв`], ['Маса', `${N} × ${fmtG(o.g)}`]];
    case 'props': return [['Пропелер', o.name], ['Тяга на мотор', `≈${fmt(r.thrust < 100 ? Math.round(r.thrust) : round5(r.thrust))} г`], ['Маса', `${N} × ${fmtG(o.g)}`]];
    case 'esc': return [['ESC', o.name], ['Пік на мотор', `≈${fmtA(r.iMotor)} А`], ['Маса', o.g ? fmtG(o.g) : 'у платі']];
    case 'fc': return [['MCU', o.sub], ['Стан', FC.mode === 'run' ? 'прошивка працює' : 'DFU / прошивка'], ['Маса', fmtG(o.g)]];
    case 'rx': return [['Приймач', o.name], ['Антена', o.sub], ['Маса', o.g ? fmtG(o.g) : 'у платі']];
    case 'vtx': return [['VTX', o.name], ['Тип', o.kind === 'analog' ? 'аналоговий' : 'цифровий'], ['Маса', o.g ? fmtG(o.g) : 'у платі']];
    case 'vtxant': return [['Антена', o.name], ['Поляризація', o.pol], ['Кількість', String(opt('vtx').dual ? 2 : 1)]];
    case 'cam': return [['Камера', o.name], ['Тип', o.thermal ? 'тепловізор LWIR' : o.digital ? 'цифрова HD' : 'аналогова'], ['Маса', fmtG(o.digital ? opt('vtx').camG : o.g)]];
    case 'battery': return [['Батарея', o.name], ['Напруга', `${fmt(r.vNom, 1)} В номінал`], ['Маса', fmtG(o.g)]];
    case 'power': return [['Варіант', o.name], ['Маса', fmtG(o.g)]];
    case 'gps': return [['Модуль', o.name], ['Маса', fmtG(o.g)]];
  }
  return [];
}

/* ---------- platforms ---------- */
function renderPlatTabs() {
  $('platTabs').innerHTML = PLAT_ORDER.map(id => {
    const p = PLATFORMS[id];
    return `<button type="button" data-plat="${id}" aria-pressed="${cfg.platform === id}" title="${p.name} · ${p.sub}">${p.short}</button>`;
  }).join('');
  setText($('platName'), `${plat().name} · ${plat().sub}`);
}
function choosePlatform(id) {
  if (id === cfg.platform || !PLATFORMS[id]) return;
  applyPlatform(id);
  refreshAll(false);
  renderPlatTabs();
}

/* ---------- BOM ---------- */
function renderBOM() {
  const r = lastCalc || calc();
  setText($('bomEyebrow'), `${plat().short} · маса`);
  bomEl.innerHTML = ORDER.map(id => {
    const o = id === 'cam' ? camOpt() : opt(id);
    const g = r.parts[id] ? fmtG(r.parts[id]) : (plat().micro && ['esc', 'rx', 'vtx'].includes(id) ? 'у платі' : '—');
    return `<li data-id="${id}"><button class="bom-row" type="button" data-id="${id}"><span class="badge">${numN(id)}</span>` +
      `<span class="bom-nm">${COMP[id].name}<small>${o.name}</small></span><span class="bom-g">${g}</span></button>` +
      `<button class="bom-i" type="button" data-open="${id}" aria-label="Повний опис: ${COMP[id].name}">i</button></li>`;
  }).join('') + `<li class="misc">Дроти, ремінці, гвинти, стяжки · ${fmtG(plat().misc)}</li>` +
    `<li class="total"><span>Злітна маса</span><span>${fmt(r.auw, r.auw < 100 ? 1 : 0)} г</span></li>`;
  markBOM();
}
function markBOM() {
  bomEl.querySelectorAll('li[data-id]').forEach(li => {
    li.classList.toggle('hot', li.dataset.id === S.hover);
    li.classList.toggle('sel', li.dataset.id === S.sel);
  });
}
function onHoverUI() { markBOM(); }
function onSelectUI() { markBOM(); }

/* ---------- configurator ---------- */
const LINK = ['', 'ближня', 'середня', 'далека', 'далека, стабільна', 'максимальна'];
const seg5 = n => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
function renderStats(r, prev) {
  const d = (k, digits, unit) => {
    if (!prev) return '';
    const dv = r[k] - prev[k];
    if (Math.abs(dv) < (digits ? 0.05 : 0.5)) return '';
    return `${dv > 0 ? '+' : '−'}${fmt(Math.abs(dv), digits)}${unit}`;
  };
  const tile = (k, v, dl) => `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="d${dl && dl[0] === '+' ? ' up' : ''}">${dl || ''}</div></div>`;
  const small = r.auw < 100;
  statsEl.innerHTML =
    tile('Злітна маса', `${fmt(r.auw, small ? 1 : 0)}<small>г</small>`, d('auw', small ? 1 : 0, ' г')) +
    tile('Тяга / вага', `${fmt(r.tw, 1)}<small>: 1</small>`, d('tw', 1, '')) +
    tile('Макс. оберти', `${fmt(Math.round(r.rpmMax / 100) * 100)}<small>об/хв</small>`, d('rpmMax', 0, '')) +
    tile('Піковий струм', `${fmtA(r.iTotal)}<small>А</small>`, d('iTotal', r.iTotal < 20 ? 1 : 0, ' А')) +
    tile('Висіння', `${fmt(r.tHover, 1)}<small>хв</small>`, d('tHover', 1, ' хв')) +
    tile('Активний політ', `${fmt(r.tAgg, 1)}<small>хв</small>`, d('tAgg', 1, ' хв')) +
    `<div class="tile"><div class="k">Дальність керування</div><div class="meter">${seg5(r.link)}</div><div class="d">${LINK[r.link]}</div></div>` +
    `<div class="tile"><div class="k">Відео</div><div class="mrow"><span>мала затримка</span><div class="meter">${seg5(r.lat)}</div></div><div class="mrow"><span>якість</span><div class="meter">${seg5(r.img)}</div></div></div>`;
  clearTimeout(deltaTimer);
  if (prev) deltaTimer = setTimeout(() => statsEl.querySelectorAll('.d').forEach(el => { if (/^[+−]/.test(el.textContent)) { el.textContent = ''; el.classList.remove('up'); } }), 4500);
}
function renderWarns(r) {
  const lab = { bad: 'Критично', warn: 'Увага', info: 'Примітка', ok: 'Сумісно' };
  const list = r.warns.slice();
  if (!list.some(w => w[0] !== 'info')) list.unshift(['ok', 'Критичних конфліктів між компонентами немає.']);
  warnsEl.innerHTML = list.map(([s, t]) => `<li class="${s}"><span class="sev ${s}">${lab[s]}</span><span>${t}</span></li>`).join('');
}
function renderProfile(r) { profEl.innerHTML = r.prof.map(p => `<span class="chip">${p}</span>`).join(''); }
function optList(id, name) {
  const digital = opt('vtx').kind === 'digital', current = id === 'cam' ? camOpt().id : cfg[id], N = plat().motors;
  return optsFor(id).map(o => {
    const dis = id === 'cam' && (digital ? !o.digital : !!o.digital);
    const gw = id === 'cam' && o.digital ? (opt('vtx').camG || 0) : o.g;
    const wt = id === 'motors' || id === 'props' ? `${fmtG(gw)} × ${N}` : gw ? fmtG(gw) : 'у платі';
    return `<label class="opt"><input type="radio" name="${name}" id="${name}-${o.id}" value="${o.id}"${current === o.id ? ' checked' : ''}${dis ? ' disabled' : ''}>` +
      `<span class="opt-b"><b>${o.name}</b><small>${o.sub} · ${wt}</small></span></label>`;
  }).join('');
}
function renderSlots() {
  const fid = document.activeElement && document.activeElement.id;
  const digital = opt('vtx').kind === 'digital', micro = !!plat().micro;
  slotsEl.innerHTML = ORDER.map(id => {
    const extra = id === 'cam' ? `<label class="slider" for="tilt"><span>Нахил</span><input type="range" id="tilt" min="0" max="50" step="1" value="${cfg.tilt}"><output id="tiltOut" for="tilt">${cfg.tilt}°</output></label>` : '';
    let why = '';
    if (id === 'cam' && digital) why = '<p class="why">Цифрова система працює лише зі своєю камерою — аналогові й тепловізійні варіанти недоступні.</p>';
    if (micro && ['esc', 'fc', 'rx', 'vtx'].includes(id)) why = '<p class="why">На whoop це одна AIO-плата: польотник, ESC, приймач і VTX разом.</p>';
    return `<fieldset class="slot" id="slot-${id}"><legend><span class="badge">${numN(id)}</span>${COMP[id].name}</legend><div class="opts">${optList(id, 's-' + id)}</div>${extra}${why}</fieldset>`;
  }).join('');
  if (fid) { const el = document.getElementById(fid); if (el) el.focus({ preventScroll: true }); }
}
function refreshAll(withDelta) {
  const r = calc(), prev = lastCalc; lastCalc = r;
  renderStats(r, withDelta ? prev : null); renderWarns(r); renderProfile(r);
  renderBOM(); renderSlots();
  if (S.drawerOpen) renderDrawer(S.drawerId, true);
  S.ver = (S.ver || 0) + 1;
  if (S.peekId) showPeek(S.peekId);
  updateDemoUI();
}
function setOpt(slot, val) {
  cfg[slot] = val;
  if (slot === 'vtx' && opt('vtx').kind === 'analog' && opt('cam').digital) {
    const def = DEFAULTS[cfg.platform].cam; cfg.cam = def === 'hdcam' ? 'micro' : def;
  }
  rebuild(DEPENDS[slot]);
  if (slot === 'rx' && S.demo === 'rx') RX.t = 0;
  refreshAll(true);
}
function setTilt(v) {
  cfg.tilt = v;
  if (ok3d && comps.cam.parts.pivot) comps.cam.parts.pivot.rotation.x = v * Math.PI / 180;
  setText($('tiltOut'), `${v}°`);
  S.ver = (S.ver || 0) + 1;
  if (S.peekId === 'cam') showPeek('cam');
}

/* ---------- demo panel state ---------- */
const MOT_NOTES = {
  quad: {
    idle: 'Вигляд згори, ніс від пілота. <b>Props In</b> — стандарт Betaflight: M1 і M4 крутяться за годинниковою, M2 і M3 — проти.',
    in: '<b>Props In</b>: M1 (задній правий) і M4 (передній лівий) — за годинниковою, M2 і M3 — проти. Передні лопаті рухаються до центру рами. Діагональні пари крутяться в один бік, тому реактивні моменти компенсуються.',
    out: '<b>Props Out</b> — реверс: усі напрями навпаки, передні лопаті рухаються назовні й менше закидають бруд на лінзу. У Betaflight вмикається опцією «Motor direction is reversed», а самі мотори перевертають DShot-командою або в ESC.',
    test: 'Тест як у вкладці Motors у Betaflight: по черзі крутиться кожен мотор, а ви звіряєте номер і напрям зі схемою. Перевіряють тільки без пропелерів, тому вони тут напівпрозорі.'
  },
  hex: {
    idle: 'Вигляд згори, ніс угорі. <b>Hex X</b> у Betaflight: M1, M2, M6 крутяться проти годинникової (CCW), M3, M4, M5 — за годинниковою (CW). Сусідні мотори завжди крутяться в протилежні боки.',
    in: '<b>Стандартний напрям Hex X</b>: M1, M2, M6 — CCW, M3, M4, M5 — CW. По три мотори в кожен бік, тому реактивні моменти компенсуються, а рискання керується різницею обертів двох груп.',
    out: '<b>Реверс</b>: усі шість напрямів навпаки. У Betaflight — опція «Motor direction is reversed»; самі мотори перевертають DShot-командою або в налаштуваннях ESC.',
    test: 'Тест як у вкладці Motors у Betaflight: по черзі M1…M6. Звірте номер і напрям зі схемою — на гексі легко переплутати M5 і M6. Перевіряють тільки без пропелерів.'
  }
};
const FC_NOTES = {
  run: 'Статусний світлодіод блимає: прошивка запущена, гіроскоп опитується тисячі разів на секунду.',
  flashed: 'Прошивку записано, плата перезавантажилась і знову блимає статусом. USB лишився підключеним — можна налаштовувати в Configurator.',
  dfu0: 'Кнопку BOOT затискають і, не відпускаючи, підключають USB.',
  dfu: 'MCU стартував із вбудованого завантажувача STM32 замість прошивки: статусний LED згас, комп’ютер бачить пристрій «STM32 BOOTLOADER». Без кнопки той самий режим вмикає команда <code>bl</code> у CLI або сам Configurator перед прошиванням.',
  flash: 'Configurator стирає флеш і записує новий файл прошивки по USB, потім перевіряє запис. Не від’єднуйте кабель до кінця.'
};
const RX_NOTES = {
  nolink: 'Повільне блимання (0,5 с) — приймач увімкнений, але не чує пульта.',
  bind: 'Подвійне блимання — режим біндингу. Увімкнути: тричі швидко вимкнути й увімкнути живлення. На пульті: ELRS Lua → Bind. Якщо в прошивках однакова bind-фраза, цей крок не потрібен.',
  linked: 'Постійне світло — зв’язок є. Пульт шле пакети керування, приймач повертає телеметрію: RSSI, LQ, напругу батареї.',
  wifi: 'Швидке блимання — Wi-Fi. Точка доступу «ExpressLRS RX», пароль expresslrs, сторінка 10.0.0.1: оновлення прошивки й налаштування без паяльника. Вмикається сама, якщо приймач довго не бачить пульта (типово 60 с).'
};
function updateDemoUI() {
  const kv = opt('motors').kv, vNom = (lastCalc || calc()).vNom, N = plat().motors, notes = MOT_NOTES[plat().mixer];
  document.querySelectorAll('[data-mot]').forEach(b => {
    const m = b.dataset.mot;
    b.setAttribute('aria-pressed', String((m === 'test' && MOT.mode === 'test') || (MOT.mode === 'spin' && m === MOT.dir)));
    if (m === 'test') setText(b, N > 4 ? 'Тест 1→6' : 'Тест 1→2→3→4');
  });
  const rpm = Math.round(kv * vNom * MOT.thr * 0.82 / 100) * 100;
  setText($('motRo'), MOT.mode === 'idle' ? 'зупинені' : MOT.mode === 'test' ? `M${MOT.ti + 1} · ${motorNames()[MOT.ti] || ''}` : `${MOT.dir === 'in' ? 'Props In' : 'Props Out'} · ≈${fmt(rpm)} об/хв`);
  setHTML($('motNote'), MOT.mode === 'idle' ? notes.idle : MOT.mode === 'test' ? notes.test : notes[MOT.dir]);
  const fcKey = FC.mode === 'run' ? (FC.flashed ? 'flashed' : 'run') : FC.mode === 'dfu' ? (FC.t < 1.3 ? 'dfu0' : 'dfu') : 'flash';
  document.querySelectorAll('[data-fc]').forEach(b => {
    const m = b.dataset.fc;
    b.setAttribute('aria-pressed', String(m === FC.mode));
    if (m === 'flash') b.disabled = !(FC.mode === 'dfu' && FC.t > 1.3) && FC.mode !== 'flash';
  });
  setText($('fcRo'), FC.mode === 'run' ? (FC.flashed ? 'прошито · працює' : 'прошивка працює') : FC.mode === 'dfu' ? (FC.t < 1.3 ? 'BOOT + USB…' : 'DFU · чекає') : `запис · ${Math.round(FC.prog * 100)} %`);
  setHTML($('fcNote'), FC_NOTES[fcKey]);
  const pr = $('fcProg'); const w = `${Math.round((FC.mode === 'flash' ? FC.prog : FC.flashed ? 1 : 0) * 100)}%`; if (pr.style.width !== w) pr.style.width = w;
  const tbs = cfg.rx === 'tbs';
  document.querySelectorAll('[data-rx]').forEach(b => {
    b.setAttribute('aria-pressed', String(b.dataset.rx === RX.mode));
    if (b.dataset.rx === 'wifi') b.disabled = tbs;
  });
  if (tbs && RX.mode === 'wifi') RX.mode = 'nolink';
  setText($('rxTitle'), tbs ? 'Приймач Crossfire' : 'Приймач ELRS');
  setText($('rxRo'), RX.mode === 'nolink' ? 'немає зв’язку' : RX.mode === 'bind' ? 'біндинг…' : RX.mode === 'linked' ? 'зв’язок · 250 Гц' : 'Wi-Fi · 10.0.0.1');
  setHTML($('rxNote'), RX_NOTES[RX.mode] + (tbs ? ' <b>Crossfire</b> має власну індикацію й оновлюється через пульт або TBS Agent; анімація показує логіку ExpressLRS.' : ''));
}

/* ---------- drawer ---------- */
const sec = (t, h) => `<section class="dr-sec"><h3>${t}</h3>${h}</section>`;
function animButtons(kind) {
  const N = plat().motors;
  if (kind === 'mot') return `<div class="seg"><button type="button" data-mot="in">Props In</button><button type="button" data-mot="out">Props Out</button><button type="button" data-mot="test">Тест 1→${N}</button><button type="button" data-mot="stop">Стоп</button></div>`;
  if (kind === 'fc') return '<div class="seg"><button type="button" data-fc="run">Робочий режим</button><button type="button" data-fc="dfu">Boot / DFU</button><button type="button" data-fc="flash">Прошити</button></div>';
  return '<div class="seg"><button type="button" data-rx="nolink">Немає зв’язку</button><button type="button" data-rx="bind">Біндинг</button><button type="button" data-rx="linked">Збінджено</button><button type="button" data-rx="wifi">Wi-Fi</button></div>';
}
function dirMapSVG() {
  const dirs = motorDirs(), hex = plat().mixer === 'hex';
  const pos = hex ? [[152, 190], [152, 66], [78, 190], [78, 66], [189, 128], [41, 128]] : [[170, 172], [170, 66], [60, 172], [60, 66]];
  const c0 = hex ? [115, 128] : [115, 119], r = hex ? 19 : 22, R = hex ? 28 : 34;
  const pt = (cx, cy, a) => [(cx + r * Math.cos(a * Math.PI / 180)).toFixed(1), (cy + r * Math.sin(a * Math.PI / 180)).toFixed(1)];
  let s = `<svg class="dirmap" viewBox="0 0 230 240" role="img" aria-label="Напрями обертання моторів, вигляд згори">` +
    '<defs><marker id="mkcw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--cw)"></path></marker>' +
    '<marker id="mkccw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--ccw)"></path></marker></defs>';
  pos.forEach(([x, y]) => { s += `<line x1="${c0[0]}" y1="${c0[1]}" x2="${x}" y2="${y}" style="stroke: var(--line-2); stroke-width: 7; stroke-linecap: round"></line>`; });
  s += `<rect x="${c0[0] - 19}" y="${c0[1] - 28}" width="38" height="56" rx="6" style="fill: var(--ink-2)"></rect>` +
    `<path d="M115 14 L124 28 L106 28 z" style="fill: var(--accent)"></path><text x="115" y="${hex ? 41 : 44}" text-anchor="middle" class="t-mut">ніс</text>`;
  pos.forEach(([cx, cy], i) => {
    const cw = dirs[i] < 0, [x0, y0] = pt(cx, cy, cw ? 200 : 340), [x1, y1] = pt(cx, cy, 90);
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" style="fill: var(--card); stroke: var(--line-2)"></circle>` +
      `<path d="M${x0} ${y0} A${r} ${r} 0 1 ${cw ? 1 : 0} ${x1} ${y1}" style="fill: none; stroke: var(--${cw ? 'cw' : 'ccw'}); stroke-width: 3" marker-end="url(#mk${cw ? 'cw' : 'ccw'})"></path>` +
      `<text x="${cx}" y="${hex ? cy - 1 : cy + 1}" text-anchor="middle">M${i + 1}</text><text x="${cx}" y="${hex ? cy + 9 : cy + 12}" text-anchor="middle" class="t-mut">${cw ? 'CW' : 'CCW'}</text>`;
  });
  return s + '</svg>';
}
function videoPathHTML() {
  const cur = opt('vtx').kind;
  const flow = (k, title) => `<div class="vflow${cur === k ? ' cur' : ''}"><h4>${title}${cur === k ? ' <span class="now">на дроні зараз</span>' : ''}</h4><ol>` +
    VIDEO_PATH[k].map(([n, t]) => `<li><b>${n}</b><span>${t}</span></li>`).join('') + '</ol></div>';
  return flow('analog', 'Аналоговий тракт') + flow('digital', 'Цифровий тракт') +
    '<div class="cmp" role="table" aria-label="Аналогова й цифрова відеосистема"><div class="cmp-r cmp-h" role="row"><span role="columnheader">Параметр</span><span role="columnheader">Аналог</span><span role="columnheader">Цифра</span></div>' +
    VIDEO_PATH.compare.map(([k, a, d]) => `<div class="cmp-r" role="row"><span role="rowheader">${k}</span><span role="cell">${a}</span><span role="cell">${d}</span></div>`).join('') + '</div>' +
    '<div class="seg"><button type="button" data-sig="video">Показати шлях відео в 3D</button></div>';
}
function renderDrawer(id, keepScroll) {
  const d = COMP[id], st = drBody.scrollTop, hex = plat().mixer === 'hex';
  setText($('drN'), String(numN(id))); setText($('drCat'), d.cat); setText($('drTitle'), d.name);
  let h = `<p class="dr-lead">${d.short}</p>`;
  h += sec('Що це', d.what.map(p => `<p>${p}</p>`).join(''));
  if (id === 'motors') h += sec('Напрям обертання', dirMapSVG() +
    `<p>${hex ? 'Нумерація Betaflight Hex X, вигляд згори, ніс угорі: M1 — задній правий, M2 — передній правий, M3 — задній лівий, M4 — передній лівий, M5 — правий, M6 — лівий.' : 'Нумерація Betaflight, вигляд згори, ніс угорі: M1 — задній правий, M2 — передній правий, M3 — задній лівий, M4 — передній лівий.'} Зараз: <b>${MOT.dir === 'in' ? (hex ? 'стандартний напрям' : 'Props In') : (hex ? 'реверс' : 'Props Out')}</b>.</p>` +
    '<p>Напрям змінюють програмно: DShot-командами з Betaflight Configurator або в налаштуваннях ESC. Фізично його міняє перестановка будь-яких двох із трьох дротів мотора.</p>');
  if (d.anim) h += sec('Анімація в 3D', animButtons(d.anim));
  if (d.video) h += sec('Шлях відеопотоку', videoPathHTML());
  if (d.lab) h += sec('Як поширюється сигнал', `<p>${d.lab === 'vtx' ? 'На антенному стенді видно діаграму спрямованості цієї антени, поляризацію хвилі й те, чи «стикується» вона з антеною на виносній станції.' : 'На антенному стенді видно, як сигнал ELRS іде від станції до антени приймача і що відбувається з ним при крені дрона.'}</p><div class="seg"><button type="button" data-lab="${d.lab}">Відкрити антенний стенд</button></div>`);
  h += sec('Види', `<div class="types">${d.types.map(([n, t]) => `<div class="type"><b>${n}</b><span>${t}</span></div>`).join('')}</div>`);
  h += sec('Ключові параметри', `<dl class="kv">${d.params.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`);
  h += sec('Встановлено зараз · замінити', `<div class="opts">${optList(id, 'd-' + id)}</div>`);
  h += `<p class="tip"><b>Порада.</b> ${d.tip}</p>`;
  drBody.innerHTML = h;
  drBody.scrollTop = keepScroll ? st : 0;
  updateDemoUI();
}
function openDrawer(id) {
  stopTour();
  if (S.mode === 'build' && (S.sel !== id || S.demo)) select(id);
  S.drawerOpen = true; S.drawerId = id;
  renderDrawer(id);
  drawerEl.classList.add('open'); drawerEl.setAttribute('aria-hidden', 'false');
  scrimEl.hidden = !narrowMQ.matches;
  setTimeout(() => $('drClose').focus({ preventScroll: true }), 60);
}
function closeDrawer() {
  if (!S.drawerOpen) return;
  S.drawerOpen = false; drawerEl.classList.remove('open'); drawerEl.setAttribute('aria-hidden', 'true'); scrimEl.hidden = true;
}

/* ---------- modes ---------- */
function onModeUI(m) {
  document.querySelectorAll('#modeTabs [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  ['build', 'demos', 'config', 'foot'].forEach(id => { $(id).hidden = m !== 'build'; });
  $('sigPanel').hidden = m !== 'signals';
  $('antPanel').hidden = m !== 'antennas';
  $('platRow').hidden = m === 'antennas';
  $('tTour').hidden = m !== 'build'; $('tExplode').hidden = m !== 'build';
  $('labHud').hidden = m !== 'antennas' || !ok3d;
  setText($('lede'), LEDE[m]);
  setHTML($('hint'), `<span class="t-lg">${HINT[m][0]}</span><span class="t-sm">${HINT[m][1]}</span>`);
  $('gl').setAttribute('aria-label', GL_LABEL[m]);
  $('stage').dataset.mode = m;
  if (m === 'signals' && !ok3d) sigRebuild(false);
  if (m === 'antennas') { labRenderControls(); if (!ok3d) { LAB.res = labSolve(); labReadout(LAB.res); } }
}
function goMode(m, fromHash) {
  if (!['build', 'signals', 'antennas'].includes(m)) return;
  if (S.mode === m) return;
  if (ok3d) setMode(m);
  else { S.mode = m; onModeUI(m); }
  if (!fromHash) { try { history.replaceState(null, '', '#' + m); } catch (e) { /* рамка може заборонити */ } }
}

/* ---------- events ---------- */
function bindUI() {
  bomEl.addEventListener('mouseover', e => { const li = e.target.closest('li[data-id]'); if (li) setHover(li.dataset.id); });
  bomEl.addEventListener('mouseleave', () => setHover(null));
  bomEl.addEventListener('click', e => {
    const i = e.target.closest('[data-open]'); if (i) { openDrawer(i.dataset.open); return; }
    const r = e.target.closest('.bom-row'); if (r) select(r.dataset.id);
  });
  bomEl.addEventListener('dblclick', e => { const r = e.target.closest('.bom-row'); if (r) openDrawer(r.dataset.id); });
  slotsEl.addEventListener('change', e => { const n = e.target.name || ''; if (n.startsWith('s-')) setOpt(n.slice(2), e.target.value); });
  slotsEl.addEventListener('input', e => { if (e.target.id === 'tilt') setTilt(+e.target.value); });
  drBody.addEventListener('change', e => { const n = e.target.name || ''; if (n.startsWith('d-')) setOpt(n.slice(2), e.target.value); });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-mot],[data-fc],[data-rx],[data-mode],[data-plat],[data-sig],[data-lab]'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.mode) { goMode(d.mode); return; }
    if (d.plat) { choosePlatform(d.plat); return; }
    if (d.sig) {
      closeDrawer();
      SIG.chain = d.sig; SIG.step = 0; SIG.playing = !reduceMotion && ok3d;
      if (S.mode !== 'signals') goMode('signals'); else sigRebuild(true);
      return;
    }
    if (d.lab) { labOpenFrom(d.lab); return; }
    if (d.mot) motorCmd(d.mot); else if (d.fc) fcCmd(d.fc); else rxCmd(d.rx);
    if (narrowMQ.matches && b.closest('#drawer')) closeDrawer();
  });
  $('thr').addEventListener('input', e => { MOT.thr = +e.target.value / 100; setText($('thrOut'), `${e.target.value} %`); updateDemoUI(); });
  $('pkMore').addEventListener('click', () => { if (S.peekId) openDrawer(S.peekId); });
  $('drClose').addEventListener('click', closeDrawer);
  scrimEl.addEventListener('click', closeDrawer);
  $('tExplode').addEventListener('click', () => ok3d && toggleExplode());
  $('tSpin').addEventListener('click', () => { if (!ok3d) return; ctl.auto = !ctl.auto; updateSpinBtn(); });
  $('tTour').addEventListener('click', () => { if (!ok3d) return; S.tour ? stopTour() : startTour(); });
  $('tourPrev').addEventListener('click', () => tourGo(S.tourI - 1));
  $('tourNext').addEventListener('click', () => tourGo(S.tourI + 1));
  $('tReset').addEventListener('click', () => {
    if (!ok3d) return;
    if (S.mode === 'signals') { sigRebuild(true); return; }
    if (S.mode === 'antennas') { labFrame(LAB.orbit ? 'orbit' : 'link'); return; }
    stopTour(); stopDemos(); if (S.explodeOn) toggleExplode(false);
    clearSel(); homeView(); ctl.auto = !reduceMotion; updateSpinBtn();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (S.drawerOpen) closeDrawer(); else if (S.tour) stopTour(); else if (S.sel) clearSel();
  });
  narrowMQ.addEventListener('change', () => { scrimEl.hidden = !(S.drawerOpen && narrowMQ.matches); });
}

function init() {
  const startMode = (location.hash || '').slice(1);
  lastCalc = calc();
  renderPlatTabs(); renderStats(lastCalc, null); renderWarns(lastCalc); renderProfile(lastCalc);
  renderBOM(); renderSlots(); updateDemoUI(); bindUI(); sigUIInit(); labUIInit();
  if (ok3d) {
    try { initScene(); }
    catch (err) {
      console.error(err); ok3d = false;
      $('fallback').hidden = false; $('hint').hidden = true;
    }
  }
  if (!ok3d) $('stage').classList.add('no3d');
  onModeUI(S.mode);
  if (startMode === 'signals' || startMode === 'antennas') goMode(startMode, true);
  window.addEventListener('hashchange', () => { const h = (location.hash || '').slice(1); goMode(h === 'signals' || h === 'antennas' ? h : 'build', true); });
}
init();
