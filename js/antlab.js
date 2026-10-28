/* Курс по БПЛА · режим «Антени»: стенд «виносна станція ↔ дрон», бюджет радіолінії.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= ANTENNA LAB: виносна станція ↔ дрон ================= */
const DEG = Math.PI / 180;
const VA = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  perp: (a, d) => { const k = a[0] * d[0] + a[1] * d[1] + a[2] * d[2]; return [a[0] - d[0] * k, a[1] - d[1] * k, a[2] - d[2] * k]; },
  at: (o, F, p) => [o[0] + F.X[0] * p[0] + F.Y[0] * p[1] + F.Z[0] * p[2], o[1] + F.X[1] * p[0] + F.Y[1] * p[1] + F.Z[1] * p[2], o[2] + F.X[2] * p[0] + F.Y[2] * p[1] + F.Z[2] * p[2]]
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const dbm = mw => 10 * Math.log10(mw);
const fmt1 = v => fmt(v, 1);
const sgn1 = v => (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 1);
const fmtKm = km => (km < 1 ? `${fmt(Math.round(km * 1000 / 10) * 10)} м` : km < 10 ? `${fmt(km, 1)} км` : `${fmt(km)} км`);
const wrap180 = a => ((a + 180) % 360 + 360) % 360 - 180;

/* ---------- каталог: G — максимальне підсилення, дБі; bw — ширина променя −3 дБ; fb — фронт/тил ---------- */
const ANT = {
  lolli58: { name: 'Lollipop', band: '58', kind: 'omni', pol: 'circ', g: 2.2, n: 1.3, floor: -14, model: 'lolli', sides: 'sd' },
  pagoda58: { name: 'Pagoda', band: '58', kind: 'omni', pol: 'circ', g: 1.8, n: 1.0, floor: -11, model: 'pagoda', sides: 'sd' },
  stubby58: { name: 'Stubby', band: '58', kind: 'omni', pol: 'circ', g: 1.2, n: 1.0, floor: -11, model: 'stubby', sides: 'sd' },
  dipole58: { name: 'Диполь 5,8', band: '58', kind: 'omni', pol: 'lin', g: 2.15, dip: true, model: 'dipole', sides: 'sd' },
  patch58: { name: 'Патч 5,8', band: '58', kind: 'dir', pol: 'circ', g: 8.5, bw: 70, fb: 20, model: 'patch', sides: 's' },
  helix58: { name: 'Хелікал 5,8', band: '58', kind: 'dir', pol: 'circ', g: 13, bw: 35, fb: 20, model: 'helix', sides: 's' },
  dip24: { name: 'Диполь / T-антена 2,4', band: '24', kind: 'omni', pol: 'lin', g: 2.15, dip: true, model: 'tant', sides: 'sd' },
  cer24: { name: 'Керамічна 2,4', band: '24', kind: 'omni', pol: 'lin', g: -1, n: 0.5, floor: -8, model: 'ceramic', sides: 'd' },
  moxon24: { name: 'Moxon 2,4', band: '24', kind: 'dir', pol: 'lin', g: 6, bw: 90, fb: 20, model: 'moxon', sides: 's' },
  patch24: { name: 'Патч 2,4 лінійний', band: '24', kind: 'dir', pol: 'lin', g: 8, bw: 70, fb: 20, model: 'patch', sides: 's' },
  imt9: { name: 'Immortal-T 900', band: '9', kind: 'omni', pol: 'lin', g: 2.15, dip: true, model: 'tant', len: 1.35, sides: 'sd' },
  dip9: { name: 'Штир 900', band: '9', kind: 'omni', pol: 'lin', g: 2.15, dip: true, model: 'dipole', len: 1.3, sides: 's' },
  moxon9: { name: 'Moxon 900', band: '9', kind: 'dir', pol: 'lin', g: 6, bw: 90, fb: 20, model: 'moxon', sides: 's' },
  yagi9: { name: 'Yagi 900', band: '9', kind: 'dir', pol: 'lin', g: 10, bw: 50, fb: 18, model: 'yagi', sides: 's' }
};
const BANDS = { 58: '5,8 ГГц', 24: '2,4 ГГц', 9: '868/915 МГц' };
const LCH = {
  video: { name: 'Відео 5,8 ГГц', band: '58', f: 5800, tx: 'dr', pw: [25, 200, 600, 1000], pw0: 600, sens: -90, color: '--sig-video', st: 'patch58', dr: 'lolli58' },
  e24: { name: 'ELRS 2,4 ГГц', band: '24', f: 2440, tx: 'st', pw: [25, 100, 250, 500, 1000], pw0: 250, rates: [[50, -115], [150, -112], [250, -108], [500, -105]], color: '--sig-ctrl', st: 'dip24', dr: 'dip24' },
  e9: { name: 'ELRS 900 МГц', band: '9', f: 900, tx: 'st', pw: [25, 100, 250, 500, 1000], pw0: 250, rates: [[25, -123], [50, -120], [100, -117], [200, -112]], color: '--sig-ctrl', st: 'dip9', dr: 'imt9' }
};
/* фазовий центр моделі в локальних координатах антени (до масштабу сторони) */
const MODEL_PC = { lolli: [0, 1.75, 0], pagoda: [0, 1.5, 0], stubby: [0, 0.55, 0], dipole: [0, 1.6, 0], tant: [0, 1.3, 0.5], ceramic: [0, 0.3, 0.15], patch: [0, 0, 0.4], helix: [0, 0, 1.2], moxon: [0, 0, 0.25], yagi: [0, 0, 0.4] };
const SIDE_S = { st: 1.25, dr: 0.8 };
const LAB = {
  ch: 'video',
  sel: { video: { st: 'patch58', sh: 1, dr: 'lolli58', dh: 1 }, e24: { st: 'dip24', sh: 1, dr: 'dip24', dh: 1 }, e9: { st: 'dip9', sh: 1, dr: 'imt9', dh: 1 } },
  pw: { video: 600, e24: 250, e9: 250 }, rate: { e24: 250, e9: 100 },
  aim: 'fixed', dist: 2, alt: 80, az: 0, roll: 0,
  show: { pat: true, wave: true, pol: true, refl: false }, src: 'tx',
  orbit: false, rock: false, rockT: 0, t: 0, scen: 'ok', res: null, dirty: true
};
const SCEN = [
  { id: 'ok', name: 'Правильний комплект', ch: 'video', st: 'patch58', dr: 'lolli58', dist: 2, alt: 80, note: 'Обидві антени RHCP, патч дивиться на дрон. Лишаються тільки втрати на відстані — це еталон для порівняння.' },
  { id: 'lhcp', name: 'RHCP ↔ LHCP', ch: 'video', st: 'patch58', sh: -1, dr: 'lolli58', dist: 2, alt: 80, note: 'Та сама пара антен, але на станції LHCP. Порівняйте запас з «Правильним комплектом»: ≈20 дБ різниці.' },
  { id: 'mix', name: 'Лінійна ↔ кругова', ch: 'video', st: 'patch58', dr: 'dipole58', dist: 2, alt: 80, note: 'Лінійний диполь на дроні, кругова антена на станції: мінус 3 дБ за будь-якого крену — покрутіть «Крен».' },
  { id: 'roll', name: 'Крен з лінійними', ch: 'e24', st: 'dip24', dr: 'dip24', dist: 8, alt: 80, rock: true, note: 'ELRS з двома диполями, дрон хитається з креном ±85°. Коли антени стають навхрест, сигнал провалюється на 15–25 дБ.' },
  { id: 'beam', name: 'Вузький промінь', ch: 'video', st: 'helix58', dr: 'lolli58', dist: 5, alt: 120, orbit: true, note: 'Хелікал б’є далеко, але вузько (≈35°). Дрон облітає станцію — зв’язок є лише в секторі променя.' },
  { id: 'over', name: 'Над головою', ch: 'video', st: 'patch58', dr: 'lolli58', dist: 0.08, alt: 400, note: 'Дрон на 400 м майже над станцією: патч дивиться в горизонт, а антена дрона «бачить» станцію мертвою зоною вздовж осі. Ближче, ніж 2 км, а запас менший.' },
  { id: 'band', name: 'Не той діапазон', ch: 'video', st: 'patch58', dr: 'dip24', dist: 2, alt: 80, note: 'На VTX 5,8 ГГц накрутили антену від 2,4 ГГц: роз’єм підходить, а резонанс — ні. Відбита потужність ще й гріє VTX.' },
  { id: 'far', name: '900 МГц на далеко', ch: 'e9', st: 'moxon9', dr: 'imt9', dist: 15, alt: 150, aim: 'track', rate: 50, note: 'Moxon на станції з трекером, Immortal-T на дроні, 50 Гц: великий запас навіть на 15 км.' }
];

