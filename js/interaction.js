/* Анатомія FPV-дрона · взаємодія: камера, вибір і підсвітка, розбирання, сигнали, анімації, головний цикл.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * data.js → scene.js → interaction.js → ui.js */
'use strict';
/* ================= STATE, CAMERA, INTERACTION, DEMOS ================= */
const S = { hover: null, sel: null, ghost: false, explodeOn: false, ex: 0, signals: false, demo: null, tour: false, tourI: 0, tourT: 0, peekId: null, wiresVis: true };
const MOT = { mode: 'idle', dir: 'in', thr: 0.35, ang: [0, 0, 0, 0], vis: [0, 0, 0, 0], ti: 0, tt: 0 };
const FC = { mode: 'run', t: 0, prog: 0, usb: 0, usbT: 0, btn: 0, flashed: false };
const RX = { mode: 'nolink', t: 0, spawn: 0, tele: 0 };
const NAMES = ['задній правий', 'передній правий', 'задній лівий', 'передній лівий'];
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrowMQ = window.matchMedia('(max-width: 900px)');
function motorDirs() { const d = [-1, 1, 1, -1]; return MOT.dir === 'in' ? d : d.map(v => -v); }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

let ctl, raycaster, ndc, pickables = [], arrows = [], brkHover, brkSel, matTex, matMesh, shadowMesh, wbLine;
let usbG, radio, packets = [], rings = [], sigPaths = [], flashDots = [], flashCurve = null;

