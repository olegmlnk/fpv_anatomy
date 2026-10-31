/* Курс по БПЛА · розділ «Антени» → «Ретранслятор»: зв’язок станції з дроном за пагорбом напряму й через
 * ретранслятор на вершині; бюджет кожного прольоту, дифракція на перешкоді, цифровий і аналоговий ретранслятор,
 * розв’язка частот. Анімація будови ретранслятора й проходження сигналу через його вузли.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content → options → core → builders → whoop → anim → demos → signals → antlab → relay → radio → guides → ui */
'use strict';
/* ================= РЕТРАНСЛЯТОР ================= */
const RLY = {
  ch: 'e24', on: true, kind: 'digital', freq: 'diff', d1: 1.5, d2: 2.0, hill: 120, alt: 40, pw: { e24: 250, e9: 250, video: 600 },
  view: 'link', ex: 0, t: 0, scen: 'top', res: null, dirty: true, fres: true
};
/* підсилення антен (дБі): станція, ретранслятор (кожна з двох), дрон */
const RLY_G = { e24: { st: 2.15, rep: 2.15, dr: 2.15, ant: 'диполі' }, e9: { st: 2.15, rep: 2.15, dr: 2.15, ant: 'диполі' }, video: { st: 8.5, rep: 8.5, dr: 2.2, ant: 'патчі на станції й ретрансляторі, Lollipop на дроні' } };
const RLY_SCEN = [
  { id: 'none', name: 'Без ретранслятора', set: { on: false, ch: 'e24', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Дрон за пагорбом: пряма лінія впирається в схил. Сигнал лише огинає вершину (дифракція), втрачаючи десятки децибел, — керування немає, хоча до дрона лише 3,5 км.' },
  { id: 'top', name: 'Ретранслятор на вершині', set: { on: true, kind: 'digital', freq: 'diff', ch: 'e24', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Ретранслятор на вершині бачить і станцію, і дрон. Кожен проліт має пряму видимість і власний бюджет; цифровий ретранслятор відновлює пакети, тож загальний запас дорівнює запасу слабшого прольоту.' },
  { id: 'analog', name: 'Аналоговий', set: { on: true, kind: 'analog', freq: 'diff', ch: 'video', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Аналоговий відеоретранслятор підсилює сигнал разом із шумом першого прольоту. Шуми прольотів додаються, тож картинка гірша, ніж на слабшому прольоті окремо, — до 3 дБ, коли прольоти рівні.' },
  { id: 'same', name: 'Той самий канал', set: { on: true, kind: 'digital', freq: 'same', ch: 'e24', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Ретранслятор приймає й передає на тому самому каналі одночасно. Його власний передавач за метр від приймальної антени в мільйони разів сильніший за сигнал станції — приймач глухне. Потрібні різні частоти з фільтрами або почергова робота (TDD).' },
  { id: 'e9', name: '900 МГц огинає', set: { on: false, ch: 'e9', d1: 1.5, d2: 2, hill: 120, alt: 40 }, note: 'Той самий пагорб на 868/915 МГц: довша хвиля краще огинає вершину, а чутливість вища. Пряма лінія працює навіть без ретранслятора, хоча запас невеликий і сильно залежить від рельєфу.' },
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
  { id: 'pwr', name: 'Живлення', d: 'батарея й DC-DC', ex: [0, -1.5, 1.6] }
];

/* ---------- фізика ---------- */
/* дифракція на одиночній «ножовій» перешкоді, ITU-R P.526: v = h·√(2(d1+d2)/(λ·d1·d2)) */
function knifeLoss(h, d1m, d2m, lam) {
  const v = h * Math.sqrt(2 * (d1m + d2m) / (lam * d1m * d2m));
  return { v, j: v <= -0.78 ? 0 : 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) * (v - 0.1) + 1) + v - 0.1) };
}
const fsplDb = (km, f) => 20 * Math.log10(Math.max(km, 0.001)) + 20 * Math.log10(f) + 32.44;
function relSolve() {
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

/* ---------- 3D ---------- */
let relG = null, relHillMesh = null, relStA, relDrA, relRepG, relParts = {}, relLines = {}, relPk = [], relShadow, relFres = [], relFlow = [];
const RL = { K: 0, V: 0.16 };
const relX = km => (22 + 16 * Math.log(1 + km));
function relHillH(x, z) { const s = 9.5; return (RLY.hill * RL.V) * Math.exp(-x * x / (2 * s * s)) / (1 + Math.pow(z / 46, 6)); }
function relBuildHill() {
  if (relHillMesh) { relG.remove(relHillMesh); relHillMesh.geometry.dispose(); }
  const g = new T.PlaneGeometry(240, 150, 96, 60); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), lo = C('#6f8762'), hi = C('#9c8a6c'), c = new T.Color();
  const Hm = Math.max(1, RLY.hill * RL.V);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = relHillH(x, z); p.setY(i, h);
    c.copy(lo).lerp(hi, clamp(h / Hm, 0, 1)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new T.BufferAttribute(col, 3)); g.computeVertexNormals();
  const fade = new T.CanvasTexture(document.createElement('canvas'));
  const cv = fade.image; cv.width = cv.height = 256; const x = cv.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, 256, 256);
  const gr = x.createRadialGradient(128, 128, 70, 128, 128, 128); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  relHillMesh = new T.Mesh(g, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, transparent: true, alphaMap: fade, depthWrite: true }));
  relHillMesh.renderOrder = -1; relG.add(relHillMesh);
}
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
/* ретранслятор: тринога, щогла, корпус з вузлами всередині й дві антени */
function relRepeater(parent) {
  const g = new T.Group(); parent.add(g);
  const alu = new T.MeshStandardMaterial({ color: C('#a9b0b7'), roughness: 0.35, metalness: 0.9 });
  const shell = new T.MeshStandardMaterial({ color: C('#d6d1c2'), roughness: 0.6, transparent: true, opacity: 1 });
  for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3 + 0.3; rod(g, [Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5], [0, 2.2, 0], 0.06, alu); }
  mesh(g, cyl(0.09, 0.09, 2.4, 10), alu, [0, 3.2, 0]);
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
  const antBuild = (o, sx) => {
    mesh(o, cyl(0.05, 0.05, 0.5, 8), LM.black, [0, 0.25, 0]);
    const vid = RLY.ch === 'video';
    if (vid) { const p = mesh(o, box(0.9, 0.9, 0.12), new T.MeshStandardMaterial({ color: C('#2e3338'), roughness: 0.6 }), [0, 0.95, 0]); p.rotation.y = sx * Math.PI / 2; }
    else { mesh(o, cyl(0.05, 0.05, 1.6, 8), LM.black, [0, 1.25, 0]); mesh(o, cyl(0.07, 0.07, 0.25, 8), LM.black, [0, 1.25, 0]); }
  };
  P('antRx', o => { o.position.set(-1.45, 0.6, 0); antBuild(o, -1); });
  P('antTx', o => { o.position.set(1.45, 0.6, 0); antBuild(o, 1); });
  const aR = new T.Object3D(), aT = new T.Object3D(); aR.position.set(0, 1.2, 0); aT.position.set(0, 1.2, 0);
  relParts.antRx.g.add(aR); relParts.antTx.g.add(aT);
  return { g, head, base, aR, aT };
}
function relInit() {
  relG = new T.Group(); relG.visible = false; scene.add(relG);
  const ground = new T.Mesh(new T.CircleGeometry(130, 96), new T.MeshBasicMaterial({ map: labGroundTex, transparent: true, depthWrite: false, toneMapped: false }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.03; ground.renderOrder = -3; relG.add(ground);
  relBuildHill();
  relStA = relStation(relG); relDrA = relDroneModel(relG); relRepG = relRepeater(relG);
  const lm = col => new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  ['dir', 'h1', 'h2'].forEach(k => { const m = new T.Mesh(cyl(1, 1, 1, 8), lm(0xffffff)); m.renderOrder = 6; relG.add(m); relLines[k] = m; });
  for (let i = 0; i < 14; i++) { const s = glowSprite('#ffffff', 2.2); s.material.depthTest = false; s.renderOrder = 998; s.visible = false; relG.add(s); relPk.push({ s, t: i / 14 }); }
  for (let i = 0; i < 6; i++) { const s = glowSprite('#ffffff', 0.55); s.material.depthTest = false; s.renderOrder = 999; s.visible = false; relG.add(s); relFlow.push(s); }
  relShadow = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, side: T.DoubleSide, depthWrite: false, toneMapped: false }));
  relShadow.renderOrder = 2; relG.add(relShadow);
  relLines.edge = new T.Mesh(cyl(1, 1, 1, 6), lm(0xffffff)); relLines.edge.renderOrder = 6; relLines.edge.material.opacity = 0.55; relG.add(relLines.edge);
  for (let i = 0; i < 2; i++) {
    const f = new T.Mesh(new T.SphereGeometry(1, 28, 14), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false, toneMapped: false }));
    f.renderOrder = 3; relG.add(f); relFres.push(f);
  }
}
function relEnter() {
  if (!relG) return;
  labG.visible = false; relG.visible = true; ctl.auto = false; updateSpinBtn();
  RLY.dirty = true; RLY.res = relSolve(); relApply(RLY.res); relReadout(RLY.res); relFrame();
}
function relExit() {
  if (relG) relG.visible = false;
  for (const [k, e] of LB) if (k.startsWith('rel')) e.on = false;
}
function relTheme() { RLY.dirty = true; }
function rodTo(m, a, b, r) { const d = b.clone().sub(a), len = d.length(); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); m.scale.set(r, len, r); }
function relLayout() {
  const x1 = -relX(RLY.d1), x2 = relX(RLY.d2), hTop = relHillH(0, 0);
  relStA.g.position.set(x1, 0, 0);
  relRepG.g.position.set(0, hTop - 0.1, 0);
  relDrA.g.position.set(x2, Math.max(1.2, RLY.alt * RL.V), 0);
  relDrA.g.rotation.y = -Math.PI / 2;
  return { x1, x2, hTop };
}
function relApply(r) {
  if (!ok3d || !relG) return;
  const L = relLayout(), v = relVerdict(r.margin);
  relG.updateMatrixWorld(true);
  const S = relStA.a.getWorldPosition(new T.Vector3()), D = relDrA.a.getWorldPosition(new T.Vector3());
  const AR = relRepG.aR.getWorldPosition(new T.Vector3()), AT = relRepG.aT.getWorldPosition(new T.Vector3());
  const col = k => C(TC['--' + k]);
  const vD = relVerdict(r.mDir), v1 = relVerdict(r.m1), v2 = relVerdict(r.m2);
  rodTo(relLines.dir, S, D, RLY.on ? 0.035 : 0.06); relLines.dir.material.color.copy(col(vD.cls)); relLines.dir.material.opacity = RLY.on ? 0.35 : 0.9;
  rodTo(relLines.h1, S, AR, 0.06); rodTo(relLines.h2, AT, D, 0.06);
  const relCls = r.why === 'self' ? 'bad' : null;
  relLines.h1.material.color.copy(col(relCls || v1.cls)); relLines.h2.material.color.copy(col(relCls || v2.cls));
  relLines.h1.visible = relLines.h2.visible = RLY.on && RLY.view === 'link';
  relLines.dir.visible = RLY.view === 'link';
  /* радіотінь за вершиною з боку станції */
  const top = new T.Vector3(0, L.hTop, 0), far = L.x2 + 10, k = (top.y - S.y) / (top.x - S.x), yFar = top.y + k * (far - top.x);
  const sh = [new T.Vector3(1.5, L.hTop * 0.98, 0), new T.Vector3(far, Math.max(0, yFar), 0), new T.Vector3(far, 0, 0), new T.Vector3(12, 0, 0)];
  const geo = new T.BufferGeometry().setFromPoints([sh[0], sh[1], sh[2], sh[0], sh[2], sh[3]]);
  relShadow.geometry.dispose(); relShadow.geometry = geo; relShadow.material.color.copy(col('bad'));
  relShadow.visible = RLY.view === 'link' && yFar > 0.5;
  rodTo(relLines.edge, S, new T.Vector3(far, yFar, 0), 0.025); relLines.edge.material.color.copy(col('bad')); relLines.edge.visible = relShadow.visible;
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
  lb('relSh', 'радіотінь', 'tag sm', new T.Vector3(L.x2 * 0.55 + 8, Math.max(0.8, (yFar > 0 ? (top.y + k * (L.x2 * 0.55 + 8)) * 0.4 : 0.8)), 0), vis && relShadow.visible && !narrowMQ.matches);
  for (const p of RLY_PARTS) lb('relC_' + p.id, `<b>${p.name}</b><span class="lx"> · ${p.d}</span>`, 'tag', null, false);
  void v;
}
function relAnimate(dt, now) {
  const r = RLY.res; if (!r) return;
  RLY.ex += ((RLY.view === 'build' ? 1 : 0) - RLY.ex) * (1 - Math.exp(-dt * 4));
  const e = smooth(0, 1, RLY.ex);
  relRepG.head.scale.setScalar(1 + 1.2 * e);
  for (const [id, p] of Object.entries(relParts)) {
    p.g.position.copy(p.base).addScaledVector(p.ex, id === 'lid' ? e : e);
    if (id === 'lid') { p.mat.opacity = 1 - 0.75 * e; p.mat.depthWrite = e < 0.5; }
  }
  const head = relRepG.head;
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
  void head;
  /* пакети вздовж ліній */
  relG.updateMatrixWorld(true);
  const S = relStA.a.getWorldPosition(new T.Vector3()), D = relDrA.a.getWorldPosition(new T.Vector3());
  const AR = relRepG.aR.getWorldPosition(new T.Vector3()), AT = relRepG.aT.getWorldPosition(new T.Vector3());
  const from = r.vid ? D : S, to = r.vid ? S : D;
  const L = relLayout();
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
      const xHill = 0, past = r.vid ? pos.x < xHill : pos.x > xHill;
      if (r.hObs > 0 && past) alpha = Math.max(0, 1 - Math.abs(pos.x - xHill) / 12) * clamp(r.mDir / 10 + 1, 0, 1);
    }
    p.s.visible = alpha > 0.02; if (!p.s.visible) return;
    p.s.position.copy(pos); p.s.material.opacity = alpha;
  });
  void L; void now;
}
function tickRel(dt, now) {
  if (!relG) return;
  RLY.t += reduceMotion ? 0 : dt;
  if (RLY.dirty || !RLY.res) { RLY.dirty = false; RLY.res = relSolve(); relApply(RLY.res); relReadout(RLY.res); }
  relAnimate(dt, now);
}
function relFrame() {
  if (!ok3d || !relG) return;
  if (RLY.view === 'build') { const h = relRepG.head.getWorldPosition(new T.Vector3()); setView(h.clone().add(new T.Vector3(0, 1.0, 1.5)), 0.12, 0.26, fitDist(9.8)); return; }
  const x1 = -relX(RLY.d1), x2 = relX(RLY.d2);
  setView(new T.Vector3((x1 + x2) / 2, Math.max(6, RLY.hill * RL.V * 0.55), 0), 0.38, 0.3, fitDist((x2 - x1) / 2 + 10));
}