/* ---------- фізика ---------- */
function gainLocal(a, v) {
  if (a.kind === 'dir') {
    const th = Math.acos(clamp(v[2], -1, 1)) / DEG;
    return a.g - Math.min(12 * (th / a.bw) * (th / a.bw), a.fb);
  }
  const c = clamp(v[1], -1, 1), s = Math.sqrt(Math.max(0, 1 - c * c));
  if (a.dip) {
    const f = s < 1e-3 ? 0 : Math.cos(Math.PI / 2 * c) / s;
    return a.g + Math.max(20 * Math.log10(Math.max(Math.abs(f), 1e-6)), -25);
  }
  return a.g + Math.max(20 * Math.log10(Math.max(Math.pow(s, a.n), 1e-6)), a.floor);
}
/* кут від осі променя (спрямовані) або від площини найкращого прийому (всеспрямовані) */
const angleOff = (a, v) => (a.kind === 'dir' ? Math.acos(clamp(v[2], -1, 1)) : Math.asin(Math.abs(clamp(v[1], -1, 1)))) / DEG;
const handName = h => (h > 0 ? 'RHCP' : 'LHCP');
const polName = e => (e.a.pol === 'circ' ? handName(e.h) : 'лінійна');
function polar(tx, rx, d) {
  if (tx.a.pol === 'circ' && rx.a.pol === 'circ') return tx.h === rx.h ? { db: 0, kind: 'same', txt: `${handName(tx.h)} → ${handName(rx.h)}` } : { db: 20, kind: 'opp', txt: `${handName(tx.h)} → ${handName(rx.h)}` };
  if (tx.a.pol !== rx.a.pol) return { db: 3, kind: 'mix', txt: `${polName(tx)} → ${polName(rx)}` };
  const p1 = VA.perp(tx.f.Y, d), p2 = VA.perp(rx.f.Y, d);
  if (VA.len(p1) < 0.08 || VA.len(p2) < 0.08) return { db: 0, kind: 'lin', ang: null, txt: 'лінійна → лінійна' };
  const cs = Math.abs(VA.dot(VA.norm(p1), VA.norm(p2))), ang = Math.acos(clamp(cs, 0, 1)) / DEG;
  return { db: Math.min(25, -20 * Math.log10(Math.max(cs, 1e-4))), kind: 'lin', ang, txt: `лінійна → лінійна, ${Math.round(ang)}°` };
}
function labSolve() {
  const c = LCH[LAB.ch], s = LAB.sel[LAB.ch], sa = ANT[s.st], da = ANT[s.dr];
  const head = [0, 6.2, 0], d = LAB.dist, hRel = LAB.alt - 5;
  const dSl = Math.max(0.005, Math.hypot(d * 1000, hRel) / 1000);
  const el = Math.atan2(hRel, d * 1000), az = LAB.az * DEG;
  const R = clamp(16 + 5.5 * Math.log10(dSl / 0.1), 16, 32);
  const u0 = [Math.cos(el) * Math.cos(az), Math.sin(el), -Math.cos(el) * Math.sin(az)];
  const dPos = VA.add(head, VA.mul(u0, R));
  let f = [u0[0], 0, u0[2]]; f = VA.len(f) < 1e-6 ? [Math.cos(az), 0, -Math.sin(az)] : VA.norm(f);
  const Zd = VA.mul(f, -1), Y0 = [0, 1, 0], X0 = VA.norm(VA.cross(Y0, Zd)), rho = -LAB.roll * DEG;
  const dr = {
    X: VA.add(VA.mul(X0, Math.cos(rho)), VA.mul(Y0, Math.sin(rho))),
    Y: VA.add(VA.mul(X0, -Math.sin(rho)), VA.mul(Y0, Math.cos(rho))), Z: Zd
  };
  const dMount = VA.at(dPos, dr, [0, 0.95, 1.15]);
  let st = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
  if (sa.kind === 'dir') {
    const b = LAB.aim === 'track' ? u0 : [Math.cos(5 * DEG), Math.sin(5 * DEG), 0];
    const X = VA.norm(VA.cross([0, 1, 0], b));
    st = { X, Y: VA.cross(b, X), Z: b };
  }
  const sp = VA.at(head, st, VA.mul(MODEL_PC[sa.model], SIDE_S.st)), dp = VA.at(dMount, dr, VA.mul(MODEL_PC[da.model], SIDE_S.dr));
  const S1 = { a: sa, f: st, p: sp, h: s.sh, side: 'st' }, D1 = { a: da, f: dr, p: dp, h: s.dh, side: 'dr' };
  const tx = c.tx === 'st' ? S1 : D1, rx = c.tx === 'st' ? D1 : S1;
  /* фізика — за справжньою геометрією (відстань і висота в метрах), сцена лише стиснута для показу */
  const dir = c.tx === 'st' ? u0 : VA.mul(u0, -1), back = VA.mul(dir, -1);
  const loc = (w, F) => [VA.dot(w, F.X), VA.dot(w, F.Y), VA.dot(w, F.Z)];
  const lt = loc(dir, tx.f), lr = loc(back, rx.f);
  const gT = gainLocal(tx.a, lt), gR = gainLocal(rx.a, lr);
  const pol = polar(tx, rx, dir);
  const lBand = (tx.a.band !== c.band ? 15 : 0) + (rx.a.band !== c.band ? 15 : 0);
  const pw = LAB.pw[LAB.ch], ptx = dbm(pw);
  const fspl = 20 * Math.log10(dSl) + 20 * Math.log10(c.f) + 32.44;
  const sens = c.rates ? c.rates.find(q => q[0] === LAB.rate[LAB.ch])[1] : c.sens;
  /* радіогоризонт для щогли 5 м і висоти дрона; за ним — дифракція, оцінка −30 дБ */
  const hor = 4.12 * (Math.sqrt(5) + Math.sqrt(Math.max(LAB.alt, 0))), lHor = d > hor ? 30 : 0;
  const prx = ptx + gT + gR - fspl - pol.db - lBand - lHor, margin = prx - sens;
  const dmax = Math.pow(10, (ptx + gT + gR - pol.db - lBand - 32.44 - 20 * Math.log10(c.f) - sens - 10) / 20);
  return { c, s, sa, da, head, dPos, dMount, R, el, az, dSl, st, dr, tx, rx, dir, gT, gR, angT: angleOff(tx.a, lt), angR: angleOff(rx.a, lr), pol, lBand, hor, lHor, pw, ptx, fspl, sens, prx, margin, dmax };
}
function labVerdict(r) {
  const m = r.margin, vid = LAB.ch === 'video';
  if (m >= 10) return { cls: 'ok', t: 'Сходяться', s: vid ? 'чиста картинка із запасом на маневри' : 'стабільне керування із запасом' };
  if (m >= 0) return { cls: 'warn', t: 'На межі', s: vid ? 'шум і смуги, на віражах — провали' : 'LQ падає, на маневрах можливий failsafe' };
  return { cls: 'bad', t: 'Не сходяться', s: vid ? 'картинки немає' : 'failsafe — дрон без керування' };
}
function labReasons(r) {
  const out = [], c = r.c, p = r.pol, who = e => (e.side === 'st' ? 'Станція' : 'Дрон'), tgt = e => (e.side === 'st' ? 'дрон' : 'станція');
  [r.tx, r.rx].forEach(e => {
    if (e.a.band !== c.band) out.push(['bad', `${who(e)}: антена «${e.a.name}» розрахована на ${BANDS[e.a.band]}, а канал працює на ${BANDS[c.band]}. Неузгодженість ≈15 дБ (оцінка)${e === r.tx ? ', а відбита потужність гріє вихідний каскад передавача' : ''}.`]);
  });
  if (p.kind === 'same') out.push(['ok', `Поляризація збігається (${p.txt}): 0 дБ. Відбитий від землі сигнал змінює напрям обертання, тому приймальна антена його майже не чує — менше провалів.`]);
  else if (p.kind === 'opp') out.push(['bad', `${p.txt}: протилежний напрям обертання. Втрата ≈20 дБ (на практиці 15–25) — дальність падає приблизно вдесятеро.`]);
  else if (p.kind === 'mix') out.push(['warn', `Кругова ↔ лінійна (${p.txt}): постійна втрата 3 дБ за будь-якого крену — дальність ×0,7. Захисту від відбиттів немає.`]);
  else if (p.ang == null) out.push(['info', 'Лінійні антени: одна з них дивиться на іншу своєю віссю, тож кут поляризації зараз не визначений — вирішує мертва зона діаграми.']);
  else if (p.ang < 20) out.push(['ok', `Лінійні антени майже паралельні (${Math.round(p.ang)}°): втрата ${p.db < 0.05 ? '≈0' : fmt1(p.db)} дБ.`]);
  else out.push([p.db >= 10 ? 'bad' : 'warn', `Лінійні антени під кутом ${Math.round(p.ang)}°: втрата ${fmt1(p.db)} дБ. ${p.ang > 70 ? 'Навхрест (90°) сигнал майже зникає — так буває у віражі з креном.' : 'Що більший крен, то більша втрата.'}`]);
  [[r.tx, r.gT, r.angT], [r.rx, r.gR, r.angR]].forEach(([e, g, ang]) => {
    const loss = e.a.g - g; if (loss < 3) return;
    const sev = loss >= 10 ? 'bad' : 'warn';
    if (e.a.kind === 'dir') out.push([sev, `${who(e)}: ${tgt(e)} за ${Math.round(ang)}° від осі антени «${e.a.name}» при ширині променя ${e.a.bw}° — втрата ${fmt1(loss)} дБ.`]);
    else out.push([sev, `${who(e)}: ${tgt(e)} під кутом ${Math.round(ang)}° до площини антени «${e.a.name}», близько до мертвої зони вздовж осі — втрата ${fmt1(loss)} дБ.`]);
  });
  if (r.lHor) out.push(['bad', `Дрон за радіогоризонтом: з висоти ${fmt(LAB.alt)} м і щогли 5 м пряма видимість закінчується на ≈${fmtKm(r.hor)}. Далі сигнал лише огинає Землю — втрата ≈30 дБ і більше (оцінка). Набирайте висоту.`]);
  out.push(['info', `Відстань ${fmtKm(r.dSl)} на ${BANDS[c.band]}: втрати у вільному просторі ${fmt1(r.fspl)} дБ. Кожне подвоєння відстані — ще 6 дБ.`]);
  if (LAB.ch === 'e24') out.push(['info', 'На 868/915 МГц ті самі кілометри коштують на 8,7 дБ менше, ніж на 2,4 ГГц: дальність майже втричі більша за інших рівних.']);
  if (LAB.ch !== 'video') out.push(['info', `Частота пакетів ${LAB.rate[LAB.ch]} Гц — чутливість ${r.sens} дБм. Нижча частота пакетів чутливіша: більше дальність, але більша затримка.`]);
  out.push(['info', `Потужність ${r.pw} мВт = ${fmt1(r.ptx)} дБм. Подвоєння потужності — лише +3 дБ (×1,4 дальності); правильна антена на станції дає більше.`]);
  return out;
}
function labFixText(r) {
  if (r.margin >= 10) return '';
  const lossS = r.sa.g - (r.tx.side === 'st' ? r.gT : r.gR), lossD = r.da.g - (r.tx.side === 'dr' ? r.gT : r.gR);
  const cand = [
    [r.lHor, 'Підніміть дрон вище або антену станції на вищу щоглу: радіогоризонт росте з корінем висоти.'],
    [r.lBand, 'Поставте антени на частоту свого каналу.'],
    [r.pol.kind === 'opp' ? r.pol.db : 0, 'Однакова поляризація з обох боків: RHCP ↔ RHCP або LHCP ↔ LHCP.'],
    [r.pol.kind === 'lin' ? r.pol.db : 0, 'Тримайте лінійні антени паралельно або поставте на дрон diversity — дві антени під 90°.'],
    [r.pol.kind === 'mix' ? r.pol.db : 0, 'Замініть лінійну антену на кругову з тією ж поляризацією.'],
    [lossS, r.sa.kind === 'dir' ? (LAB.aim === 'fixed' ? 'Наведіть антену станції на дрон або увімкніть трекер; для польотів навколо — ширший патч замість хелікала.' : 'Дрон поза променем навіть з трекером — потрібна ширша антена.') : 'Не зависайте прямо над станцією: всеспрямована антена станції має мертву зону вгорі.'],
    [lossD, 'Не літайте прямо над станцією; поставте на станцію diversity: спрямована + всеспрямована антени.']
  ].sort((a, b) => b[0] - a[0]);
  return cand[0][0] >= 3 ? cand[0][1] : 'Зменшіть відстань, підніміть потужність або поставте на станцію спрямовану антену з більшим підсиленням.';
}