/* ---------- environment & mat ---------- */
function buildEnv() {
  const pm = new T.PMREMGenerator(renderer), env = new T.Scene();
  env.add(new T.Mesh(new T.BoxGeometry(40, 24, 40), new T.MeshBasicMaterial({ color: new T.Color(0.28, 0.3, 0.3), side: T.BackSide })));
  const panel = (w, h, pos, rot, k) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color().setScalar(k), side: T.DoubleSide }));
    m.position.set(pos[0], pos[1], pos[2]); m.rotation.set(rot[0], rot[1], rot[2]); env.add(m);
  };
  panel(28, 5, [0, 11.5, 0], [Math.PI / 2, 0, 0], 5);
  panel(8, 14, [-19.5, 2, 2], [0, Math.PI / 2, 0], 2.6);
  panel(8, 14, [19.5, 3, -6], [0, -Math.PI / 2, 0], 1.8);
  panel(16, 7, [0, 4, 19.5], [0, Math.PI, 0], 1.2);
  scene.environment = pm.fromScene(env, 0.035).texture;
  pm.dispose();
}
function drawMat() {
  const size = 1024, span = 52, px = size / span;
  const cnv = matTex ? matTex.image : document.createElement('canvas');
  cnv.width = cnv.height = size;
  const x = cnv.getContext('2d');
  x.clearRect(0, 0, size, size);
  for (let i = 0; i <= span; i++) {
    const p = Math.round(i * px) + 0.5, maj = (i - 1) % 5 === 0;
    x.strokeStyle = maj ? css('--mat-major') : css('--mat-minor'); x.lineWidth = maj ? 1.5 : 1;
    x.beginPath(); x.moveTo(p, 0); x.lineTo(p, size); x.stroke();
    x.beginPath(); x.moveTo(0, p); x.lineTo(size, p); x.stroke();
  }
  x.fillStyle = css('--mat-text'); x.font = '500 13px "IBM Plex Mono", monospace'; x.textAlign = 'center';
  const row = Math.round((span / 2 + 15) * px);
  for (let k = 0; k <= 7; k++) {
    const gx = Math.round((span / 2 - 17.5 + k * 5) * px);
    x.fillText(k === 7 ? '350 мм' : String(k * 50), gx, row + 16);
    x.fillRect(gx - 0.5, row - 8, 1.5, 12);
  }
  x.globalCompositeOperation = 'destination-in';
  const g = x.createRadialGradient(size / 2, size / 2, size * 0.16, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';
  if (matTex) matTex.needsUpdate = true;
  else { matTex = new T.CanvasTexture(cnv); matTex.encoding = T.sRGBEncoding; matTex.anisotropy = 8; }
}

/* ---------- overlay objects ---------- */
const basicMat = (hex, o = 1, extra = {}) => new T.MeshBasicMaterial(Object.assign({ color: C(hex), transparent: true, opacity: o, depthWrite: false, toneMapped: false }, extra));
function makeArrow() {
  const g = new T.Group(), inner = new T.Group(); inner.rotation.x = -Math.PI / 2; g.add(inner);
  const mat = basicMat('#ffffff', 0.95);
  const R = 2.5, arc = Math.PI * 1.35;
  inner.add(new T.Mesh(new T.TorusGeometry(R, 0.08, 8, 72, arc), mat));
  const cone = new T.Mesh(new T.ConeGeometry(0.28, 0.7, 16), mat);
  cone.position.set(R * Math.cos(arc), R * Math.sin(arc), 0); cone.rotation.z = arc; inner.add(cone);
  g.userData.mat = mat; g.visible = false; overlay.add(g);
  return g;
}
function makeBrackets(op) {
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(144), 3));
  const l = new T.LineSegments(geo, new T.LineBasicMaterial({ color: C(TC['--accent']), transparent: true, opacity: op, depthTest: false, toneMapped: false }));
  l.renderOrder = 999; l.frustumCulled = false; l.visible = false; overlay.add(l);
  return l;
}
function setBrackets(l, b) {
  const a = l.geometry.attributes.position.array, mn = b.min, mx = b.max;
  const sx = (mx.x - mn.x) * 0.22, sy = (mx.y - mn.y) * 0.22, sz = (mx.z - mn.z) * 0.22;
  let k = 0;
  for (const X of [mn.x, mx.x]) for (const Y of [mn.y, mx.y]) for (const Z of [mn.z, mx.z]) {
    const dx = X === mn.x ? sx : -sx, dy = Y === mn.y ? sy : -sy, dz = Z === mn.z ? sz : -sz;
    [[dx, 0, 0], [0, dy, 0], [0, 0, dz]].forEach(([u, v, w]) => { a[k++] = X; a[k++] = Y; a[k++] = Z; a[k++] = X + u; a[k++] = Y + v; a[k++] = Z + w; });
  }
  l.geometry.attributes.position.needsUpdate = true;
}
function makeUSB() {
  usbG = new T.Group(); usbG.visible = false; overlay.add(usbG);
  const metal = new T.MeshStandardMaterial({ color: C('#c9ced3'), metalness: 1, roughness: 0.25 });
  const mold = new T.MeshStandardMaterial({ color: C('#1c1f22'), roughness: 0.7 });
  const tip = new T.Mesh(box(0.7, 0.24, 0.8), metal); tip.position.x = -0.35; usbG.add(tip);
  const ov = new T.Mesh(box(1.0, 0.5, 1.0), mold); ov.position.x = -1.2; usbG.add(ov);
  const pts = [[-1.7, 0, 0], [-3.2, -0.2, 0.25], [-5.5, -1.0, 1.2], [-8.5, -1.7, 3.2], [-11, -1.8, 6]].map(v3);
  usbG.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 48, 0.15, 8, false), mold));
  usbG.userData.pts = pts;
  for (let i = 0; i < 9; i++) { const s = glowSprite('#ffffff', 0.6); s.material.depthTest = false; s.renderOrder = 998; s.visible = false; overlay.add(s); flashDots.push(s); }
}
function makeRadio() {
  radio = new T.Group(); radio.visible = false; overlay.add(radio);
  const body = new T.MeshStandardMaterial({ color: C('#2a2e33'), roughness: 0.55, metalness: 0.15 });
  const dark = new T.MeshStandardMaterial({ color: C('#16181b'), roughness: 0.7 });
  const scr = new T.MeshStandardMaterial({ color: C('#0d2238'), emissive: C('#2a6fd0'), emissiveIntensity: 0.7, roughness: 0.3 });
  const metal = new T.MeshStandardMaterial({ color: C('#b9bec4'), metalness: 1, roughness: 0.3 });
  const shell = new T.Mesh(new T.ExtrudeGeometry(rrect(8.6, 4.8, 1.3), { depth: 1.8, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2 }), body);
  shell.position.z = -0.9; radio.add(shell);
  const sc = new T.Mesh(box(2.6, 1.5, 0.08), scr); sc.position.set(0, 0.75, 1.12); radio.add(sc);
  for (const sx of [-1, 1]) {
    const ring = new T.Mesh(cyl(0.8, 0.8, 0.1, 32), dark); ring.rotation.x = Math.PI / 2; ring.position.set(sx * 2.75, -0.5, 1.12); radio.add(ring);
    const st = new T.Mesh(cyl(0.1, 0.1, 1.1, 10), metal); st.rotation.x = Math.PI / 2; st.position.set(sx * 2.75, -0.5, 1.65); radio.add(st);
    const cap = new T.Mesh(cyl(0.27, 0.27, 0.28, 16), dark); cap.rotation.x = Math.PI / 2; cap.position.set(sx * 2.75, -0.5, 2.25); radio.add(cap);
    const sw = new T.Mesh(cyl(0.08, 0.08, 0.7, 8), metal); sw.position.set(sx * 3.3, 2.75, 0.3); radio.add(sw);
  }
  const ant = new T.Mesh(cyl(0.2, 0.16, 3.0, 12), dark); ant.position.set(3.0, 3.8, -0.2); ant.rotation.z = -0.35; radio.add(ant);
  radio.userData.tip = new T.Vector3(3.0 + Math.sin(0.35) * 1.45, 3.8 + Math.cos(0.35) * 1.45, -0.2);
  for (let i = 0; i < 18; i++) { const s = glowSprite('#ffffff', 0.7); s.material.depthTest = false; s.renderOrder = 997; s.visible = false; overlay.add(s); packets.push({ s, t: 0, on: false, dir: 1 }); }
  for (let i = 0; i < 3; i++) {
    const r = new T.Mesh(new T.RingGeometry(0.9, 1.0, 64), basicMat('#3de07a', 0.8, { side: T.DoubleSide, depthTest: false }));
    r.renderOrder = 996; r.visible = false; overlay.add(r); rings.push(r);
  }
}
function makeWheelbase() {
  wbLine = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color: C(TC['--ink']), transparent: true, opacity: 0.45, toneMapped: false }));
  wbLine.geometry.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(18), 3));
  scene.add(wbLine);
}
function updateWheelbase() {
  const a = L.mp[3], b = L.mp[0], d = new T.Vector3().subVectors(b, a).normalize(), n = new T.Vector3(-d.z, 0, d.x).multiplyScalar(0.55), y = 0.03;
  const arr = wbLine.geometry.attributes.position.array;
  const P = [a.x, y, a.z, b.x, y, b.z, a.x + n.x, y, a.z + n.z, a.x - n.x, y, a.z - n.z, b.x + n.x, y, b.z + n.z, b.x - n.x, y, b.z - n.z];
  for (let i = 0; i < 18; i++) arr[i] = P[i];
  wbLine.geometry.attributes.position.needsUpdate = true;
  wbLine.geometry.computeBoundingSphere();
  const mm = Math.round(a.distanceTo(b) * 10);
  const e = label('wb', `колісна база ${mm} мм`, 'flat');
  e.pos = b.clone().addScaledVector(d, 7.4).setY(y);
  L.wb = mm;
}
function positionArrows() {
  arrows.forEach((g, i) => { const p = L.mp[i]; g.position.set(p.x, L.seatY + 1.3, p.z); g.userData.base = g.position.clone(); });
}
function updatePropHands() {
  const dirs = motorDirs(), pp = comps.props && comps.props.parts;
  dirs.forEach((d, i) => {
    if (pp && pp.hand && pp.hand[i]) pp.hand[i].scale.x = d < 0 ? -1 : 1;
    const g = arrows[i]; if (!g) return;
    g.scale.x = d < 0 ? -1 : 1;
    g.userData.mat.color.copy(C(d < 0 ? TC['--cw'] : TC['--ccw']));
  });
}

