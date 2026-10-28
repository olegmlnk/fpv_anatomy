/* Курс по БПЛА · стан, оверлеї, підсвітка, камера, мітки, вибір, тур.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= STATE, OVERLAYS, LOOK, CAMERA, SELECTION ================= */
const S = { mode: 'build', hover: null, sel: null, ghost: false, explodeOn: false, ex: 0, demo: null, tour: false, tourI: 0, tourT: 0, peekId: null, wiresVis: true, ver: 0 };
const MOT = { mode: 'idle', dir: 'in', thr: 0.35, ang: [0, 0, 0, 0, 0, 0], vis: [0, 0, 0, 0, 0, 0], ti: 0, tt: 0 };
const FC = { mode: 'run', t: 0, prog: 0, usb: 0, usbT: 0, btn: 0, flashed: false };
const RX = { mode: 'nolink', t: 0, spawn: 0, tele: 0 };
const POS_NAMES = { quad: ['задній правий', 'передній правий', 'задній лівий', 'передній лівий'], hex: ['задній правий', 'передній правий', 'задній лівий', 'передній лівий', 'правий', 'лівий'] };
const motorNames = () => POS_NAMES[plat().mixer];
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrowMQ = window.matchMedia('(max-width: 900px)');
/* +1 = проти годинникової (CCW), −1 = за годинниковою (CW), вигляд згори; таблиці mixerQuadX / mixerHex6X Betaflight */
function motorDirs() {
  const d = plat().mixer === 'hex' ? [1, 1, -1, -1, -1, 1] : [-1, 1, 1, -1];
  return MOT.dir === 'in' ? d : d.map(v => -v);
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const kScale = () => (plat().micro ? 0.32 : 1);

let ctl, raycaster, ndc, pickables = [], arrows = [], brkHover, brkSel, matTex, matMesh, shadowMesh, wbLine;
let usbG, radio, packets = [], rings = [], flashDots = [], flashCurve = null;

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
function scaleMat() {
  const s = cfg.platform === 'p10' || cfg.platform === 'hex' ? 1.9 : cfg.platform === 'p7' ? 1.4 : 1;
  matMesh.scale.set(s, s, s); shadowMesh.scale.set(plat().micro ? 0.36 : s, plat().micro ? 0.36 : s, 1);
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
function makeRadioModel(parent) {
  const r = new T.Group(); parent.add(r);
  const body = new T.MeshStandardMaterial({ color: C('#2a2e33'), roughness: 0.55, metalness: 0.15 });
  const dark = new T.MeshStandardMaterial({ color: C('#16181b'), roughness: 0.7 });
  const scr = new T.MeshStandardMaterial({ color: C('#0d2238'), emissive: C('#2a6fd0'), emissiveIntensity: 0.7, roughness: 0.3 });
  const metal = new T.MeshStandardMaterial({ color: C('#b9bec4'), metalness: 1, roughness: 0.3 });
  const shell = new T.Mesh(new T.ExtrudeGeometry(rrect(8.6, 4.8, 1.3), { depth: 1.8, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 2 }), body);
  shell.position.z = -0.9; r.add(shell);
  const sc = new T.Mesh(box(2.6, 1.5, 0.08), scr); sc.position.set(0, 0.75, 1.12); r.add(sc);
  for (const sx of [-1, 1]) {
    const ring = new T.Mesh(cyl(0.8, 0.8, 0.1, 32), dark); ring.rotation.x = Math.PI / 2; ring.position.set(sx * 2.75, -0.5, 1.12); r.add(ring);
    const st = new T.Mesh(cyl(0.1, 0.1, 1.1, 10), metal); st.rotation.x = Math.PI / 2; st.position.set(sx * 2.75, -0.5, 1.65); r.add(st);
    const cap = new T.Mesh(cyl(0.27, 0.27, 0.28, 16), dark); cap.rotation.x = Math.PI / 2; cap.position.set(sx * 2.75, -0.5, 2.25); r.add(cap);
    const sw = new T.Mesh(cyl(0.08, 0.08, 0.7, 8), metal); sw.position.set(sx * 3.3, 2.75, 0.3); r.add(sw);
  }
  const ant = new T.Mesh(cyl(0.2, 0.16, 3.0, 12), dark); ant.position.set(3.0, 3.8, -0.2); ant.rotation.z = -0.35; r.add(ant);
  r.userData.tip = new T.Vector3(3.0 + Math.sin(0.35) * 1.45, 3.8 + Math.cos(0.35) * 1.45, -0.2);
  return r;
}
function makeGogglesModel(parent) {
  const g = new T.Group(); parent.add(g);
  const body = new T.MeshStandardMaterial({ color: C('#25292e'), roughness: 0.5, metalness: 0.15 });
  const foam = new T.MeshStandardMaterial({ color: C('#121416'), roughness: 0.95 });
  const lensM = new T.MeshStandardMaterial({ color: C('#0b1522'), roughness: 0.05, metalness: 0.4 });
  const front = new T.Mesh(new T.ExtrudeGeometry(rrect(7.2, 3.4, 1.2), { depth: 2.2, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 }), body);
  front.position.z = -1.1; g.add(front);
  const fm = new T.Mesh(new T.ExtrudeGeometry(rrect(6.8, 3.0, 1.1), { depth: 0.8, bevelEnabled: false }), foam); fm.position.z = -1.9; g.add(fm);
  for (const sx of [-1, 1]) { const l = new T.Mesh(cyl(0.9, 0.9, 0.1, 24), lensM); l.rotation.x = Math.PI / 2; l.position.set(sx * 1.7, 0, -1.95); g.add(l); }
  const strap = new T.Mesh(new T.TorusGeometry(4.2, 0.25, 6, 40, Math.PI), foam); strap.rotation.set(Math.PI / 2, 0, Math.PI); strap.position.z = -2.1; g.add(strap);
  g.userData.ants = [];
  for (const sx of [-1, 1]) {
    const st = new T.Mesh(cyl(0.12, 0.12, 1.6, 8), foam); st.position.set(sx * 2.6, 2.4, 0.4); st.rotation.z = -sx * 0.25; g.add(st);
    const lo = new T.Mesh(new T.SphereGeometry(0.55, 20, 12), new T.MeshStandardMaterial({ color: C('#C8392C'), roughness: 0.45 })); lo.scale.set(1, 0.6, 1);
    lo.position.set(sx * 2.8, 3.3, 0.4); g.add(lo); g.userData.ants.push(lo.position.clone());
  }
  const patch = new T.Mesh(box(2.6, 2.6, 0.5), new T.MeshStandardMaterial({ color: C('#2e3338'), roughness: 0.6 })); patch.position.set(0, 3.0, 0.6); g.add(patch);
  g.userData.ants.push(new T.Vector3(0, 3.0, 0.9));
  return g;
}
function makeRadio() {
  radio = makeRadioModel(overlay); radio.visible = false;
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
  const a = L.mp[3], b = L.mp[0], d = new T.Vector3().subVectors(b, a).normalize(), n = new T.Vector3(-d.z, 0, d.x).multiplyScalar(0.55 * kScale()), y = 0.03;
  const arr = wbLine.geometry.attributes.position.array;
  const P = [a.x, y, a.z, b.x, y, b.z, a.x + n.x, y, a.z + n.z, a.x - n.x, y, a.z - n.z, b.x + n.x, y, b.z + n.z, b.x - n.x, y, b.z - n.z];
  for (let i = 0; i < 18; i++) arr[i] = P[i];
  wbLine.geometry.attributes.position.needsUpdate = true;
  wbLine.geometry.computeBoundingSphere();
  const mm = Math.round(a.distanceTo(b) * 10);
  const e = label('wb', `колісна база ${mm} мм`, 'flat');
  e.pos = b.clone().addScaledVector(d, (L.propR || 6) + 1.0 * kScale()).setY(y);
  L.wb = mm;
}
function positionArrows() {
  const s = (L.propR || 6.48) / 6.48;
  arrows.forEach((g, i) => {
    const p = L.mp[i];
    g.userData.used = !!p;
    if (!p) { g.visible = false; return; }
    g.position.set(p.x, L.seatY + (L.hubH || 0.55) + 0.75 * s, p.z); g.userData.base = g.position.clone();
    g.userData.s = s;
  });
}
function updatePropHands() {
  const dirs = motorDirs(), pp = comps.props && comps.props.parts;
  dirs.forEach((d, i) => {
    if (pp && pp.hand && pp.hand[i]) pp.hand[i].scale.x = d < 0 ? -1 : 1;
    const g = arrows[i]; if (!g) return;
    const s = g.userData.s || 1;
    g.scale.set((d < 0 ? -1 : 1) * s, s, s);
    g.userData.mat.color.copy(C(d < 0 ? TC['--cw'] : TC['--ccw']));
  });
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
  const dim = S.mode === 'signals' ? 0.17 : 1;
  for (const id of ORDER) {
    const c = comps[id]; if (!c) continue;
    const ghost = gs.has(id), hov = S.hover === id, sel = S.sel === id && !S.demo;
    c.ghost = ghost || S.mode === 'signals';
    for (const m of c.mats) {
      const u = m.userData; if (!u || u.blur) continue;
      const tr = ghost || u.tr || dim < 1;
      if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; }
      if (!u.dyn) m.opacity = (ghost ? u.o * (m.map ? 0.035 : 0.075) : u.o) * dim;
      m.depthWrite = (ghost || dim < 1) ? false : u.dw;
      if (!u.keep) {
        if (hov || sel) { m.emissive.copy(acc); m.emissiveIntensity = hov ? 0.2 : 0.06; }
        else { m.emissive.copy(u.em); m.emissiveIntensity = u.ei; }
      }
    }
  }
}
function compBox(id) {
  const c = comps[id], b = new T.Box3().setFromObject(c.g);
  if (b.isEmpty() && c.parts.anchor) { const k = kScale(); b.setFromCenterAndSize(c.parts.anchor.clone().add(c.g.position), new T.Vector3(1.9 * k, 0.9 * k, 1.9 * k)); }
  return b;
}
function anchorOf(id) { return compBox(id).getCenter(new T.Vector3()); }
function calloutPos(id) {
  const c = comps[id], pp = c.parts, k = kScale(), up = new T.Vector3(0, 0.9 * k, 0);
  let p;
  switch (id) {
    case 'frame': { const m = L.mp[2], s = armStart(m); p = new T.Vector3((s.x + m.x) / 2, (L.motorY || 0.55) + 0.5 * k, (s.y + m.z) / 2); break; }
    case 'motors': p = L.mp[1].clone().setY(L.seatY + 0.2 * k); break;
    case 'props': { const m = L.mp[plat().mixer === 'hex' ? 5 : 3], d = m.clone().setY(0).normalize(); p = m.clone().addScaledVector(d, (L.propR || 6) * 0.55).setY(L.seatY + 0.9 * k); break; }
    case 'fc': p = (pp.mcu || anchorOf(id)).clone().add(up); break;
    case 'rx': p = (pp.board || anchorOf(id)).clone().add(up); break;
    case 'vtx': p = (pp.center || anchorOf(id)).clone().add(up); break;
    case 'vtxant': p = ((pp.tips || [])[0] || anchorOf(id)).clone().add(up); break;
    case 'cam': p = (pp.lens || anchorOf(id)).clone().add(up); break;
    case 'battery': { const b = compBox(id); p = new T.Vector3(0, b.max.y + 0.6 * k, (pp.center || anchorOf(id)).z); return p; }
    case 'power': p = (pp.xt || anchorOf(id)).clone().add(up); break;
    case 'gps': p = (pp.anchor || anchorOf(id)).clone().add(up); break;
    default: { const b = compBox(id); p = new T.Vector3(b.max.x, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2); }
  }
  return p.add(c.g.position);
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
function droneCenter() {
  const b = new T.Box3();
  for (const id of ORDER) b.union(compBox(id));
  return b.isEmpty() ? new T.Vector3(0, 2, 0) : b.getCenter(new T.Vector3());
}
function homeView() { const c = droneCenter(); setView(new T.Vector3(0, c.y * 0.9, c.z * 0.3), 2.45, 0.44, fitDist(plat().fit)); }
function focusComp(id, yaw, pitch) {
  const b = compBox(id), sph = b.getBoundingSphere(new T.Sphere()), k = kScale();
  setView(sph.center, yaw, pitch, Math.min(110, Math.max(7.5 * k, fitDist(Math.max(1.8 * k, sph.radius) * 1.12))));
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
    e.el.style.transform = `translate(${(s.x + (e.ox || 0)).toFixed(1)}px, ${(s.y + (e.oy || 0)).toFixed(1)}px) translate(-50%, -50%)`;
  }
}
const peekEl = document.getElementById('peek'), leaderEl = document.getElementById('leader');
const leadLine = document.getElementById('leadLine'), leadDot = document.getElementById('leadDot');
function showPeek(id) {
  if (!id || S.mode !== 'build') { peekEl.classList.remove('show'); S.peekId = null; return; }
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
  if (ctl) ctl.auto = false;
  updateSpinBtn();
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
function updateSpinBtn() { if (ctl) document.getElementById('tSpin').setAttribute('aria-pressed', String(!!ctl.auto)); }
