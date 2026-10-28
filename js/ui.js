/* Анатомія FPV-дрона · інтерфейс: специфікація, конфігуратор, бічна панель опису, обробники подій.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * data.js → scene.js → interaction.js → ui.js */
'use strict';
/* ================= UI: BOM, DEMOS, CONFIGURATOR, DRAWER ================= */
const $ = id => document.getElementById(id);
const bomEl = $('bom'), slotsEl = $('slots'), statsEl = $('stats'), warnsEl = $('warns'), profEl = $('profile');
const drawerEl = $('drawer'), drBody = $('drBody'), scrimEl = $('scrim');
let lastCalc = null, deltaTimer = null;
const fmtG = w => (w ? `${fmt(w, w % 1 ? 1 : 0)} г` : '—');
const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
const setHTML = (el, h) => { if (el && el.dataset.h !== h) { el.innerHTML = h; el.dataset.h = h; } };

function specsFor(id) {
  const r = lastCalc || calc(), o = id === 'cam' ? camOpt() : opt(id);
  switch (id) {
    case 'frame': return [['Геометрія', o.name], ['Колісна база', `${L.wb || 225} мм`], ['Маса', fmtG(o.g)]];
    case 'motors': return [['Мотор', o.name], ['Без навантаження', `≈${fmt(Math.round(r.rpmMax / 100) * 100)} об/хв`], ['Маса', `4 × ${fmtG(o.g)}`]];
    case 'props': return [['Пропелер', o.name], ['Тяга на мотор', `≈${fmt(round5(r.thrust))} г`], ['Маса', `4 × ${fmtG(o.g)}`]];
    case 'esc': return [['ESC', o.name], ['Пік на мотор', `≈${fmt(r.iMotor)} А`], ['Маса', fmtG(o.g)]];
    case 'fc': return [['MCU', o.sub], ['Стан', FC.mode === 'run' ? 'прошивка працює' : 'DFU / прошивка'], ['Маса', fmtG(o.g)]];
    case 'rx': return [['Приймач', o.name], ['Антена', o.sub], ['Маса', fmtG(o.g)]];
    case 'vtx': return [['VTX', o.name], ['Тип', o.kind === 'analog' ? 'аналоговий' : 'цифровий'], ['Маса', fmtG(o.g)]];
    case 'vtxant': return [['Антена', o.name], ['Поляризація', o.pol], ['Кількість', String(opt('vtx').dual ? 2 : 1)]];
    case 'cam': return [['Камера', o.name], ['Кут нахилу', `${cfg.tilt}°`], ['Маса', fmtG(o.digital ? opt('vtx').camG : o.g)]];
    case 'battery': return [['Батарея', o.name], ['Напруга', `${fmt(r.vNom, 1)} В номінал`], ['Маса', fmtG(o.g)]];
    case 'power': return [['Варіант', o.name], ['Маса', fmtG(o.g)]];
    case 'gps': return [['Модуль', o.name], ['Маса', fmtG(o.g)]];
  }
  return [];
}