/* ---------- signals overlay ---------- */
function clearSignals() { sigPaths.forEach(p => p.sprites.forEach(s => { overlay.remove(s); s.material.dispose(); })); sigPaths = []; }
function buildSignals() {
  clearSignals();
  const addP = (key, pts, n, speed = 3.2) => {
    const curve = new T.CatmullRomCurve3(pts.map(v3)), len = curve.getLength(), sprites = [];
    const cnt = Math.max(2, Math.round(n || len / 1.4));
    for (let i = 0; i < cnt; i++) { const s = glowSprite(TC[key], 0.62); s.material.color.copy(C(TC[key])); s.material.depthTest = false; s.renderOrder = 995; overlay.add(s); sprites.push(s); }
    sigPaths.push({ curve, len, speed, sprites, off: Math.random() });
  };
  addP('--sig-power', [[-0.6, 3.9, 3.4], [-1.55, 3.82, 4.5], [-2.3, 2.6, 5.5], [-2.3, 1.05, 3.2], [-0.45, 0.9, 1.9], [0, 0.86, 0.3]]);
  addP('--sig-power', [[0.3, 0.86, 0.3], [1.25, 1.3, 1.8], [0.3, 1.9, 0.3]], 3);
  addP('--sig-power', [[1.3, 1.85, 1.6], [1.6, 1.0, 2.2], [1.5, 0.5, 2.6]], 3);
  addP('--sig-power', [[-1.1, 1.85, 1.75], [-1.25, 1.75, 2.35], [-0.6, 1.55, 3.3]], 3);
  addP('--sig-ctrl', [[1.5, 0.55, 3.1], [1.6, 0.95, 2.0], [1.35, 1.85, 1.5], [0.15, 1.95, 0.3]]);
  if (cfg.gps !== 'none') addP('--sig-ctrl', [[0, 3.95, 4.2], [-1.1, 2.8, 3.2], [-0.9, 1.9, 1.8], [0.15, 1.95, 0.3]]);
  const ant = (comps.rx.parts.antPts || [])[0];
  if (ant) addP('--sig-ctrl', [ant, [(ant.x + 1.5) / 2, (ant.y + 0.6) / 2 + 0.5, (ant.z + 3.6) / 2], [1.5, 0.55, 3.6]], 4);
  addP('--sig-motor', [[0.15, 1.95, 0.3], [0.9, 1.4, -0.6], [0.5, 0.9, 0.3]], 3);
  L.mp.forEach(p => {
    const s = armStart(p), sx = Math.sign(p.x), sz = Math.sign(p.z);
    addP('--sig-motor', [[0, 0.88, 0.3], [sx * 1.6, 0.92, 0.3 + sz * 1.25], [s.x + (p.x - s.x) * 0.5, 0.7, s.y + (p.z - s.y) * 0.5], [p.x, 1.1, p.z]]);
  });
  const vin = comps.vtx.parts.input;
  addP('--sig-video', [[0, 1.75, -3.65], [-0.75, 2.55, -3.1], [-1.95, 2.55, -1.2], [-1.95, 2.45, 1.9], vin]);
  (comps.vtxant.parts.tips || []).forEach((tip, i) => {
    const from = (comps.vtx.parts.conns || [])[i] || comps.vtx.parts.conns[0];
    const dir = tip.clone().sub(new T.Vector3(0, 1.9, 5.7)).normalize();
    addP('--sig-video', [from, [tip.x * 0.5, 2.0, 5.6], tip, tip.clone().addScaledVector(dir, 4)], 5, 3.6);
  });
}
function tickSignals(dt) {
  for (const p of sigPaths) {
    p.off = (p.off + p.speed * dt / p.len) % 1;
    const n = p.sprites.length;
    p.sprites.forEach((s, i) => { const t = (p.off + i / n) % 1; p.curve.getPointAt(t, s.position); s.material.opacity = Math.min(1, Math.sin(t * Math.PI) * 2.2); });
  }
}

/* ---------- look: hover, selection, ghosting ---------- */
function ghostIds() {
  const g = new Set();
  if (S.ghost && S.sel) for (const id of ORDER) if (id !== S.sel) g.add(id);
  return g;
}
function applyLook() {
  if (!ok3d) return;
  const gs = ghostIds(), acc = C(TC['--accent']);
  for (const id of ORDER) {
    const c = comps[id]; if (!c) continue;
    const ghost = gs.has(id), hov = S.hover === id, sel = S.sel === id && !S.demo;
    c.ghost = ghost;
    const dim = S.signals ? 0.3 : 1;
    for (const m of c.mats) {
      const u = m.userData; if (!u || u.blur) continue;
      const tr = ghost || u.tr || S.signals;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      if (!u.dyn) m.opacity = (ghost ? u.o * (m.map ? 0.035 : 0.075) : u.o) * dim;
      m.depthWrite = (ghost || S.signals) ? false : u.dw;
      if (!u.keep) {
        if (hov || sel) { m.emissive.copy(acc); m.emissiveIntensity = hov ? 0.2 : 0.06; }
        else { m.emissive.copy(u.em); m.emissiveIntensity = u.ei; }
      }
    }
  }
}
function compBox(id) {
  const c = comps[id], b = new T.Box3().setFromObject(c.g);
  if (b.isEmpty() && c.parts.anchor) { b.setFromCenterAndSize(c.parts.anchor.clone().add(c.g.position), new T.Vector3(1.9, 0.9, 1.9)); }
  return b;
}
function anchorOf(id) { return compBox(id).getCenter(new T.Vector3()); }
function calloutPos(id) {
  let p;
  const m3 = L.mp[3], b = opt('battery');
  switch (id) {
    case 'frame': { const m = L.mp[2], s = armStart(m); p = new T.Vector3((s.x + m.x) / 2, 1.0, (s.y + m.z) / 2); break; }
    case 'motors': p = L.mp[1].clone().setY(L.seatY + 0.2); break;
    case 'props': { const d = m3.clone().setY(0).normalize(); p = m3.clone().addScaledVector(d, 3.6).setY(L.seatY + 0.9); break; }
    case 'esc': p = new T.Vector3(2.1, 0.95, -1.5); break;
    case 'fc': p = new T.Vector3(-2.1, 1.95, -1.5); break;
    case 'rx': p = new T.Vector3(1.6, 0.95, 3.4); break;
    case 'vtx': p = new T.Vector3(-0.4, 2.4, 4.1); break;
    case 'vtxant': p = ((comps.vtxant.parts.tips || [])[0] || new T.Vector3(0, 4, 7.8)).clone().add(new T.Vector3(0, 0.9, 0)); break;
    case 'cam': p = new T.Vector3(0, 3.0, -4.6); break;
    case 'battery': p = new T.Vector3(0, 3.47 + b.dim[1] + 0.6, 3.45 - b.dim[2] / 2); break;
    case 'power': p = new T.Vector3(-1.6, 4.6, 4.5); break;
    default: p = new T.Vector3(0, 4.4, 4.5);
  }
  return p.add(comps[id].g.position);
}