/* ---------- 3D ---------- */
let labG = null, labGroundTex, stAntG, drG, drAntG, linkM, reflM = [], labArr = [], labTip = [], ringSets = [], glyph = {}, labArrMat, labLinkMat, labReflMat;
const RING_N = 160, NARR = 30;
const WAVE_VS = 'attribute float side; attribute float g; uniform float uR; uniform float uTh; varying float vG; void main(){ vG = g; vec3 p = position * (uR + side * uTh); gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }';
const WAVE_FS = 'uniform vec3 uC; uniform float uOp; varying float vG; void main(){ gl_FragColor = vec4(uC, uOp * vG); }';
const LM = {};
function labMats() {
  LM.black = new T.MeshStandardMaterial({ color: C('#1c1f22'), roughness: 0.6 });
  LM.red = new T.MeshStandardMaterial({ color: C('#C8392C'), roughness: 0.4 });
  LM.gold = new T.MeshStandardMaterial({ color: C('#d5ab4f'), metalness: 1, roughness: 0.3 });
  LM.metal = new T.MeshStandardMaterial({ color: C('#c3c8ce'), metalness: 1, roughness: 0.28 });
  LM.pcb = new T.MeshStandardMaterial({ color: C('#1f6b45'), roughness: 0.5 });
  LM.white = new T.MeshStandardMaterial({ color: C('#e9e6dc'), roughness: 0.6 });
  LM.clear = new T.MeshStandardMaterial({ color: C('#d8e2ea'), roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });
  LM.shrink = new T.MeshStandardMaterial({ color: C('#2c5fa8'), roughness: 0.5 });
}
function drawLabGround() {
  const size = 1024, span = 104, px = size / span, cv = labGroundTex.image;
  cv.width = cv.height = size;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, size, size);
  for (let i = 0; i <= span; i += 2) {
    const p = Math.round(i * px) + 0.5, maj = i % 10 === 2;
    x.strokeStyle = maj ? css('--mat-major') : css('--mat-minor'); x.lineWidth = maj ? 1.5 : 1;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, size); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(size, p); x.stroke();
  }
  x.globalCompositeOperation = 'destination-in';
  const g = x.createRadialGradient(size / 2, size / 2, size * 0.12, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';
  labGroundTex.needsUpdate = true;
}
function mesh(parent, geo, mat, p, r) {
  const m = new T.Mesh(geo, mat);
  if (p) m.position.set(p[0], p[1], p[2]);
  if (r) m.rotation.set(r[0], r[1], r[2]);
  parent.add(m); return m;
}
function rod(parent, a, b, r, mat, seg = 8) {
  const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length();
  const m = new T.Mesh(cyl(r, r, len, seg), mat); alignTo(m, A, d, len); parent.add(m); return m;
}
function labStation() {
  const g = new T.Group(); labG.add(g);
  const alu = new T.MeshStandardMaterial({ color: C('#a9b0b7'), roughness: 0.35, metalness: 0.9 });
  const dark = new T.MeshStandardMaterial({ color: C('#2a2e33'), roughness: 0.6, metalness: 0.3 });
  const olive = new T.MeshStandardMaterial({ color: C('#4a5a45'), roughness: 0.75 });
  for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3 + 0.5; rod(g, [Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4], [0, 3.3, 0], 0.07, alu); }
  mesh(g, cyl(0.12, 0.12, 3.0, 12), alu, [0, 4.6, 0]);
  mesh(g, box(1.1, 0.8, 0.55), olive, [0, 4.3, 0.38]);
  mesh(g, box(0.5, 0.18, 0.06), new T.MeshStandardMaterial({ color: C('#0d2238'), emissive: C('#2a6fd0'), emissiveIntensity: 0.6 }), [0, 4.45, 0.67]);
  mesh(g, box(0.55, 0.3, 0.55), dark, [0, 6.0, 0]);
  const cab = new T.CatmullRomCurve3([[0, 4.7, 0.3], [0.35, 5.3, 0.2], [0.15, 5.95, 0.1]].map(v3));
  g.add(new T.Mesh(new T.TubeGeometry(cab, 20, 0.04, 6, false), dark));
  return g;
}
function labDrone() {
  const g = new T.Group(); labG.add(g);
  const carbon = new T.MeshStandardMaterial({ color: C('#25292d'), roughness: 0.55, metalness: 0.25 });
  const motorM = new T.MeshStandardMaterial({ color: C('#7b5ce0'), roughness: 0.35, metalness: 0.7 });
  const battM = new T.MeshStandardMaterial({ color: C('#C93B2B'), roughness: 0.5 });
  const propM = new T.MeshBasicMaterial({ color: C('#E8820F'), transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide, toneMapped: false });
  mesh(g, box(1.3, 0.3, 2.6), carbon, [0, 0.25, 0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const arm = mesh(g, box(0.3, 0.12, 2.5), carbon, [sx * 0.88, 0.16, sz * 0.88]); arm.rotation.y = Math.atan2(sx, sz);
    mesh(g, cyl(0.3, 0.3, 0.35, 16), motorM, [sx * 1.75, 0.38, sz * 1.75]);
    mesh(g, new T.CircleGeometry(1.35, 40), propM, [sx * 1.75, 0.62, sz * 1.75], [-Math.PI / 2, 0, 0]);
  }
  mesh(g, box(1.0, 0.55, 1.8), battM, [0, 0.7, 0.1]);
  mesh(g, box(0.55, 0.55, 0.5), carbon, [0, 0.45, -1.35]);
  mesh(g, cyl(0.17, 0.19, 0.2, 16), LM.black, [0, 0.45, -1.68], [Math.PI / 2, 0, 0]);
  return g;
}
function antModel(a, hand) {
  const g = new T.Group(), L1 = a.len || 1;
  switch (a.model) {
    case 'lolli':
      mesh(g, cyl(0.07, 0.09, 1.5, 10), LM.black, [0, 0.75, 0]);
      mesh(g, new T.SphereGeometry(0.42, 24, 14), LM.red, [0, 1.75, 0]).scale.set(1, 0.72, 1); break;
    case 'pagoda':
      mesh(g, cyl(0.07, 0.09, 1.25, 10), LM.black, [0, 0.62, 0]);
      [0.46, 0.4, 0.33].forEach((r, i) => mesh(g, cyl(r, r, 0.07, 28), LM.pcb, [0, 1.35 + i * 0.16, 0]));
      mesh(g, cyl(0.5, 0.5, 0.52, 28), LM.clear, [0, 1.52, 0]); break;
    case 'stubby':
      mesh(g, cyl(0.2, 0.22, 0.85, 16), LM.black, [0, 0.43, 0]);
      mesh(g, new T.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), LM.black, [0, 0.85, 0]); break;
    case 'dipole':
      mesh(g, cyl(0.12, 0.12, 0.9 * L1, 12), LM.black, [0, 0.45 * L1, 0]);
      mesh(g, cyl(0.045, 0.045, 1.5 * L1, 8), LM.gold, [0, 0.9 * L1 + 0.75 * L1, 0]);
      mesh(g, new T.SphereGeometry(0.07, 8, 6), LM.black, [0, 2.4 * L1, 0]); break;
    case 'tant': {
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([[0, 0, 0], [0, 0.6, 0.15], [0, 1.3, 0.5]].map(v3)), 16, 0.045, 6, false), LM.black));
      rod(g, [0, 1.3 - 0.95 * L1, 0.5], [0, 1.24, 0.5], 0.035, LM.gold); rod(g, [0, 1.36, 0.5], [0, 1.3 + 0.95 * L1, 0.5], 0.035, LM.gold);
      mesh(g, box(0.16, 0.34, 0.16), LM.shrink, [0, 1.3, 0.5]); break;
    }
    case 'ceramic':
      mesh(g, box(0.7, 0.08, 1.1), LM.pcb, [0, 0.2, 0.15]);
      mesh(g, box(0.28, 0.14, 0.6), LM.white, [0, 0.3, 0.15]); break;
    case 'patch':
      mesh(g, cyl(0.1, 0.1, 0.6, 8), LM.black, [0, -0.5, 0.05]);
      mesh(g, box(1.7, 1.7, 0.3), LM.black, [0, 0, 0.15]);
      mesh(g, box(1.55, 1.55, 0.1), LM.white, [0, 0, 0.35]); break;
    case 'helix': {
      mesh(g, cyl(0.95, 0.95, 0.06, 32), LM.metal, [0, 0, 0.03], [Math.PI / 2, 0, 0]);
      const pts = []; for (let i = 0; i <= 7 * 24; i++) { const t = i / 24 * Math.PI * 2; pts.push(new T.Vector3(0.38 * Math.cos(t) * hand, 0.38 * Math.sin(t), 0.15 + 0.32 * t / (Math.PI * 2))); }
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 260, 0.035, 6, false), LM.gold));
      mesh(g, cyl(0.06, 0.06, 2.4, 8), LM.white, [0, 0, 1.3], [Math.PI / 2, 0, 0]); break;
    }
    case 'moxon': {
      const A = 0.9, zd = 0.42, zr = 0.0;
      rod(g, [0, -A, zd], [0, A, zd], 0.03, LM.metal); rod(g, [0, -A, zr], [0, A, zr], 0.03, LM.metal);
      for (const sy of [-1, 1]) { rod(g, [0, sy * A, zd], [0, sy * A, zd - 0.16], 0.03, LM.metal); rod(g, [0, sy * A, zr], [0, sy * A, zr + 0.12], 0.03, LM.metal); }
      mesh(g, box(0.1, 0.1, 0.9), LM.black, [0, 0, 0.2]); mesh(g, cyl(0.06, 0.06, 0.8, 8), LM.black, [0, -0.45, 0.2]); break;
    }
    case 'yagi': {
      mesh(g, box(0.08, 0.08, 3.0), LM.metal, [0, 0, 0.5]);
      [[-0.9, 1.0], [-0.3, 0.93], [0.4, 0.86], [1.1, 0.83], [1.8, 0.8]].forEach(([z, h]) => rod(g, [0, -h, z], [0, h, z], 0.025, LM.metal));
      mesh(g, box(0.16, 0.2, 0.16), LM.black, [0, 0, -0.3]); mesh(g, cyl(0.06, 0.06, 0.8, 8), LM.black, [0, -0.45, 0.4]); break;
    }
  }
  return g;
}
const CMAP = [[0, '#3a4fd8'], [0.5, '#2fcbb0'], [0.8, '#f2c230'], [1, '#ff6a2c']];
function cmap(t, out) {
  let i = 0; while (i < CMAP.length - 2 && t > CMAP[i + 1][0]) i++;
  const [t0, c0] = CMAP[i], [t1, c1] = CMAP[i + 1], k = clamp((t - t0) / (t1 - t0), 0, 1);
  return out.set(c0).lerp(new T.Color(c1), k).convertSRGBToLinear();
}
function patternGeo(a, R, ws, hs) {
  const g = new T.SphereGeometry(1, ws, hs), pos = g.attributes.position, col = new Float32Array(pos.count * 3), v = new T.Vector3(), cc = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const rel = gainLocal(a, [v.x, v.y, v.z]) - a.g, r = R * Math.max(Math.pow(10, rel / 20), 0.03);
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
    cmap(clamp((rel + 25) / 25, 0, 1), cc); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  return g;
}
function patternGroup(a, R) {
  const grp = new T.Group();
  const solid = new T.Mesh(patternGeo(a, R, 72, 48), new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.26, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
  const wire = new T.Mesh(patternGeo(a, R, 28, 16), new T.MeshBasicMaterial({ color: C(TC['--ink']), wireframe: true, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }));
  solid.renderOrder = 5; wire.renderOrder = 6; grp.add(solid, wire); grp.userData.wire = wire;
  return grp;
}
function disposeTree(o) { o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && !Object.values(LM).includes(n.material)) n.material.dispose(); }); }
function setAntGroup(G, id, hand, side) {
  const key = `${id}|${hand}|${side}`;
  if (G.userData.key === key) return;
  G.children.slice().forEach(ch => { G.remove(ch); disposeTree(ch); });
  const a = ANT[id], s = SIDE_S[side];
  const m = antModel(a, hand); m.scale.setScalar(s); G.add(m);
  const pat = patternGroup(a, side === 'st' ? 6 : 4.2); pat.position.copy(v3(MODEL_PC[a.model])).multiplyScalar(s); G.add(pat);
  G.userData = { key, pat };
}
function labSetAnts() {
  if (!ok3d || !labG) return;
  const s = LAB.sel[LAB.ch];
  setAntGroup(stAntG, s.st, ANT[s.st].pol === 'circ' ? s.sh : 1, 'st');
  setAntGroup(drAntG, s.dr, ANT[s.dr].pol === 'circ' ? s.dh : 1, 'dr');
}
function ringGeo() {
  const n = RING_N, pos = new Float32Array((n + 1) * 6), side = new Float32Array((n + 1) * 2), g = new Float32Array((n + 1) * 2), idx = [];
  for (let i = 0; i <= n; i++) { side[i * 2] = -0.5; side[i * 2 + 1] = 0.5; if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('side', new T.BufferAttribute(side, 1)); geo.setAttribute('g', new T.BufferAttribute(g, 1));
  geo.setIndex(idx);
  return geo;
}
function updateRing(set, a, F, A, B) {
  const pos = set.geo.attributes.position, gg = set.geo.attributes.g;
  for (let i = 0; i <= RING_N; i++) {
    const t = i / RING_N * Math.PI * 2, u = VA.add(VA.mul(A, Math.cos(t)), VA.mul(B, Math.sin(t)));
    const rel = gainLocal(a, [VA.dot(u, F.X), VA.dot(u, F.Y), VA.dot(u, F.Z)]) - a.g, gv = Math.pow(clamp(Math.pow(10, rel / 20), 0, 1), 1.3);
    for (let k = 0; k < 2; k++) { pos.setXYZ(i * 2 + k, u[0], u[1], u[2]); gg.setX(i * 2 + k, gv); }
  }
  pos.needsUpdate = true; gg.needsUpdate = true;
}
function makeGlyph() {
  const g = new T.Group(), mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const circ = new T.Group(), ar = Math.PI * 1.6, R = 0.85;
  circ.add(new T.Mesh(new T.TorusGeometry(R, 0.06, 8, 48, ar), mat));
  const cone = new T.Mesh(new T.ConeGeometry(0.2, 0.46, 14), mat); cone.position.set(R * Math.cos(ar), R * Math.sin(ar), 0); cone.rotation.z = ar; circ.add(cone);
  const lin = new T.Group();
  lin.add(new T.Mesh(cyl(0.05, 0.05, 1.5, 8), mat));
  for (const s of [-1, 1]) { const c2 = new T.Mesh(new T.ConeGeometry(0.17, 0.4, 12), mat); c2.position.y = s * 0.85; if (s < 0) c2.rotation.z = Math.PI; lin.add(c2); }
  g.add(circ, lin); g.userData = { circ, lin, mat }; g.renderOrder = 8; labG.add(g);
  return g;
}
function labInit() {
  labMats();
  labG = new T.Group(); labG.visible = false; scene.add(labG);
  labGroundTex = new T.CanvasTexture(document.createElement('canvas')); labGroundTex.encoding = T.sRGBEncoding; labGroundTex.anisotropy = 8;
  drawLabGround();
  const ground = new T.Mesh(new T.CircleGeometry(52, 96), new T.MeshBasicMaterial({ map: labGroundTex, transparent: true, depthWrite: false, toneMapped: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.renderOrder = -2; labG.add(ground);
  labStation();
  stAntG = new T.Group(); stAntG.position.set(0, 6.2, 0); labG.add(stAntG);
  drG = labDrone();
  drAntG = new T.Group(); drAntG.position.set(0, 0.95, 1.15); drG.add(drAntG);
  labLinkMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
  linkM = new T.Mesh(cyl(0.045, 0.045, 1, 8), labLinkMat); linkM.renderOrder = 7; labG.add(linkM);
  labReflMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false });
  for (let i = 0; i < 2; i++) { const m = new T.Mesh(cyl(0.03, 0.03, 1, 6), labReflMat); labG.add(m); reflM.push(m); }
  labArrMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const shaft = cyl(0.045, 0.045, 1, 6); shaft.translate(0, 0.5, 0);
  const tipG = new T.SphereGeometry(0.12, 10, 8);
  for (let i = 0; i < NARR; i++) {
    const s = new T.Mesh(shaft, labArrMat), t = new T.Mesh(tipG, labArrMat); s.renderOrder = t.renderOrder = 9;
    labG.add(s, t); labArr.push(s); labTip.push(t);
  }
  for (let p = 0; p < 2; p++) {
    const set = { geo: ringGeo(), meshes: [] };
    for (let i = 0; i < 4; i++) {
      const m = new T.Mesh(set.geo, new T.ShaderMaterial({ vertexShader: WAVE_VS, fragmentShader: WAVE_FS, uniforms: { uR: { value: 1 }, uTh: { value: 0.1 }, uC: { value: new T.Color(1, 1, 1) }, uOp: { value: 0 } }, transparent: true, depthWrite: false, side: T.DoubleSide }));
      m.frustumCulled = false; m.renderOrder = 4; labG.add(m); set.meshes.push(m);
    }
    ringSets.push(set);
  }
  glyph.tx = makeGlyph(); glyph.rx = makeGlyph();
}
function labEnter() {
  if (!labG) return;
  labG.visible = true; ctl.auto = false; updateSpinBtn();
  labSetAnts(); LAB.res = labSolve(); labApply(LAB.res); labReadout(LAB.res);
  labFrame(LAB.orbit ? 'orbit' : 'link');
}
function labExit() {
  if (labG) labG.visible = false;
  if (LAB.orbit || LAB.rock) { LAB.orbit = false; LAB.rock = false; labRenderControls(); }
  for (const [k, e] of LB) if (k.startsWith('lab')) e.on = false;
}
function labTheme() {
  if (!labG) return;
  drawLabGround();
  [stAntG, drAntG].forEach(G => { const w = G.userData.pat && G.userData.pat.userData.wire; if (w) w.material.color.copy(C(TC['--ink'])); });
  LAB.dirty = true;
}
function basisQ(q, F) { q.setFromRotationMatrix(new T.Matrix4().makeBasis(v3(F.X), v3(F.Y), v3(F.Z))); }
function placeRod(m, a, b) { const d = b.clone().sub(a), len = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.set(1, len, 1); }
function labSource(r) { const side = LAB.src === 'tx' ? r.tx.side : LAB.src; return side === r.tx.side ? r.tx : r.rx; }
function labApply(r) {
  if (!ok3d || !labG) return;
  const v = LAB.vcls = labVerdict(r).cls, tp = v3(r.tx.p), rp = v3(r.rx.p), d = rp.clone().sub(tp).normalize();
  drG.position.set(r.dPos[0], r.dPos[1], r.dPos[2]); basisQ(drG.quaternion, r.dr); basisQ(stAntG.quaternion, r.st);
  [stAntG, drAntG].forEach(G => { if (G.userData.pat) G.userData.pat.visible = LAB.show.pat; });
  placeRod(linkM, tp, rp); labLinkMat.color.copy(C(TC['--' + v]));
  /* відбиття від землі */
  const t = tp.y / (tp.y + rp.y), gp = new T.Vector3(tp.x + (rp.x - tp.x) * t, 0.02, tp.z + (rp.z - tp.z) * t);
  placeRod(reflM[0], tp, gp); placeRod(reflM[1], gp, rp); reflM.forEach(m => { m.visible = LAB.show.refl; });
  labReflMat.color.copy(C(TC['--ink']));
  /* кільця хвиль */
  const src = labSource(r), other = src === r.tx ? r.rx : r.tx;
  let hz = VA.sub(other.p, src.p); hz[1] = 0; hz = VA.len(hz) < 1e-3 ? [1, 0, 0] : VA.norm(hz);
  updateRing(ringSets[0], src.a, src.f, [1, 0, 0], [0, 0, 1]);
  updateRing(ringSets[1], src.a, src.f, hz, [0, 1, 0]);
  const wc = new T.Color(TC[r.c.color] || '#888888');
  ringSets.forEach(set => set.meshes.forEach(m => { m.position.set(src.p[0], src.p[1], src.p[2]); m.material.uniforms.uC.value.copy(wc); m.visible = LAB.show.wave; }));
  LAB.ringMax = VA.len(VA.sub(other.p, src.p)) + 4;
  /* гліфи поляризації */
  labArrMat.color.copy(C(TC[r.c.color] || '#888888'));
  const lossCls = r.pol.db <= 1 ? '--ok' : r.pol.db <= 5 ? '--warn' : '--bad';
  [[glyph.tx, r.tx, tp.clone().addScaledVector(d, 2.4), C(TC[r.c.color] || '#888888')], [glyph.rx, r.rx, rp.clone().addScaledVector(d, -2.4), C(TC[lossCls])]].forEach(([G, e, pos, col]) => {
    G.visible = LAB.show.pol; G.position.copy(pos); G.userData.mat.color.copy(col);
    const circ = e.a.pol === 'circ'; G.userData.circ.visible = circ; G.userData.lin.visible = !circ;
    if (circ) { G.userData.axis = d.clone().multiplyScalar(e.h); G.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), G.userData.axis); G.userData.base = G.quaternion.clone(); }
    else { let ev = v3(VA.perp(e.f.Y, [d.x, d.y, d.z])); if (ev.length() < 0.08) ev = v3(VA.perp([0, 1, 0], [d.x, d.y, d.z])); if (ev.length() < 0.08) ev.set(1, 0, 0); G.quaternion.setFromUnitVectors(UP, ev.normalize()); }
  });
  /* мітки */
  const roleSt = r.tx.side === 'st' ? 'передає' : 'приймає', roleDr = r.tx.side === 'dr' ? 'передає' : 'приймає';
  const hs = r.sa.pol === 'circ' ? ` ${handName(r.s.sh)}` : '', hd = r.da.pol === 'circ' ? ` ${handName(r.s.dh)}` : '';
  const ls = label('labSt', `<b>Станція</b><span class="lx"> · ${roleSt} · ${r.sa.name}${hs}</span>`, 'tag'); ls.pos = new T.Vector3(0, 9.6, 0); ls.on = true;
  const ld = label('labDr', `<b>Дрон</b><span class="lx"> · ${roleDr} · ${r.da.name}${hd}</span>`, 'tag'); ld.pos = v3(r.dPos).add(new T.Vector3(0, 4.4, 0)); ld.on = true;
  const lm = label('labMid', `<span class="lx">${fmt1(r.prx)} дБм · </span>запас ${sgn1(r.margin)} дБ`, 'lv ' + v); lm.pos = tp.clone().lerp(rp, 0.5).add(new T.Vector3(0, 1.4, 0)); lm.on = true;
  const pt = label('labPT', polName(r.tx), 'tag sm'); pt.pos = glyph.tx.position.clone().add(new T.Vector3(0, -1.5, 0)); pt.on = LAB.show.pol;
  const pr = label('labPR', polName(r.rx), 'tag sm'); pr.pos = glyph.rx.position.clone().add(new T.Vector3(0, -1.5, 0)); pr.on = LAB.show.pol;
  const circT = r.tx.a.pol === 'circ';
  const lr = label('labRefl', circT ? `відбиття: ${handName(r.tx.h)} → ${handName(-r.tx.h)}` : 'відбиття: поляризація та сама', 'tag sm'); lr.pos = gp.clone().add(new T.Vector3(0, 0.6, 0)); lr.on = LAB.show.refl;
}
function labAnimate(r, now) {
  if (!r || !labG) return;
  const tp = v3(r.tx.p), rp = v3(r.rx.p), dv = rp.clone().sub(tp), len = dv.length(), d = dv.clone().normalize();
  /* хвилі */
  ringSets.forEach((set, pi) => set.meshes.forEach((m, i) => {
    const p = (LAB.t * 0.3 + i / set.meshes.length) % 1, R = 0.4 + p * LAB.ringMax, u = m.material.uniforms;
    u.uR.value = R; u.uTh.value = 0.09 + 0.012 * R; u.uOp.value = Math.pow(1 - p, 1.2) * (pi === 0 ? 0.42 : 0.72);
  }));
  /* вектор E уздовж лінії зв’язку */
  const show = LAB.show.pol, dd = [d.x, d.y, d.z];
  let u = VA.perp([0, 1, 0], dd); if (VA.len(u) < 0.1) u = VA.perp([1, 0, 0], dd); u = VA.norm(u);
  const vv = VA.cross(dd, u), circ = r.tx.a.pol === 'circ', h = r.tx.h;
  let el = VA.perp(r.tx.f.Y, dd); el = VA.len(el) < 0.08 ? u : VA.norm(el);
  const s0 = 3.4, s1 = Math.max(s0 + 1, len - 3.4), w = 2 * Math.PI * 0.55, kk = 2 * Math.PI / Math.max(2, (s1 - s0) / 5), A = 1.2;
  const E = new T.Vector3(), base = new T.Vector3();
  for (let i = 0; i < NARR; i++) {
    const s = s0 + (s1 - s0) * (i + 0.5) / NARR, ph = w * LAB.t - kk * s, sh = labArr[i], tp2 = labTip[i];
    base.copy(tp).addScaledVector(d, s);
    const e3 = circ ? VA.add(VA.mul(u, Math.cos(ph)), VA.mul(vv, h * Math.sin(ph))) : VA.mul(el, Math.cos(ph));
    E.set(e3[0], e3[1], e3[2]).multiplyScalar(A);
    const L2 = E.length(), vis = show && L2 > 0.05;
    sh.visible = tp2.visible = vis;
    if (!vis) continue;
    sh.position.copy(base); sh.quaternion.setFromUnitVectors(UP, E.clone().divideScalar(L2)); sh.scale.set(1, L2, 1);
    tp2.position.copy(base).add(E);
  }
  /* обертання кругових гліфів */
  [glyph.tx, glyph.rx].forEach(G => {
    if (!G.visible || !G.userData.circ.visible || !G.userData.base) return;
    G.quaternion.copy(G.userData.base).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), now * 2.2));
  });
}
function tickLab(dt, now) {
  if (!labG) return;
  LAB.t += reduceMotion ? 0 : dt;
  if (LAB.orbit) { LAB.az = wrap180(LAB.az + dt * 16); LAB.dirty = true; }
  if (LAB.rock) { LAB.rockT += dt; LAB.roll = Math.round(85 * Math.sin(LAB.rockT * 0.8)); LAB.dirty = true; }
  if (LAB.dirty || !LAB.res) {
    LAB.dirty = false; LAB.res = labSolve(); labApply(LAB.res); labReadout(LAB.res);
    if (LAB.orbit || LAB.rock) labSyncSliders();
  }
  labAnimate(LAB.res, now);
}
function labFrame(kind) {
  if (!ok3d || !labG) return;
  const r = LAB.res || labSolve(), A = v3(r.head), B = v3(r.dPos);
  if (kind === 'orbit') { setView(new T.Vector3(0, 6, 0), null, 0.95, fitDist(r.R + 7)); return; }
  if (kind === 'st' || kind === 'dr') {
    const p = v3(kind === 'st' ? (r.tx.side === 'st' ? r.tx.p : r.rx.p) : (r.tx.side === 'dr' ? r.tx.p : r.rx.p));
    setView(p, r.az + (kind === 'st' ? -0.55 : 0.55), 0.38, fitDist(kind === 'st' ? 9 : 7.5)); return;
  }
  const c = A.clone().lerp(B, 0.5); c.y = Math.max(4, c.y - 1);
  setView(c, r.az, 0.3, fitDist(A.distanceTo(B) / 2 + 7.5));
}