/* ---------- BOM ---------- */
function renderBOM() {
  const r = lastCalc || calc();
  bomEl.innerHTML = ORDER.map(id => {
    const o = id === 'cam' ? camOpt() : opt(id);
    return `<li data-id="${id}"><button class="bom-row" type="button" data-id="${id}"><span class="badge">${numN(id)}</span>` +
      `<span class="bom-nm">${COMP[id].name}<small>${o.name}</small></span><span class="bom-g">${fmtG(r.parts[id])}</span></button>` +
      `<button class="bom-i" type="button" data-open="${id}" aria-label="Повний опис: ${COMP[id].name}">i</button></li>`;
  }).join('') + `<li class="misc">Дроти, ремінець, гвинти, стяжки · ${MISC_G} г</li>` +
    `<li class="total"><span>Злітна маса</span><span>${fmt(r.auw)} г</span></li>`;
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
  statsEl.innerHTML =
    tile('Злітна маса', `${fmt(r.auw)}<small>г</small>`, d('auw', 0, ' г')) +
    tile('Тяга / вага', `${fmt(r.tw, 1)}<small>: 1</small>`, d('tw', 1, '')) +
    tile('Макс. оберти', `${fmt(Math.round(r.rpmMax / 100) * 100)}<small>об/хв</small>`, d('rpmMax', 0, '')) +
    tile('Піковий струм', `${fmt(round5(r.iTotal))}<small>А</small>`, d('iTotal', 0, ' А')) +
    tile('Висіння', `${fmt(r.tHover, 1)}<small>хв</small>`, d('tHover', 1, ' хв')) +
    tile('Агресивний політ', `${fmt(r.tAgg, 1)}<small>хв</small>`, d('tAgg', 1, ' хв')) +
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
  const digital = opt('vtx').kind === 'digital', current = id === 'cam' ? camOpt().id : cfg[id];
  return OPTS[id].map(o => {
    const dis = id === 'cam' && (digital ? !o.digital : !!o.digital);
    const per = id === 'motors' || id === 'props';
    const gw = id === 'cam' && o.digital ? (opt('vtx').camG || 0) : o.g;
    const wt = per ? `${fmtG(gw)} × 4` : fmtG(gw);
    return `<label class="opt"><input type="radio" name="${name}" id="${name}-${o.id}" value="${o.id}"${current === o.id ? ' checked' : ''}${dis ? ' disabled' : ''}>` +
      `<span class="opt-b"><b>${o.name}</b><small>${o.sub} · ${wt}</small></span></label>`;
  }).join('');
}
function renderSlots() {
  const fid = document.activeElement && document.activeElement.id;
  const digital = opt('vtx').kind === 'digital';
  slotsEl.innerHTML = ORDER.map(id => {
    const extra = id === 'cam' ? `<label class="slider" for="tilt"><span>Нахил</span><input type="range" id="tilt" min="0" max="50" step="1" value="${cfg.tilt}"><output id="tiltOut" for="tilt">${cfg.tilt}°</output></label>` : '';
    const why = id === 'cam' && digital ? '<p class="why">Цифрова система працює лише зі своєю камерою, аналогові варіанти недоступні.</p>' : '';
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
  if (slot === 'vtx' && opt('vtx').kind === 'analog' && cfg.cam === 'hdcam') cfg.cam = 'micro';
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
  idle: 'Вигляд згори, ніс від пілота. <b>Props In</b> — стандарт Betaflight: M1 і M4 крутяться за годинниковою, M2 і M3 — проти.',
  in: '<b>Props In</b>: M1 (задній правий) і M4 (передній лівий) — за годинниковою, M2 і M3 — проти. Передні лопаті рухаються до центру рами. Діагональні пари крутяться в один бік, тому реактивні моменти компенсуються.',
  out: '<b>Props Out</b> — реверс: усі напрями навпаки, передні лопаті рухаються назовні й менше закидають бруд на лінзу. У Betaflight вмикається опцією «Motor direction is reversed», а самі мотори перевертають DShot-командою або в ESC.',
  test: 'Тест як у вкладці Motors у Betaflight: по черзі крутиться кожен мотор, а ви звіряєте номер і напрям зі схемою. Перевіряють тільки без пропелерів, тому вони тут напівпрозорі.'
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
  const kv = opt('motors').kv, vNom = (lastCalc || calc()).vNom;
  document.querySelectorAll('[data-mot]').forEach(b => {
    const m = b.dataset.mot;
    b.setAttribute('aria-pressed', String((m === 'test' && MOT.mode === 'test') || (MOT.mode === 'spin' && m === MOT.dir)));
  });
  const rpm = Math.round(kv * vNom * MOT.thr * 0.82 / 100) * 100;
  setText($('motRo'), MOT.mode === 'idle' ? 'зупинені' : MOT.mode === 'test' ? `M${MOT.ti + 1} · ${NAMES[MOT.ti]}` : `${MOT.dir === 'in' ? 'Props In' : 'Props Out'} · ≈${fmt(rpm)} об/хв`);
  setHTML($('motNote'), MOT.mode === 'idle' ? MOT_NOTES.idle : MOT.mode === 'test' ? MOT_NOTES.test : MOT_NOTES[MOT.dir]);
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
  if (kind === 'mot') return '<div class="seg"><button type="button" data-mot="in">Props In</button><button type="button" data-mot="out">Props Out</button><button type="button" data-mot="test">Тест 1→4</button><button type="button" data-mot="stop">Стоп</button></div>';
  if (kind === 'fc') return '<div class="seg"><button type="button" data-fc="run">Робочий режим</button><button type="button" data-fc="dfu">Boot / DFU</button><button type="button" data-fc="flash">Прошити</button></div>';
  return '<div class="seg"><button type="button" data-rx="nolink">Немає зв’язку</button><button type="button" data-rx="bind">Біндинг</button><button type="button" data-rx="linked">Збінджено</button><button type="button" data-rx="wifi">Wi-Fi</button></div>';
}
function dirMapSVG() {
  const dirs = motorDirs(), pos = [[170, 172], [170, 66], [60, 172], [60, 66]], r = 22;
  const pt = (cx, cy, a) => [(cx + r * Math.cos(a * Math.PI / 180)).toFixed(1), (cy + r * Math.sin(a * Math.PI / 180)).toFixed(1)];
  let s = '<svg class="dirmap" viewBox="0 0 230 240" role="img" aria-label="Напрями обертання моторів, вигляд згори">' +
    '<defs><marker id="mkcw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--cw)"></path></marker>' +
    '<marker id="mkccw" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill: var(--ccw)"></path></marker></defs>' +
    '<line x1="60" y1="66" x2="170" y2="172" style="stroke: var(--line-2); stroke-width: 7; stroke-linecap: round"></line>' +
    '<line x1="170" y1="66" x2="60" y2="172" style="stroke: var(--line-2); stroke-width: 7; stroke-linecap: round"></line>' +
    '<rect x="96" y="92" width="38" height="56" rx="6" style="fill: var(--ink-2)"></rect>' +
    '<path d="M115 14 L124 28 L106 28 z" style="fill: var(--accent)"></path><text x="115" y="44" text-anchor="middle" class="sm">ніс</text>';
  pos.forEach(([cx, cy], i) => {
    const cw = dirs[i] < 0, [x0, y0] = pt(cx, cy, cw ? 200 : 340), [x1, y1] = pt(cx, cy, 90);
    s += `<circle cx="${cx}" cy="${cy}" r="34" style="fill: var(--card); stroke: var(--line-2)"></circle>` +
      `<path d="M${x0} ${y0} A${r} ${r} 0 1 ${cw ? 1 : 0} ${x1} ${y1}" style="fill: none; stroke: var(--${cw ? 'cw' : 'ccw'}); stroke-width: 3" marker-end="url(#mk${cw ? 'cw' : 'ccw'})"></path>` +
      `<text x="${cx}" y="${cy + 1}" text-anchor="middle">M${i + 1}</text><text x="${cx}" y="${cy + 13}" text-anchor="middle" class="sm">${cw ? 'CW' : 'CCW'}</text>`;
  });
  return s + '</svg>';
}
function renderDrawer(id, keepScroll) {
  const d = COMP[id], st = drBody.scrollTop;
  setText($('drN'), String(numN(id))); setText($('drCat'), d.cat); setText($('drTitle'), d.name);
  let h = `<p class="dr-lead">${d.short}</p>`;
  h += sec('Що це', d.what.map(p => `<p>${p}</p>`).join(''));
  if (id === 'motors') h += sec('Напрям обертання', dirMapSVG() +
    `<p>Нумерація Betaflight, вигляд згори, ніс угорі: M1 — задній правий, M2 — передній правий, M3 — задній лівий, M4 — передній лівий. Зараз: <b>${MOT.dir === 'in' ? 'Props In' : 'Props Out'}</b>.</p>` +
    '<p>Напрям змінюють програмно: DShot-командами з Betaflight Configurator або в налаштуваннях ESC. Фізично його міняє перестановка будь-яких двох із трьох дротів мотора.</p>');
  if (d.anim) h += sec('Анімація в 3D', animButtons(d.anim));
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
  if (S.sel !== id || S.demo) select(id);
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
    const b = e.target.closest('[data-mot],[data-fc],[data-rx]'); if (!b || b.disabled) return;
    if (b.dataset.mot) motorCmd(b.dataset.mot); else if (b.dataset.fc) fcCmd(b.dataset.fc); else rxCmd(b.dataset.rx);
    if (narrowMQ.matches && b.closest('#drawer')) closeDrawer();
  });
  $('thr').addEventListener('input', e => { MOT.thr = +e.target.value / 100; setText($('thrOut'), `${e.target.value} %`); updateDemoUI(); });
  $('pkMore').addEventListener('click', () => { if (S.peekId) openDrawer(S.peekId); });
  $('drClose').addEventListener('click', closeDrawer);
  scrimEl.addEventListener('click', closeDrawer);
  $('tExplode').addEventListener('click', () => ok3d && toggleExplode());
  $('tSignals').addEventListener('click', () => ok3d && toggleSignals());
  $('tSpin').addEventListener('click', () => { if (!ok3d) return; ctl.auto = !ctl.auto; updateSpinBtn(); });
  $('tTour').addEventListener('click', () => { if (!ok3d) return; S.tour ? stopTour() : startTour(); });
  $('tourPrev').addEventListener('click', () => tourGo(S.tourI - 1));
  $('tourNext').addEventListener('click', () => tourGo(S.tourI + 1));
  $('tReset').addEventListener('click', () => {
    if (!ok3d) return;
    stopTour(); stopDemos(); if (S.explodeOn) toggleExplode(false); if (S.signals) toggleSignals(false);
    clearSel(); homeView(); ctl.auto = !reduceMotion; updateSpinBtn();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (S.drawerOpen) closeDrawer(); else if (S.tour) stopTour(); else if (S.sel) clearSel();
  });
  narrowMQ.addEventListener('change', () => { scrimEl.hidden = !(S.drawerOpen && narrowMQ.matches); });
}

function init() {
  lastCalc = calc();
  renderStats(lastCalc, null); renderWarns(lastCalc); renderProfile(lastCalc);
  renderBOM(); renderSlots(); updateDemoUI(); bindUI();
  if (ok3d) {
    try { initScene(); }
    catch (err) {
      console.error(err); ok3d = false;
      $('fallback').hidden = false; $('hint').hidden = true;
    }
  }
}
init();