/* ---------- camera ---------- */
function fitDist(r) {
  const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  return r / Math.sin(Math.min(vf, hf) / 2);
}
function setView(target, yaw, pitch, dist) {
  if (target) ctl.tTarget.copy(target);
  if (yaw != null) ctl.tYaw = ctl.yaw + wrapPi(yaw - ctl.yaw);
  if (pitch != null) ctl.tPitch = pitch;
  if (dist != null) ctl.tDist = dist;
}
function homeView() { setView(new T.Vector3(0, 2.2, 0.3), 2.45, 0.44, fitDist(17)); }
function focusComp(id, yaw, pitch) {
  const b = compBox(id), sph = b.getBoundingSphere(new T.Sphere());
  setView(sph.center, yaw, pitch, Math.min(70, Math.max(7.5, fitDist(Math.max(1.8, sph.radius) * 1.12))));
}

/* ---------- labels & peek ---------- */
const LB = new Map();
function label(key, html, cls) {
  let e = LB.get(key);
  if (!e) { const el = document.createElement('div'); el.className = 'lbl'; labelsEl.appendChild(el); e = { el, pos: null, on: true, html: null, cls: null }; LB.set(key, e); }
  if (html != null && e.html !== html) { e.el.innerHTML = html; e.html = html; }
  if (cls != null && e.cls !== cls) { e.el.className = 'lbl ' + cls; e.cls = cls; }
  return e;
}
function toScreen(v) {
  const p = v.clone().project(camera);
  return { x: (p.x + 1) / 2 * stageEl.clientWidth, y: (1 - p.y) / 2 * stageEl.clientHeight, vis: p.z > -1 && p.z < 1 };
}
function updateLabels() {
  for (const e of LB.values()) {
    if (!e.on || !e.pos) { if (e.shown !== false) { e.el.style.display = 'none'; e.shown = false; } continue; }
    const s = toScreen(typeof e.pos === 'function' ? e.pos() : e.pos);
    if (!s.vis) { e.el.style.display = 'none'; e.shown = false; continue; }
    if (e.shown !== true) { e.el.style.display = ''; e.shown = true; }
    e.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}
const peekEl = document.getElementById('peek'), leaderEl = document.getElementById('leader');
const leadLine = document.getElementById('leadLine'), leadDot = document.getElementById('leadDot');
function showPeek(id) {
  if (!id) { peekEl.classList.remove('show'); S.peekId = null; return; }
  if (S.peekId !== id || peekEl.dataset.v !== String(S.ver)) {
    const d = COMP[id];
    document.getElementById('pkN').textContent = numN(id);
    document.getElementById('pkCat').textContent = d.cat;
    document.getElementById('pkName').textContent = d.name;
    document.getElementById('pkShort').textContent = d.short;
    document.getElementById('pkSpecs').innerHTML = specsFor(id).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    peekEl.dataset.v = String(S.ver);
  }
  S.peekId = id; peekEl.classList.add('show');
}
function updateLeader() {
  if (!S.peekId || !peekEl.classList.contains('show')) { leaderEl.classList.add('off'); return; }
  const a = toScreen(anchorOf(S.peekId));
  if (!a.vis) { leaderEl.classList.add('off'); return; }
  const sr = stageEl.getBoundingClientRect(), pr = peekEl.getBoundingClientRect();
  let x1, y1;
  if (narrowMQ.matches) { x1 = Math.min(Math.max(a.x, pr.left - sr.left + 20), pr.right - sr.left - 20); y1 = pr.top - sr.top; }
  else { x1 = pr.right - sr.left; y1 = Math.min(Math.max(a.y, pr.top - sr.top + 20), pr.bottom - sr.top - 20); }
  leaderEl.classList.remove('off');
  leadLine.setAttribute('x1', x1.toFixed(1)); leadLine.setAttribute('y1', y1.toFixed(1));
  leadLine.setAttribute('x2', a.x.toFixed(1)); leadLine.setAttribute('y2', a.y.toFixed(1));
  leadDot.setAttribute('cx', a.x.toFixed(1)); leadDot.setAttribute('cy', a.y.toFixed(1));
}

/* ---------- selection ---------- */
function setHover(id) {
  if (S.hover === id) return;
  S.hover = id; applyLook(); showPeek(id || S.sel);
  canvas.classList.toggle('hovering', !!id);
  onHoverUI(id);
}
function select(id, o = {}) {
  if (!id) { clearSel(); return; }
  S.sel = id; S.ghost = o.ghost !== false;
  if (o.focus !== false && ok3d) focusComp(id, o.yaw, o.pitch);
  if (!o.keepTour) stopTour();
  ctl && (ctl.auto = false); updateSpinBtn();
  applyLook(); showPeek(S.hover || id); onSelectUI(id);
}
function clearSel() { S.sel = null; S.ghost = false; applyLook(); showPeek(S.hover); onSelectUI(null); }

/* ---------- tour ---------- */
const BURIED = ['esc', 'fc', 'rx', 'vtx', 'power'];
function tourGo(i) {
  S.tourI = (i + ORDER.length) % ORDER.length; S.tourT = 0;
  const id = ORDER[S.tourI];
  stopDemos();
  S.sel = id; S.ghost = BURIED.includes(id);
  focusComp(id); applyLook(); showPeek(id); onSelectUI(id);
  document.getElementById('tourPos').textContent = `${S.tourI + 1} / ${ORDER.length}`;
}
function startTour() { S.tour = true; document.getElementById('tourBar').hidden = false; document.getElementById('tTour').setAttribute('aria-pressed', 'true'); ctl.auto = false; updateSpinBtn(); tourGo(S.sel ? ORDER.indexOf(S.sel) : 0); }
function stopTour() {
  if (!S.tour) return;
  S.tour = false; document.getElementById('tourBar').hidden = true; document.getElementById('tTour').setAttribute('aria-pressed', 'false');
}
function tickTour(dt) { if (!S.tour || S.drawerOpen) return; S.tourT += dt; if (S.tourT > 5.5) tourGo(S.tourI + 1); }

/* ---------- demos ---------- */
const statusEl = document.getElementById('status');
function setStatus(t) { if (!t) { statusEl.hidden = true; return; } statusEl.hidden = false; if (statusEl.textContent !== t) statusEl.textContent = t; }
function stopDemos() {
  if (!S.demo) return;
  S.demo = null; setStatus(null); applyLook();
}
function enterDemo(kind) {
  stopTour();
  S.demo = kind; ctl.auto = false; updateSpinBtn();
  if (S.explodeOn) toggleExplode(false);
  if (kind === 'mot') { S.sel = 'motors'; S.ghost = false; setView(new T.Vector3(0, 2.0, 0.5), 0, 1.02, fitDist(15.8)); }
  else if (kind === 'fc') { S.sel = 'fc'; S.ghost = true; setView(new T.Vector3(-0.9, 1.95, 0.55), -1.78, 0.5, fitDist(4.4)); }
  else if (kind === 'rx') {
    S.sel = 'rx'; S.ghost = true;
    const b = comps.rx.parts.board.clone();
    setView(b.clone().add(new T.Vector3(-3.2, 2.6, 3.4)), 0.78, 0.36, fitDist(9.5));
  }
  applyLook(); showPeek(S.hover); onSelectUI(S.sel);
}
function motorCmd(cmd) {
  if (cmd === 'stop') { MOT.mode = 'idle'; if (S.demo === 'mot') { S.demo = null; setStatus(null); applyLook(); } updateDemoUI(); return; }
  if (cmd === 'in' || cmd === 'out') { MOT.dir = cmd; MOT.mode = 'spin'; updatePropHands(); }
  if (cmd === 'test') { MOT.mode = 'test'; MOT.ti = 0; MOT.tt = 0; }
  if (ok3d) enterDemo('mot'); else S.demo = 'mot';
  updateDemoUI();
}
function fcCmd(cmd) {
  if (cmd === 'run') { FC.mode = 'run'; FC.usbT = 0; FC.prog = 0; FC.flashed = false; }
  else if (cmd === 'dfu') { FC.mode = 'dfu'; FC.t = 0; FC.prog = 0; FC.flashed = false; }
  else if (cmd === 'flash' && FC.mode === 'dfu' && FC.t > 1.3) {
    FC.mode = 'flash'; FC.t = 0; FC.prog = 0;
    usbG.updateMatrixWorld(true);
    const pts = usbG.userData.pts.slice().reverse().map(p => usbG.localToWorld(p.clone()));
    pts.push(usbG.localToWorld(new T.Vector3(0, 0, 0)));
    pts.push(comps.fc.parts.mcu.clone().add(comps.fc.g.position));
    flashCurve = new T.CatmullRomCurve3(pts);
  }
  if (ok3d) enterDemo('fc'); else S.demo = 'fc';
  updateDemoUI();
}
function rxCmd(cmd) {
  RX.mode = cmd; RX.t = 0; RX.spawn = 0; RX.tele = 0;
  packets.forEach(p => { p.on = false; p.s.visible = false; });
  if (ok3d) enterDemo('rx'); else S.demo = 'rx';
  updateDemoUI();
}
function ledPattern(mode, t) {
  if (mode === 'nolink') return (t % 1.0) < 0.5 ? 1 : 0;
  if (mode === 'bind') { const p = t % 1.0; return (p < 0.1 || (p > 0.2 && p < 0.3)) ? 1 : 0; }
  if (mode === 'linked') return 1;
  if (mode === 'wifi') return (t % 0.1) < 0.05 ? 1 : 0;
  return 0;
}

function tickMotors(dt) {
  const dirs = motorDirs(), pp = comps.props.parts, mp = comps.motors.parts;
  if (MOT.mode === 'test') { MOT.tt += dt; if (MOT.tt > 1.7) { MOT.tt = 0; MOT.ti = (MOT.ti + 1) % 4; updateDemoUI(); } }
  const testing = MOT.mode === 'test';
  for (let i = 0; i < 4; i++) {
    let target = 0;
    if (MOT.mode === 'spin') target = MOT.thr;
    else if (testing && i === MOT.ti && MOT.tt > 0.15 && MOT.tt < 1.4) target = Math.max(0.3, MOT.thr);
    MOT.vis[i] += (target - MOT.vis[i]) * (1 - Math.exp(-dt * (target > MOT.vis[i] ? 3.5 : 2.4)));
    MOT.ang[i] += dirs[i] * MOT.vis[i] * 32 * dt;
    if (mp.rot && mp.rot[i]) mp.rot[i].rotation.y = MOT.ang[i];
    if (pp.spin && pp.spin[i]) {
      pp.spin[i].rotation.y = MOT.ang[i];
      const blur = testing ? 0 : smooth(0.1, 0.48, MOT.vis[i]);
      const gf = (comps.props.ghost ? 0.08 : 1) * (S.signals ? 0.3 : 1), tf = testing ? 0.14 : 1;
      pp.blur[i].material.opacity = blur * 0.8 * gf;
      pp.bm[i].opacity = (0.9 - 0.72 * blur) * gf * tf;
    }
    const g = arrows[i];
    if (g) {
      g.visible = MOT.mode !== 'idle';
      g.position.copy(g.userData.base); g.position.y += comps.props.ex.y * S.ex;
      g.rotation.y += dirs[i] * dt * (0.6 + MOT.vis[i] * 2.2);
      g.userData.mat.opacity = testing ? (i === MOT.ti ? 0.95 : 0.22) : 0.92;
    }
    const cw = dirs[i] < 0, p = L.mp[i];
    const e = label('m' + i, `<b>M${i + 1}</b> <i>${cw ? 'CW' : 'CCW'}</i>`, `mot ${cw ? 'cw' : 'ccw'}${testing && i !== MOT.ti ? ' dim' : ''}`);
    e.pos = new T.Vector3(p.x, L.seatY + 2.6 + comps.props.ex.y * S.ex, p.z);
    e.on = MOT.mode !== 'idle';
  }
  if (S.demo === 'mot' && testing) {
    const i = MOT.ti, cw = dirs[i] < 0;
    setStatus(`M${i + 1} — ${NAMES[i]} — ${cw ? 'за годинниковою (CW)' : 'проти годинникової (CCW)'}`);
  } else if (S.demo === 'mot') setStatus(MOT.dir === 'in' ? 'Props In: передні лопаті рухаються до центру' : 'Props Out: передні лопаті рухаються назовні');
}

function tickFC(dt, now) {
  const p = comps.fc.parts; if (!p.btn) return;
  FC.t += dt;
  let st = 0, pulse = 0;
  if (FC.mode === 'run') { st = (now % 1.0) < 0.12 ? 1 : 0; FC.btn += (0 - FC.btn) * Math.min(1, dt * 10); }
  else if (FC.mode === 'dfu') {
    FC.btn = FC.t < 1.35 ? Math.min(1, FC.t / 0.15) : Math.max(0, 1 - (FC.t - 1.35) / 0.15);
    FC.usbT = FC.t > 0.35 ? 1 : 0;
    st = FC.t < 0.4 && (now % 1) < 0.12 ? 1 : 0;
    pulse = FC.t > 1.3 ? 0.5 + 0.5 * Math.sin(now * 4) : 0;
    if (FC.t > 1.3 && FC.t - dt <= 1.3) updateDemoUI();
  } else if (FC.mode === 'flash') {
    FC.prog = Math.min(1, FC.t / 5.5);
    pulse = 0.65 + 0.35 * Math.sin(now * 14);
    if (FC.t > 6.0) { FC.mode = 'run'; FC.flashed = true; FC.t = 0; FC.prog = 1; }
    updateDemoUI();
  }
  FC.usb += (FC.usbT - FC.usb) * (1 - Math.exp(-dt * 5));
  p.btn.position.y = p.btnY - 0.055 * FC.btn;
  const gf = comps.fc.ghost ? 0.25 : 1;
  p.ledS.emissiveIntensity = st ? 1.9 : 0.02;
  p.gS.material.opacity = st * gf; p.gP.material.opacity = 0.8 * gf;
  p.chipM.emissive.copy(C(TC['--accent'])); p.chipM.emissiveIntensity = pulse * 0.7;
  if (usbG) {
    usbG.visible = FC.usb > 0.01;
    usbG.position.copy(p.usbPort).add(comps.fc.g.position);
    usbG.position.x += 0.65 - 3.4 * (1 - FC.usb);
  }
  const flashing = FC.mode === 'flash' && flashCurve;
  flashDots.forEach((s, i) => {
    s.visible = !!flashing && S.demo === 'fc';
    if (flashing) { const t = ((now * 0.55) + i / flashDots.length) % 1; flashCurve.getPointAt(t, s.position); s.material.color.copy(C(TC['--accent'])); s.material.opacity = Math.sin(t * Math.PI); }
  });
  document.getElementById('fcLedS').classList.toggle('on', !!st);
  const bl = label('fcBtn', 'BOOT ↓', 'hot');
  bl.pos = p.btnPos.clone().add(comps.fc.g.position).add(new T.Vector3(0, 0.55, 0));
  bl.on = S.demo === 'fc' && FC.mode === 'dfu' && FC.t < 1.7;
  const ml = label('fcMcu', FC.mode === 'flash' ? `запис ${Math.round(FC.prog * 100)} %` : 'DFU · STM32 BOOTLOADER', 'hot');
  ml.pos = p.mcu.clone().add(comps.fc.g.position).add(new T.Vector3(0, 0.75, 0));
  ml.on = S.demo === 'fc' && ((FC.mode === 'dfu' && FC.t > 1.3) || FC.mode === 'flash');
  if (S.demo === 'fc') {
    setStatus(FC.mode === 'run' ? (FC.flashed ? 'Прошивку записано — плата перезавантажилась' : 'Робочий режим: статусний LED блимає')
      : FC.mode === 'dfu' ? (FC.t < 1.3 ? 'Затиснули BOOT і підключили USB…' : 'DFU: прошивка зупинена, MCU чекає дані по USB')
        : `${FC.prog < 0.18 ? 'Стирання флешу' : FC.prog < 0.9 ? 'Запис прошивки' : 'Перевірка'} · ${Math.round(FC.prog * 100)} %`);
  }
}

function tickRX(dt, now) {
  const p = comps.rx.parts; if (!p.ledM) return;
  RX.t += dt;
  if (RX.mode === 'bind' && RX.t > 3.4) { RX.mode = 'linked'; RX.t = 0; updateDemoUI(); }
  const on = ledPattern(RX.mode, RX.t);
  const gf = comps.rx.ghost ? 0.3 : 1;
  p.ledM.emissiveIntensity = on ? 2.4 : 0.03;
  p.glow.material.opacity = on * gf;
  document.getElementById('rxLed').classList.toggle('on', !!on);
  const active = S.demo === 'rx' && ok3d;
  const board = p.board.clone().add(comps.rx.g.position);
  const antW = (p.antPts || [board]).map(a => a.clone().add(comps.rx.g.position));
  const showRadio = active && (RX.mode === 'bind' || RX.mode === 'linked');
  radio.visible = showRadio;
  let tip = null;
  if (showRadio) {
    radio.position.copy(board).add(new T.Vector3(-8.5, 5.2, 8.2));
    radio.lookAt(board);
    radio.updateMatrixWorld(true);
    tip = radio.localToWorld(radio.userData.tip.clone());
    RX.spawn -= dt; RX.tele -= dt;
    const spawn = (dir, colorKey) => {
      const pk = packets.find(q => !q.on); if (!pk) return;
      pk.on = true; pk.t = 0; pk.dir = dir; pk.target = antW[Math.floor(Math.random() * antW.length)];
      pk.s.material.color.copy(C(TC[colorKey])); pk.s.visible = true;
    };
    if (RX.mode === 'bind' && RX.spawn <= 0) { spawn(Math.random() < 0.5 ? 1 : -1, '--accent'); RX.spawn = 0.22; }
    if (RX.mode === 'linked') {
      if (RX.spawn <= 0) { spawn(1, '--sig-ctrl'); RX.spawn = 0.1; }
      if (RX.tele <= 0) { spawn(-1, '--led'); RX.tele = 0.55; }
    }
  }
  packets.forEach(pk => {
    if (!pk.on) return;
    if (!showRadio) { pk.on = false; pk.s.visible = false; return; }
    pk.t += dt / 0.7;
    if (pk.t >= 1) { pk.on = false; pk.s.visible = false; return; }
    const a = pk.dir > 0 ? tip : pk.target, b = pk.dir > 0 ? pk.target : tip;
    const m = a.clone().lerp(b, 0.5); m.y += 2.4;
    const t = pk.t, it = 1 - t;
    pk.s.position.set(it * it * a.x + 2 * it * t * m.x + t * t * b.x, it * it * a.y + 2 * it * t * m.y + t * t * b.y, it * it * a.z + 2 * it * t * m.z + t * t * b.z);
    pk.s.material.opacity = Math.sin(t * Math.PI) * 0.6 + 0.4;
  });
  const showRings = active && RX.mode === 'wifi';
  rings.forEach((r, i) => {
    r.visible = showRings;
    if (!showRings) return;
    const ph = ((now * 0.7) + i / 3) % 1;
    r.position.copy(antW[0]); r.quaternion.copy(camera.quaternion);
    const sc = 0.4 + ph * 5; r.scale.set(sc, sc, sc);
    r.material.opacity = (1 - ph) * 0.75; r.material.color.copy(C(TC['--led']));
  });
  const rl = label('rxLbl', RX.mode === 'bind' ? 'BIND · подвійне блимання' : RX.mode === 'linked' ? 'зв’язок · 250 Гц · LQ 100' : RX.mode === 'wifi' ? 'Wi-Fi «ExpressLRS RX» · 10.0.0.1' : 'немає зв’язку · шукає пульт', RX.mode === 'linked' || RX.mode === 'wifi' ? 'hot' : '');
  rl.pos = board.clone().add(new T.Vector3(0, 1.5, 0)); rl.on = active;
  const tl = label('radioLbl', 'пульт ELRS', '');
  tl.pos = radio.position.clone().add(new T.Vector3(0, 3.6, 0)); tl.on = showRadio;
  if (S.demo === 'rx') {
    setStatus(RX.mode === 'nolink' ? 'LED повільно блимає: приймач не бачить пульта'
      : RX.mode === 'bind' ? 'Біндинг: обмін ключами з пультом…'
        : RX.mode === 'linked' ? 'Зв’язок: пакети керування → приймач, телеметрія → пульт'
          : 'Wi-Fi: точка доступу для оновлення прошивки');
  }
}

/* ---------- explode & signals ---------- */
function toggleExplode(on) {
  S.explodeOn = on == null ? !S.explodeOn : on;
  document.getElementById('tExplode').setAttribute('aria-pressed', String(S.explodeOn));
  S.ghost = false; applyLook();
  if (S.explodeOn) {
    if (S.signals) toggleSignals(false);
    if (S.demo) { stopDemos(); }
    setView(new T.Vector3(0, 6.0, 1.0), null, 0.3, fitDist(19.5));
  } else setView(new T.Vector3(0, 2.2, 0.3), null, 0.44, fitDist(17));
}
function toggleSignals(on) {
  S.signals = on == null ? !S.signals : on;
  document.getElementById('tSignals').setAttribute('aria-pressed', String(S.signals));
  document.getElementById('legend').hidden = !S.signals;
  if (S.signals) {
    if (S.explodeOn) toggleExplode(false);
    stopTour(); stopDemos();
    S.sel = null; S.ghost = false; onSelectUI(null); showPeek(S.hover);
    buildSignals();
    setView(new T.Vector3(0, 2.2, 0.6), null, 0.62, fitDist(12.5));
  } else clearSignals();
  applyLook();
}
function updateSpinBtn() { if (ctl) document.getElementById('tSpin').setAttribute('aria-pressed', String(!!ctl.auto)); }

/* ---------- rebuild ---------- */
function applyWireVis(id) { comps[id].meshes.forEach(m => { if (m.userData.wire) m.visible = S.wiresVis; }); }
function refreshPickables() { pickables = []; for (const id of ORDER) comps[id].meshes.forEach(m => pickables.push(m)); }
function rebuild(list) {
  S.ver = (S.ver || 0) + 1;
  if (!ok3d) return;
  if (list.includes('frame')) computeLayout();
  const seq = ORDER.filter(id => list.includes(id));
  for (const id of seq) { clearComp(id); BUILD[id](); }
  for (const id of seq) { applyWireVis(id); comps[id].flash = 1; }
  refreshPickables(); positionArrows(); updatePropHands(); updateWheelbase();
  if (S.signals) buildSignals();
  applyLook();
  if (S.peekId) showPeek(S.peekId);
}
function tickFlash(dt) {
  const acc = C(TC['--accent']);
  for (const id of ORDER) {
    const c = comps[id]; if (!c.flash) continue;
    c.flash = Math.max(0, c.flash - dt * 1.3);
    for (const m of c.mats) { const u = m.userData; if (!u || u.blur || u.keep) continue; m.emissive.copy(acc); m.emissiveIntensity = Math.max(0, c.flash) * 0.55; }
    if (c.flash === 0) { c.flash = 0; applyLook(); }
  }
}

/* ---------- init & loop ---------- */
function initScene() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(34, 1, 0.1, 500);
  root = new T.Group(); scene.add(root);
  overlay = new T.Group(); scene.add(overlay);
  makeTextures(); readTheme(); buildEnv();
  scene.add(new T.HemisphereLight(0xffffff, 0x39423e, 0.5));
  const key = new T.DirectionalLight(0xffffff, 1.2); key.position.set(10, 18, -8); scene.add(key);
  const fill = new T.DirectionalLight(0xdfe8ff, 0.45); fill.position.set(-12, 6, 10); scene.add(fill);
  drawMat();
  matMesh = new T.Mesh(new T.PlaneGeometry(52, 52), new T.MeshBasicMaterial({ map: matTex, transparent: true, depthWrite: false, toneMapped: false }));
  matMesh.rotation.x = -Math.PI / 2; matMesh.position.y = -0.03; matMesh.renderOrder = -2; scene.add(matMesh);
  shadowMesh = new T.Mesh(new T.PlaneGeometry(27, 27), new T.MeshBasicMaterial({ map: TEX.shadow, color: 0x000000, transparent: true, depthWrite: false, toneMapped: false }));
  shadowMesh.rotation.x = -Math.PI / 2; shadowMesh.position.y = -0.01; shadowMesh.renderOrder = -1; scene.add(shadowMesh);
  makeWheelbase();
  for (const id of ORDER) compInit(id, EXPLODE[id]);
  for (let i = 0; i < 4; i++) arrows.push(makeArrow());
  brkHover = makeBrackets(0.55); brkSel = makeBrackets(1);
  makeUSB(); makeRadio();
  ctl = { target: new T.Vector3(0, 2.4, 0.3), tTarget: new T.Vector3(0, 2.4, 0.3), yaw: 2.45, tYaw: 2.45, pitch: 0.44, tPitch: 0.44, dist: 46, tDist: 46, auto: !reduceMotion, drag: false };
  raycaster = new T.Raycaster(); ndc = new T.Vector2();
  rebuild(ORDER.slice());
  for (const id of ORDER) comps[id].flash = 0;
  applyLook();
  resize();
  ctl.dist = ctl.tDist = fitDist(17);
  new ResizeObserver(resize).observe(stageEl);
  bindPointer();
  const onTheme = () => {
    readTheme(); drawMat(); updatePropHands();
    wbLine.material.color.copy(C(TC['--ink']));
    [brkHover, brkSel].forEach(b => b.material.color.copy(C(TC['--accent'])));
    if (S.signals) buildSignals();
    applyLook();
  };
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  requestAnimationFrame(loop);
}
function resize() {
  const w = Math.max(1, stageEl.clientWidth), h = Math.max(1, stageEl.clientHeight);
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
let lastT = performance.now();
function loop(nowMs) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, Math.max(0, (nowMs - lastT) / 1000)); lastT = nowMs;
  const now = nowMs / 1000;
  if (ctl.auto && !ctl.drag && !S.demo && !S.tour) ctl.tYaw += dt * 0.14;
  const k = 1 - Math.exp(-dt * 5.5);
  ctl.target.lerp(ctl.tTarget, k);
  ctl.yaw += (ctl.tYaw - ctl.yaw) * k; ctl.pitch += (ctl.tPitch - ctl.pitch) * k; ctl.dist += (ctl.tDist - ctl.dist) * k;
  const cp = Math.cos(ctl.pitch);
  camera.position.set(ctl.target.x + ctl.dist * cp * Math.sin(ctl.yaw), ctl.target.y + ctl.dist * Math.sin(ctl.pitch), ctl.target.z + ctl.dist * cp * Math.cos(ctl.yaw));
  camera.lookAt(ctl.target);

  S.ex += ((S.explodeOn ? 1 : 0) - S.ex) * (1 - Math.exp(-dt * 4));
  if (Math.abs(S.ex - (S.explodeOn ? 1 : 0)) < 0.001) S.ex = S.explodeOn ? 1 : 0;
  for (const id of ORDER) comps[id].g.position.copy(comps[id].ex).multiplyScalar(S.ex);
  if (comps.frame.parts.top) comps.frame.parts.top.position.y = 5.0 * S.ex;
  const wv = S.ex < 0.02;
  if (wv !== S.wiresVis) { S.wiresVis = wv; ORDER.forEach(applyWireVis); }

  tickMotors(dt); tickFC(dt, now); tickRX(dt, now); tickSignals(dt); tickTour(dt); tickFlash(dt);

  const showNums = S.ex > 0.5;
  for (const id of ORDER) {
    const e = label('n_' + id, String(numN(id)), 'num' + (S.sel === id ? ' sel' : ''));
    e.on = showNums && !(id === 'gps' && cfg.gps === 'none');
    if (e.on) e.pos = calloutPos(id);
  }
  const wbl = LB.get('wb'); if (wbl) wbl.on = !S.demo && S.ex < 0.5 && !S.signals;

  if (S.hover && S.hover !== S.sel) { brkHover.visible = true; setBrackets(brkHover, compBox(S.hover).expandByScalar(0.15)); } else brkHover.visible = false;
  if (S.sel && !S.demo && !S.signals) { brkSel.visible = true; setBrackets(brkSel, compBox(S.sel).expandByScalar(0.18)); brkSel.material.opacity = 0.7 + 0.3 * Math.sin(now * 3); } else brkSel.visible = false;

  renderer.render(scene, camera);
  updateLabels(); updateLeader();
}