/* ---------- панель ---------- */
const distToX = d => Math.round(1000 * Math.log10(d / 0.05) / Math.log10(600));
const xToDist = x => { const d = 0.05 * Math.pow(600, x / 1000); return d < 1 ? Math.round(d * 100) / 100 : d < 10 ? Math.round(d * 10) / 10 : Math.round(d); };
function labOptions(side) {
  return Object.keys(BANDS).sort((a, b) => (a === LCH[LAB.ch].band ? -1 : b === LCH[LAB.ch].band ? 1 : 0)).map(b =>
    `<optgroup label="${BANDS[b]}">` + Object.entries(ANT).filter(([, a]) => a.band === b && a.sides.includes(side === 'st' ? 's' : 'd'))
      .map(([id, a]) => `<option value="${id}">${a.name}${a.kind === 'dir' ? ` · ${fmt1(a.g)} дБі, ${a.bw}°` : ''}</option>`).join('') + '</optgroup>').join('');
}
function pressSeg(el, key, val) { el.querySelectorAll(`[data-${key}]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset[key] === String(val)))); }
function labSyncSliders() {
  const set = (id, v, out) => { const el = document.getElementById(id); if (el && +el.value !== v) el.value = v; setText(document.getElementById(id + 'Out'), out); };
  set('labDist', distToX(LAB.dist), fmtKm(LAB.dist));
  set('labAlt', LAB.alt, `${fmt(LAB.alt)} м`);
  set('labAz', Math.round(LAB.az), `${Math.round(LAB.az)}°`);
  set('labRoll', LAB.roll, `${LAB.roll}°`);
}
function labRenderControls() {
  const c = LCH[LAB.ch], s = LAB.sel[LAB.ch], sa = ANT[s.st], da = ANT[s.dr];
  pressSeg($('labCh'), 'ch', LAB.ch);
  pressSeg($('labScen'), 'scen', LAB.scen || '');
  const sc = SCEN.find(q => q.id === LAB.scen), note = $('labScenNote');
  note.hidden = !sc; if (sc) setText(note, sc.note);
  const stSel = $('labStAnt'), drSel = $('labDrAnt'), key = LAB.ch;
  if (stSel.dataset.ch !== key) { stSel.innerHTML = labOptions('st'); drSel.innerHTML = labOptions('dr'); stSel.dataset.ch = drSel.dataset.ch = key; }
  stSel.value = s.st; drSel.value = s.dr;
  setText($('labStRole'), c.tx === 'st' ? (LAB.ch === 'video' ? 'передавач' : 'передавач · модуль ELRS') : 'приймач відео');
  setText($('labDrRole'), c.tx === 'dr' ? 'передавач · VTX' : 'приймач ELRS');
  $('labStHand').hidden = sa.pol !== 'circ'; pressSeg($('labStHand'), 'hand', s.sh);
  $('labDrHand').hidden = da.pol !== 'circ'; pressSeg($('labDrHand'), 'hand', s.dh);
  $('labAim').hidden = sa.kind !== 'dir'; pressSeg($('labAim'), 'aim', LAB.aim);
  const pwEl = $('labPw');
  if (pwEl.dataset.ch !== key) { pwEl.innerHTML = c.pw.map(p => `<button type="button" data-pw="${p}">${p >= 1000 ? fmt(p / 1000) + ' Вт' : p + ' мВт'}</button>`).join(''); pwEl.dataset.ch = key; }
  pressSeg(pwEl, 'pw', LAB.pw[key]);
  $('labRateRow').hidden = !c.rates;
  if (c.rates) {
    const rt = $('labRate');
    if (rt.dataset.ch !== key) { rt.innerHTML = c.rates.map(([hz, sn]) => `<button type="button" data-rate="${hz}">${hz} Гц <small>${sn}</small></button>`).join(''); rt.dataset.ch = key; }
    pressSeg(rt, 'rate', LAB.rate[key]);
  }
  labSyncSliders();
  $('labOrbit').setAttribute('aria-pressed', String(LAB.orbit)); $('labRock').setAttribute('aria-pressed', String(LAB.rock));
  $('labShow').querySelectorAll('[data-show]').forEach(b => b.setAttribute('aria-pressed', String(!!LAB.show[b.dataset.show])));
  pressSeg($('labSrc'), 'src', LAB.src === 'tx' ? c.tx : LAB.src);
  ['labShow', 'labSrc', 'labOrbit', 'labRock'].forEach(id => $(id).toggleAttribute('data-off', !ok3d));
}
function labReadout(r) {
  const v = labVerdict(r), rows = [
    ['Передавач', `${r.pw >= 1000 ? fmt(r.pw / 1000) + ' Вт' : r.pw + ' мВт'} = ${fmt1(r.ptx)} дБм`],
    [`Антена передавача (${r.tx.side === 'st' ? 'станція' : 'дрон'})`, `${r.tx.a.name} · ${sgn1(r.gT)} дБі`],
    ['Втрати на відстані', `${fmtKm(r.dSl)} · −${fmt1(r.fspl)} дБ`],
    ['Поляризація', `${r.pol.txt} · ${r.pol.db < 0.05 ? '0' : '−' + fmt1(r.pol.db)} дБ`]
  ];
  if (r.lBand) rows.push(['Чужий діапазон', `−${r.lBand} дБ`]);
  if (r.lHor) rows.push(['За радіогоризонтом', `−${r.lHor} дБ`]);
  rows.push([`Антена приймача (${r.rx.side === 'st' ? 'станція' : 'дрон'})`, `${r.rx.a.name} · ${sgn1(r.gR)} дБі`],
    ['Рівень на приймачі', `${fmt1(r.prx)} дБм`], ['Поріг чутливості', `${r.sens} дБм`],
    ['Дальність із запасом 10 дБ', r.dmax < 0.05 ? 'менше 50 м' : r.dmax > r.hor ? `≈${fmtKm(r.hor)} — радіогоризонт` : `≈${fmtKm(r.dmax)}`]);
  const vEl = $('labVerdict'); vEl.className = 'lab-verdict ' + v.cls;
  setHTML(vEl, `<b>${v.t}</b><span>${v.s}</span><em>запас ${sgn1(r.margin)} дБ</em>`);
  setHTML($('labBudget'), rows.map(([k, x]) => `<dt>${k}</dt><dd>${x}</dd>`).join(''));
  const lab = { ok: 'Добре', warn: 'Увага', bad: 'Проблема', info: 'Факт' };
  setHTML($('labWhy'), labReasons(r).map(([s, t]) => `<li class="${s}"><span class="sev ${s}">${lab[s]}</span><span>${t}</span></li>`).join(''));
  const fx = labFixText(r), fe = $('labFix'); fe.hidden = !fx; setHTML(fe, fx ? `<b>Як виправити.</b> ${fx}` : '');
  const hud = $('labHud'); hud.className = 'lab-hud ' + v.cls;
  setText($('lhV'), v.t); setText($('lhS'), `${r.c.name} · ${r.tx.side === 'dr' ? 'дрон → станція' : 'станція → дрон'}`);
  setText($('lhQ'), `запас ${sgn1(r.margin)} дБ`);
  setText($('lhP'), `${fmt1(r.prx)} дБм`); setText($('lhT'), `${r.sens} дБм`); setText($('lhM'), `${sgn1(r.margin)} дБ`);
  const w = `${clamp((r.margin + 20) / 60 * 100, 2, 100).toFixed(1)}%`, bar = $('lhBar'); if (bar.style.width !== w) bar.style.width = w;
}
function labChanged(resetScen) {
  if (resetScen) LAB.scen = null;
  LAB.dirty = true;
  labRenderControls();
  if (!ok3d || S.mode !== 'antennas') { LAB.res = labSolve(); labReadout(LAB.res); }
}
function labSetChannel(id) {
  LAB.ch = id; LAB.src = 'tx'; LAB.scen = null;
  labSetAnts(); labChanged();
  if (ok3d && S.mode === 'antennas') { LAB.res = labSolve(); labFrame('link'); }
}
function labScenario(id) {
  const s = SCEN.find(q => q.id === id); if (!s) return;
  LAB.ch = s.ch; LAB.sel[s.ch] = { st: s.st, sh: s.sh || 1, dr: s.dr, dh: s.dh || 1 };
  Object.assign(LAB, { dist: s.dist, alt: s.alt, az: 0, roll: 0, aim: s.aim || 'fixed', orbit: !!s.orbit, rock: !!s.rock, rockT: 0, src: 'tx', scen: id });
  LAB.pw[s.ch] = LCH[s.ch].pw0; if (s.rate) LAB.rate[s.ch] = s.rate;
  Object.assign(LAB.show, { pat: true, wave: true, pol: true });
  labSetAnts(); labChanged();
  if (ok3d && S.mode === 'antennas') { LAB.res = labSolve(); labApply(LAB.res); labFrame(LAB.orbit ? 'orbit' : 'link'); }
}
function labFocus(side) {
  LAB.src = side; LAB.show.wave = true; LAB.show.pat = true; labChanged();
  if (ok3d && S.mode === 'antennas') { LAB.res = labSolve(); labApply(LAB.res); labFrame(side); }
}
/* відкрити стенд з антеною, що стоїть на дроні в конфігураторі */
function labOpenFrom(kind) {
  if (kind === 'vtx') { LAB.ch = 'video'; LAB.sel.video.dr = opt('vtxant').lab || 'lolli58'; }
  else {
    const a = opt('rx').ant;
    LAB.ch = a === 'imt' ? 'e9' : 'e24';
    LAB.sel[LAB.ch].dr = a === 'imt' ? 'imt9' : (a === 'ceramic' || a === 'aio') ? 'cer24' : 'dip24';
  }
  LAB.src = 'dr'; LAB.scen = null; LAB.orbit = LAB.rock = false;
  if (S.drawerOpen) closeDrawer();
  if (S.mode !== 'antennas') setMode('antennas'); else { labSetAnts(); LAB.dirty = true; }
  labChanged();
  if (ok3d) { LAB.res = labSolve(); labApply(LAB.res); labFrame('dr'); }
}
function labUIInit() {
  $('labCh').innerHTML = Object.entries(LCH).map(([id, c]) => `<button type="button" data-ch="${id}">${c.name}</button>`).join('');
  $('labScen').innerHTML = SCEN.map(s => `<button type="button" data-scen="${s.id}">${s.name}</button>`).join('');
  $('antPanel').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.ch) labSetChannel(d.ch);
    else if (d.scen) labScenario(d.scen);
    else if (d.hand) { LAB.sel[LAB.ch][b.parentElement.id === 'labStHand' ? 'sh' : 'dh'] = +d.hand; labSetAnts(); labChanged(true); }
    else if (d.aim) { LAB.aim = d.aim; labChanged(true); }
    else if (d.pw) { LAB.pw[LAB.ch] = +d.pw; labChanged(true); }
    else if (d.rate) { LAB.rate[LAB.ch] = +d.rate; labChanged(true); }
    else if (d.show) { LAB.show[d.show] = !LAB.show[d.show]; labChanged(); }
    else if (d.src) { LAB.src = d.src; labChanged(); }
    else if (d.focus) labFocus(d.focus);
    else if (b.id === 'labOrbit') { LAB.orbit = !LAB.orbit; if (LAB.orbit && ok3d && S.mode === 'antennas') labFrame('orbit'); labChanged(); }
    else if (b.id === 'labRock') { LAB.rock = !LAB.rock; LAB.rockT = Math.asin(clamp(LAB.roll / 85, -1, 1)) / 0.8; labChanged(); }
  });
  $('labStAnt').addEventListener('change', e => { LAB.sel[LAB.ch].st = e.target.value; labSetAnts(); labChanged(true); if (ok3d && S.mode === 'antennas') { LAB.res = labSolve(); labFrame('link'); } });
  $('labDrAnt').addEventListener('change', e => { LAB.sel[LAB.ch].dr = e.target.value; labSetAnts(); labChanged(true); });
  $('labDist').addEventListener('input', e => { LAB.dist = xToDist(+e.target.value); labChanged(true); });
  $('labAlt').addEventListener('input', e => { LAB.alt = +e.target.value; labChanged(true); });
  $('labAz').addEventListener('input', e => { LAB.az = +e.target.value; LAB.orbit = false; labChanged(true); });
  $('labRoll').addEventListener('input', e => { LAB.roll = +e.target.value; LAB.rock = false; labChanged(true); });
  labRenderControls(); LAB.res = labSolve(); labReadout(LAB.res);
}