/* ---------- панель ---------- */
function relReadout(r) {
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
function relSync() {
  const set = (id, val, out) => { const el = $(id); if (el && +el.value !== val) el.value = val; setText($(id + 'Out'), out); };
  set('relD1', Math.round(RLY.d1 * 10), fmtKm(RLY.d1)); set('relD2', Math.round(RLY.d2 * 10), fmtKm(RLY.d2));
  set('relHill', RLY.hill, `${fmt(RLY.hill)} м`); set('relAlt', RLY.alt, `${fmt(RLY.alt)} м`);
  pressSeg($('relCh'), 'rch', RLY.ch); pressSeg($('relOn'), 'ron', RLY.on ? '1' : '0');
  pressSeg($('relKind'), 'rkind', RLY.kind); pressSeg($('relFreq'), 'rfreq', RLY.freq); pressSeg($('relView'), 'rview2', RLY.view);
  pressSeg($('relScen'), 'rscn', RLY.scen || '');
  const sc = RLY_SCEN.find(q => q.id === RLY.scen), note = $('relScenNote'); note.hidden = !sc; if (sc) setText(note, sc.note);
  $('relFres').setAttribute('aria-pressed', String(RLY.fres));
  const pwEl = $('relPw'), c = LCH[RLY.ch];
  if (pwEl.dataset.ch !== RLY.ch) { pwEl.innerHTML = c.pw.map(p => `<button type="button" data-rpw="${p}">${p >= 1000 ? fmt(p / 1000) + ' Вт' : p + ' мВт'}</button>`).join(''); pwEl.dataset.ch = RLY.ch; }
  pressSeg(pwEl, 'rpw', RLY.pw[RLY.ch]);
}
function relChanged(rebuild, keepScen) {
  if (!keepScen) RLY.scen = null;
  if (rebuild && ok3d && relG) { relBuildHill(); relRebuildAnts(); }
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
  const prevCh = RLY.ch;
  Object.assign(RLY, { on: true, kind: 'digital', freq: 'diff' }, s.set); RLY.scen = id;
  if (RLY.view === 'build') RLY.view = 'link';
  relChanged(true, true);
  if (ok3d && S.mode === 'antennas' && LAB.sub === 'relay') { RLY.res = relSolve(); relApply(RLY.res); relReadout(RLY.res); relFrame(); }
  void prevCh;
}
function relSetSub(sub) {
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
function relUIInit() {
  if (!$('relBody')) return;
  $('relCh').innerHTML = Object.entries(LCH).map(([id, c]) => `<button type="button" data-rch="${id}">${c.name}</button>`).join('');
  $('relScen').innerHTML = RLY_SCEN.map(s => `<button type="button" data-rscn="${s.id}">${s.name}</button>`).join('');
  $('antSub').addEventListener('click', e => { const b = e.target.closest('[data-asub]'); if (b) relSetSub(b.dataset.asub); });
  $('relBody').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if (d.rch) { RLY.ch = d.rch; relChanged(true); }
    else if (d.ron) { RLY.on = d.ron === '1'; relChanged(); }
    else if (d.rkind) { RLY.kind = d.rkind; relChanged(); }
    else if (d.rfreq) { RLY.freq = d.rfreq; relChanged(); }
    else if (d.rpw) { RLY.pw[RLY.ch] = +d.rpw; relChanged(); }
    else if (d.rscn) relScenario(d.rscn);
    else if (d.rview2) { RLY.view = d.rview2; relSync(); RLY.dirty = true; if (ok3d && S.mode === 'antennas') relFrame(); }
    else if (b.id === 'relFres') { RLY.fres = !RLY.fres; relChanged(false, true); }
  });
  $('relD1').addEventListener('input', e => { RLY.d1 = +e.target.value / 10; relChanged(); });
  $('relD2').addEventListener('input', e => { RLY.d2 = +e.target.value / 10; relChanged(); });
  $('relHill').addEventListener('input', e => { RLY.hill = +e.target.value; relChanged(true); });
  $('relAlt').addEventListener('input', e => { RLY.alt = +e.target.value; relChanged(); });
  relSync(); RLY.res = relSolve(); relReadout(RLY.res);
}