/* ---------- pointer ---------- */
function bindPointer() {
  const ptrs = new Map(); let down = null, pinch = 0, lastTap = { id: null, t: 0 };
  const hoverAt = (x, y) => setHover(pick(x, y));
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    down = { x: e.clientX, y: e.clientY, moved: false, type: e.pointerType };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1 && down) {
      if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) {
        down.moved = true; ctl.drag = true; canvas.classList.add('dragging');
        if (ctl.auto) { ctl.auto = false; updateSpinBtn(); }
        stopTour();
      }
      if (down.moved) {
        ctl.tYaw -= dx * 0.0068; ctl.yaw -= dx * 0.0068 * 0.5;
        ctl.tPitch = Math.min(1.45, Math.max(-0.12, ctl.tPitch + dy * 0.005));
      }
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) ctl.tDist = Math.min(110, Math.max(5, ctl.tDist * pinch / d));
      pinch = d; if (down) down.moved = true;
    }
  });
  const end = e => {
    const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = 0;
    if (!had) return;
    if (down && !down.moved && ptrs.size === 0 && e.type === 'pointerup') {
      const id = pick(e.clientX, e.clientY), now = performance.now();
      if (id) {
        select(id);
        if (down.type !== 'mouse' && lastTap.id === id && now - lastTap.t < 380) openDrawer(id);
        lastTap = { id, t: now };
      } else if (!S.demo) clearSel();
    }
    if (ptrs.size === 0) { down = null; ctl.drag = false; canvas.classList.remove('dragging'); }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !ptrs.size) setHover(null); });
  canvas.addEventListener('dblclick', e => { const id = pick(e.clientX, e.clientY); if (id) openDrawer(id); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); ctl.tDist = Math.min(110, Math.max(5, ctl.tDist * Math.exp(e.deltaY * 0.0011))); }, { passive: false });
}
function pick(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  let first = null;
  for (const h of hits) {
    if (!h.object.visible) continue;
    const id = h.object.userData.cid; if (!id) continue;
    if (!first) first = id;
    if (!comps[id].ghost) return id;
  }
  return first;
}
