/* Анатомія FPV-дрона · 3D-сцена: рендерер, процедурні текстури та моделі вузлів (Three.js r128).
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * data.js → scene.js → interaction.js → ui.js */
'use strict';
/* ================= 3D SCENE ================= */
const T = window.THREE;
const stageEl = document.getElementById('stage');
const canvas = document.getElementById('gl');
const labelsEl = document.getElementById('labels');
let ok3d = false, renderer = null, scene, camera, root, overlay;
try {
  if (!T) throw new Error('three.js не завантажився');
  renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
  ok3d = true;
} catch (err) {
  ok3d = false;
  document.getElementById('fallback').hidden = false;
  document.getElementById('hint').hidden = true;
}

const UP = ok3d ? new T.Vector3(0, 1, 0) : null;
const C = h => new T.Color(h).convertSRGBToLinear();
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const v3 = p => (p.isVector3 ? p.clone() : new T.Vector3(p[0], p[1], p[2]));
const TEX = {};
const comps = {};
const L = { mp: [], seatY: 2.1 };
const TC = {};

function readTheme() {
  ['--accent', '--cw', '--ccw', '--sig-power', '--sig-ctrl', '--sig-motor', '--sig-video', '--led', '--ink'].forEach(k => { TC[k] = css(k) || '#888888'; });
}

/* ---------- textures ---------- */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  if (srgb) t.encoding = T.sRGBEncoding;
  t.anisotropy = 4;
  return t;
}
function makeTextures() {
  TEX.carbon = canvasTex(128, 128, (x, w) => {
    x.fillStyle = '#141618'; x.fillRect(0, 0, w, w);
    const n = 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const hz = ((i + j) % 4) < 2;
      const g = hz ? x.createLinearGradient(0, j * s, 0, j * s + s) : x.createLinearGradient(i * s, 0, i * s + s, 0);
      g.addColorStop(0, '#1d2023'); g.addColorStop(0.5, '#3a3f44'); g.addColorStop(1, '#1b1e21');
      x.fillStyle = g; x.fillRect(i * s + 0.6, j * s + 0.6, s - 1.2, s - 1.2);
    }
  });
  TEX.carbon.wrapS = TEX.carbon.wrapT = T.RepeatWrapping;
  TEX.carbon.repeat.set(0.55, 0.55);
  TEX.glow = canvasTex(64, 64, (x, w) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
  TEX.shadow = canvasTex(128, 128, (x, w) => {
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(0.5, 'rgba(0,0,0,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  }, false);
  TEX.blur = canvasTex(256, 256, (x, w) => {
    const c = w / 2, g = x.createRadialGradient(c, c, c * 0.1, c, c, c);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.22, 'rgba(255,255,255,.22)');
    g.addColorStop(0.78, 'rgba(255,255,255,.4)'); g.addColorStop(0.94, 'rgba(255,255,255,.75)');
    g.addColorStop(0.975, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, w);
  });
}
function textTex(lines, o) {
  return canvasTex(o.w || 256, o.h || 256, (x, w, h) => {
    if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, w, h); }
    if (o.pre) o.pre(x, w, h);
    x.fillStyle = o.fg || '#dddddd'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const lh = o.lh || 36;
    lines.forEach((ln, i) => {
      x.font = `${ln.w || 600} ${ln.s || 28}px "IBM Plex Mono", ui-monospace, monospace`;
      x.fillText(ln.t, w / 2, h / 2 + (i - (lines.length - 1) / 2) * lh);
    });
  });
}

/* ---------- registry & geometry helpers ---------- */
function compInit(id, ex) {
  const g = new T.Group(); g.name = id; root.add(g);
  comps[id] = { id, g, mats: [], meshes: [], tex: [], parts: {}, ex: new T.Vector3(ex[0], ex[1], ex[2]) };
}
function mk(cid, p) {
  const m = new T.MeshStandardMaterial({
    color: C(p.c || '#ffffff'), roughness: p.r ?? 0.55, metalness: p.m ?? 0, map: p.map || null, side: p.side || T.FrontSide
  });
  if (p.e) { m.emissive = C(p.e); m.emissiveIntensity = p.ei ?? 1; }
  if ((p.o != null && p.o < 1) || p.tr) { m.transparent = true; m.opacity = p.o ?? 1; }
  if (p.dw === false) m.depthWrite = false;
  m.userData = { o: m.opacity, tr: m.transparent, dw: m.depthWrite, em: m.emissive.clone(), ei: m.emissiveIntensity, keep: !!p.keep };
  comps[cid].mats.push(m);
  return m;
}
function add(cid, geo, mat, pos, rot, parent, wire) {
  const me = new T.Mesh(geo, mat);
  if (pos) { if (pos.isVector3) me.position.copy(pos); else me.position.set(pos[0], pos[1], pos[2]); }
  if (rot) me.rotation.set(rot[0], rot[1], rot[2]);
  (parent || comps[cid].g).add(me);
  me.userData.cid = cid;
  if (wire) me.userData.wire = true;
  comps[cid].meshes.push(me);
  return me;
}
function clearComp(cid) {
  const c = comps[cid];
  c.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.isSprite && o.material) o.material.dispose(); });
  c.mats.forEach(m => m.dispose()); c.tex.forEach(t => t.dispose());
  c.g.clear(); c.mats = []; c.meshes = []; c.tex = []; c.parts = {};
}
const box = (w, h, d) => new T.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 24, open = false) => new T.CylinderGeometry(rt, rb, h, seg, 1, open);
function rrect(w, l, r, cx = 0, cy = 0, path = false) {
  const s = path ? new T.Path() : new T.Shape();
  const x0 = cx - w / 2, y0 = cy - l / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  s.lineTo(x0 + w, y0 + l - r); s.quadraticCurveTo(x0 + w, y0 + l, x0 + w - r, y0 + l);
  s.lineTo(x0 + r, y0 + l); s.quadraticCurveTo(x0, y0 + l, x0, y0 + l - r);
  s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
  return s;
}
function capsule(len, w) {
  const r = w / 2, s = new T.Shape();
  s.moveTo(0, -r); s.lineTo(len, -r); s.absarc(len, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(0, r); s.absarc(0, 0, r, Math.PI / 2, Math.PI * 1.5, false);
  return s;
}
function slab(shape, depth, bevel = 0.02) {
  const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  return g;
}
function alignTo(obj, from, dir, len) {
  const d = dir.clone().normalize();
  obj.position.copy(from).addScaledVector(d, len / 2);
  obj.quaternion.setFromUnitVectors(UP, d);
}
function tube(cid, pts, r, mat, wire = true, seg) {
  const curve = new T.CatmullRomCurve3(pts.map(v3));
  return add(cid, new T.TubeGeometry(curve, seg || Math.max(24, pts.length * 12), r, 7, false), mat, null, null, null, wire);
}
function glowSprite(color, size) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: new T.Color(color), transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(size, size, size);
  return s;
}

/* ---------- layout ---------- */
function computeLayout() {
  let p;
  if (cfg.frame === 'truex') { const a = 7.955; p = [[a, a], [a, -a], [-a, a], [-a, -a]]; }
  else if (cfg.frame === 'squashed') p = [[8.9, 6.9], [8.9, -6.9], [-8.9, 6.9], [-8.9, -6.9]];
  else p = [[6.6, 8.6], [9.6, -6.0], [-6.6, 8.6], [-9.6, -6.0]];
  L.mp = p.map(([x, z]) => new T.Vector3(x, 0, z));
}
const armStart = p => new T.Vector2(Math.sign(p.x) * 1.1, p.z * 0.32);

/* ---------- builders ---------- */
function buildFrame() {
  const cid = 'frame', c = comps[cid];
  const carbon = mk(cid, { c: '#ffffff', map: TEX.carbon, r: 0.36, m: 0.2 });
  const alu = mk(cid, { c: '#434a52', m: 0.85, r: 0.3 });
  const screw = mk(cid, { c: '#a2a9b0', m: 1, r: 0.28 });
  const bs = rrect(4.4, 11.4, 0.8);
  bs.holes.push(rrect(1.4, 1.2, 0.4, 0, 4.4, true));
  bs.holes.push(rrect(1.2, 1.0, 0.4, 0, -4.7, true));
  add(cid, slab(bs, 0.3), carbon);
  L.mp.forEach(p => {
    const s = armStart(p), dx = p.x - s.x, dz = p.z - s.y, len = Math.hypot(dx, dz);
    const arm = add(cid, slab(capsule(len, 1.3), 0.55), carbon, [s.x, 0, s.y]);
    arm.rotation.y = Math.atan2(-dz, dx);
    add(cid, cyl(1.55, 1.55, 0.55, 36), carbon, [p.x, 0.275, p.z]);
  });
  for (const sx of [-1, 1]) {
    const sh = new T.Shape();
    sh.moveTo(3.15, 0.3); sh.lineTo(5.85, 0.3); sh.lineTo(5.85, 2.0); sh.lineTo(4.95, 3.15); sh.lineTo(3.15, 3.15); sh.lineTo(3.15, 0.3);
    const h = new T.Path(); h.absarc(4.55, 1.72, 0.16, 0, Math.PI * 2, true); sh.holes.push(h);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }); g.rotateY(Math.PI / 2);
    add(cid, g, carbon, [sx > 0 ? 1.02 : -1.24, 0, 0]);
  }
  const top = new T.Group(); c.g.add(top); c.parts.top = top;
  const ts = rrect(4.0, 10.2, 0.6, 0, -0.5);
  ts.holes.push(rrect(0.28, 2.1, 0.12, 1.45, 0.4, true));
  ts.holes.push(rrect(0.28, 2.1, 0.12, -1.45, 0.4, true));
  ts.holes.push(rrect(1.2, 0.9, 0.35, 0, -2.6, true));
  add(cid, slab(ts, 0.22), carbon, [0, 3.2, 0], null, top);
  [[1.75, -3.0], [-1.75, -3.0], [1.75, 5.0], [-1.75, 5.0]].forEach(([x, z]) => {
    add(cid, cyl(0.24, 0.24, 2.9, 6), alu, [x, 1.75, z], null, top);
    add(cid, cyl(0.21, 0.21, 0.08, 12), screw, [x, 3.47, z], null, top);
  });
}

function buildMotors() {
  const cid = 'motors', c = comps[cid], o = opt('motors');
  const R = o.st[0] === 23 ? 1.44 : 1.38, H = o.st[1] === 6 ? 1.02 : 1.15;
  const base = mk(cid, { c: '#1f2226', m: 0.6, r: 0.42 });
  const bell = mk(cid, { c: o.col, m: 0.72, r: 0.3, side: T.DoubleSide });
  const capM = mk(cid, { c: '#17191c', m: 0.55, r: 0.35 });
  const copper = mk(cid, { c: '#b8733a', m: 0.9, r: 0.35 });
  const steel = mk(cid, { c: '#cdd2d7', m: 1, r: 0.22 });
  const band = mk(cid, { c: '#e9ecef', m: 0.3, r: 0.4 });
  const ts = new T.Shape(); ts.absarc(0, 0, R - 0.03, 0, Math.PI * 2, false);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2, h = new T.Path();
    h.absarc(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, R * 0.2, 0, Math.PI * 2, true); ts.holes.push(h);
  }
  const hb = new T.Path(); hb.absarc(0, 0, 0.27, 0, Math.PI * 2, true); ts.holes.push(hb);
  c.parts.rot = [];
  L.seatY = 0.95 + H;
  L.motorR = R;
  L.mp.forEach((p, i) => {
    const g = new T.Group(); g.position.set(p.x, 0.55, p.z); c.g.add(g);
    add(cid, cyl(R * 0.94, R * 0.97, 0.3, 32), base, [0, 0.15, 0], null, g);
    add(cid, cyl(R * 0.8, R * 0.8, H * 0.82, 24), copper, [0, 0.3 + H * 0.41, 0], null, g);
    const rot = new T.Group(); rot.position.y = 0.3; g.add(rot); c.parts.rot[i] = rot;
    add(cid, cyl(R, R, H, 40, true), bell, [0, H / 2 + 0.03, 0], null, rot);
    add(cid, cyl(R + 0.012, R + 0.012, 0.16, 40, true), band, [0, 0.24, 0], null, rot);
    add(cid, slab(ts, 0.1, 0), capM, [0, H, 0], null, rot);
    add(cid, cyl(0.25, 0.25, 0.95, 16), steel, [0, H + 0.47, 0], null, rot);
  });
}

function bladeGeo(R, P, n) {
  const r0 = 0.42, cm = n === 2 ? 1.5 : 1.38, N = 16, tE = 0.965;
  const ch = t => (t < 0.28 ? cm * (0.6 + 0.4 * Math.sin(t / 0.28 * Math.PI / 2)) : cm * (1 - 0.58 * Math.pow((t - 0.28) / 0.72, 1.3)));
  const xs = t => r0 + (R - r0) * t;
  const s = new T.Shape();
  s.moveTo(xs(0), -0.42 * ch(0));
  for (let i = 1; i <= N; i++) { const t = tE * i / N; s.lineTo(xs(t), -0.42 * ch(t) - 0.08 * Math.sin(t * Math.PI)); }
  s.quadraticCurveTo(R + 0.1, 0.05, xs(tE), 0.58 * ch(tE));
  for (let i = N - 1; i >= 0; i--) { const t = tE * i / N; s.lineTo(xs(t), 0.58 * ch(t) + 0.06 * Math.sin(t * Math.PI)); }
  const g = new T.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -0.035); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const phi = Math.min(0.62, Math.atan(P / (2 * Math.PI * Math.max(x, 0.3))));
    const cs = Math.cos(phi), sn = Math.sin(phi);
    pos.setXYZ(i, x, y * cs - z * sn, y * sn + z * cs);
  }
  g.computeVertexNormals();
  return g;
}

function buildProps() {
  const cid = 'props', c = comps[cid], o = opt('props');
  const R = o.d * 2.54 / 2, geo = bladeGeo(R, o.pitch * 2.54, o.n);
  const hubM = mk(cid, { c: o.col, r: 0.4 });
  const nutM = mk(cid, { c: '#b9bec4', m: 1, r: 0.25 });
  c.parts.spin = []; c.parts.hand = []; c.parts.blur = []; c.parts.bm = [];
  L.propR = R;
  const dirs = motorDirs();
  L.mp.forEach((p, i) => {
    const pg = new T.Group(); pg.position.set(p.x, L.seatY, p.z); c.g.add(pg);
    const spin = new T.Group(); pg.add(spin); c.parts.spin[i] = spin;
    const hand = new T.Group(); spin.add(hand); c.parts.hand[i] = hand;
    const bm = mk(cid, { c: o.col, r: 0.45, o: 0.9, side: T.DoubleSide }); bm.userData.dyn = true; c.parts.bm[i] = bm;
    for (let k = 0; k < o.n; k++) add(cid, geo, bm, [0, 0.3, 0], [0, k / o.n * Math.PI * 2, 0], hand);
    hand.scale.x = dirs[i] < 0 ? -1 : 1;
    add(cid, cyl(0.6, 0.66, 0.55, 24), hubM, [0, 0.28, 0], null, spin);
    add(cid, cyl(0.42, 0.42, 0.42, 6), nutM, [0, 0.76, 0], null, spin);
    const bmat = new T.MeshBasicMaterial({ map: TEX.blur, color: C(o.col), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    bmat.userData = { blur: true }; c.mats.push(bmat);
    const disc = new T.Mesh(new T.RingGeometry(0.62, R, 72), bmat);
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.32; pg.add(disc); c.parts.blur[i] = disc;
  });
}

function buildESC() {
  const cid = 'esc', c = comps[cid], o = opt('esc'), y = 0.75, z0 = 0.3;
  const pcb = mk(cid, { c: o.pcb, r: 0.55, m: 0.1 });
  const fet = mk(cid, { c: '#0b0c0e', r: 0.45, m: 0.2 });
  const chip = mk(cid, { c: '#26292d', r: 0.5 });
  const gold = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
  const rub = mk(cid, { c: '#1b1c1e', r: 0.9 });
  const nyl = mk(cid, { c: '#e7e2d6', r: 0.6 });
  const wireM = mk(cid, { c: '#2a2d31', r: 0.6 });
  add(cid, box(3.6, 0.16, 3.6), pcb, [0, y, z0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) add(cid, box(0.34, 0.12, 0.3), fet, [sx * (0.62 + a * 0.42), y + 0.14, z0 + sz * (0.42 + b * 0.38)]);
    add(cid, box(0.4, 0.08, 0.4), chip, [sx * 0.42, y + 0.12, z0 + sz * 0.05]);
    for (let k = 0; k < 3; k++) add(cid, box(0.26, 0.04, 0.22), gold, [sx * 1.62, y + 0.09, z0 + sz * (0.95 + k * 0.3)]);
    add(cid, new T.TorusGeometry(0.2, 0.08, 8, 16), rub, [sx * 1.525, y, z0 + sz * 1.525], [Math.PI / 2, 0, 0]);
    add(cid, cyl(0.1, 0.1, 1.9, 8), nyl, [sx * 1.525, 1.25, z0 + sz * 1.525]);
  }
  for (const sx of [-1, 1]) add(cid, box(0.6, 0.05, 0.42), gold, [sx * 0.45, y + 0.1, 1.86]);
  L.mp.forEach(p => {
    const sx = Math.sign(p.x), sz = Math.sign(p.z), s = armStart(p);
    const dir = new T.Vector2(p.x - s.x, p.z - s.y).normalize(), nrm = new T.Vector2(-dir.y, dir.x);
    const at = (f, yy, off) => [s.x + (p.x - s.x) * f + nrm.x * off, yy, s.y + (p.z - s.y) * f + nrm.y * off];
    const endD = Math.hypot(p.x - s.x, p.z - s.y);
    [-0.11, 0, 0.11].forEach(off => {
      const pad = [sx * 1.62, y + 0.12, z0 + sz * (1.25 + off)];
      const f1 = 1 - 1.45 / endD, f2 = 1 - 1.12 / endD;
      tube(cid, [pad, [sx * 2.05, 0.74, z0 + sz * 1.7 + off], at(0.45, 0.63, off), at(f1, 0.63, off), at(f2, 0.82, off)], 0.05, wireM, true, 56);
    });
  });
}

function buildFC() {
  const cid = 'fc', c = comps[cid], o = opt('fc'), y = 1.75, z0 = 0.3, ty = y + 0.08;
  const pcb = mk(cid, { c: o.pcb, r: 0.5, m: 0.1 });
  const chipM = mk(cid, { c: '#222428', r: 0.45, keep: true });
  const small = mk(cid, { c: '#1d1f22', r: 0.5 });
  const gold = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
  const steel = mk(cid, { c: '#c7ccd2', m: 1, r: 0.25 });
  const btnM = mk(cid, { c: '#e3e6e9', r: 0.5 });
  const ledP = mk(cid, { c: '#5a1410', e: '#ff3b2f', ei: 1.6, keep: true });
  const ledS = mk(cid, { c: '#0d1f4a', e: '#3d7bff', ei: 1.8, keep: true });
  add(cid, box(3.6, 0.16, 3.6), pcb, [0, y, z0]);
  add(cid, box(1.0, 0.12, 1.0), chipM, [0.15, ty + 0.06, z0]);
  const lt = textTex([{ t: o.mcu, s: 30 }, { t: o.part, s: 25, w: 500 }], {
    w: 256, h: 256, fg: '#c9ced4', lh: 44,
    pre: (x) => { x.fillStyle = '#c9ced4'; x.beginPath(); x.arc(38, 38, 12, 0, Math.PI * 2); x.fill(); }
  });
  c.tex.push(lt);
  add(cid, new T.PlaneGeometry(0.92, 0.92), mk(cid, { c: '#ffffff', map: lt, r: 0.6, tr: true }), [0.15, ty + 0.125, z0], [-Math.PI / 2, 0, -Math.PI / 2]);
  add(cid, box(0.36, 0.08, 0.36), small, [-0.75, ty + 0.04, z0 - 0.6]);
  add(cid, box(0.55, 0.1, 0.34), small, [0.3, ty + 0.05, z0 + 1.15]);
  add(cid, box(0.26, 0.07, 0.26), small, [-0.65, ty + 0.035, z0 + 0.45]);
  add(cid, box(0.4, 0.12, 0.3), small, [1.15, ty + 0.06, z0 + 0.85]);
  add(cid, box(0.4, 0.12, 0.3), small, [1.15, ty + 0.06, z0 + 1.3]);
  for (let k = 0; k < 8; k++) for (const sz of [-1, 1]) add(cid, box(0.18, 0.03, 0.24), gold, [-1.26 + k * 0.36, ty + 0.015, z0 + sz * 1.62]);
  add(cid, box(0.72, 0.3, 0.92), steel, [-1.44, ty + 0.15, z0 + 0.4]);
  add(cid, box(0.03, 0.13, 0.7), small, [-1.805, ty + 0.15, z0 + 0.4]);
  add(cid, box(0.34, 0.08, 0.34), small, [-1.1, ty + 0.04, z0 + 1.25]);
  c.parts.btn = add(cid, box(0.18, 0.08, 0.18), btnM, [-1.1, ty + 0.12, z0 + 1.25]);
  c.parts.btnY = ty + 0.12;
  add(cid, box(0.16, 0.08, 0.11), ledP, [1.15, ty + 0.04, z0 - 1.3]);
  add(cid, box(0.16, 0.08, 0.11), ledS, [1.45, ty + 0.04, z0 - 1.3]);
  const gP = glowSprite('#ff4a3a', 0.9), gS = glowSprite('#4d86ff', 1.1);
  gP.position.set(1.15, ty + 0.12, z0 - 1.3); gS.position.set(1.45, ty + 0.12, z0 - 1.3);
  c.g.add(gP); c.g.add(gS);
  tube(cid, [[1.25, y - 0.1, z0 + 1.45], [1.95, 1.3, z0 + 1.65], [1.25, 0.95, z0 + 1.45]], 0.08, mk(cid, { c: '#d9d4c7', r: 0.6 }), true);
  Object.assign(c.parts, { chipM, ledP, ledS, gP, gS, usbPort: new T.Vector3(-1.8, ty + 0.15, z0 + 0.4), mcu: new T.Vector3(0.15, ty + 0.15, z0), btnPos: new T.Vector3(-1.1, ty + 0.2, z0 + 1.25) });
}

function buildRX() {
  const cid = 'rx', c = comps[cid], o = opt('rx'), cx = 1.5, cy = 0.42, cz = 3.3;
  add(cid, box(0.9, 0.12, 1.8), mk(cid, { c: '#14171a', r: 0.5 }), [cx, cy, cz]);
  add(cid, box(0.97, 0.22, 1.87), mk(cid, { c: '#5aa9ff', r: 0.25, o: 0.3, dw: false }), [cx, cy + 0.02, cz]);
  const chip = mk(cid, { c: '#26292d', r: 0.5 });
  add(cid, box(0.42, 0.08, 0.42), chip, [cx, cy + 0.1, cz - 0.3]);
  add(cid, box(0.3, 0.07, 0.3), chip, [cx - 0.15, cy + 0.1, cz + 0.25]);
  add(cid, box(0.16, 0.06, 0.2), mk(cid, { c: '#c7ccd2', m: 1, r: 0.3 }), [cx + 0.25, cy + 0.1, cz + 0.3]);
  const ledM = mk(cid, { c: '#0f3d1d', e: '#3dff7a', ei: 2, keep: true });
  add(cid, box(0.14, 0.06, 0.18), ledM, [cx + 0.28, cy + 0.1, cz - 0.65]);
  const glow = glowSprite('#45ff86', 1.3); glow.position.set(cx + 0.28, cy + 0.2, cz - 0.65); c.g.add(glow);
  tube(cid, [[cx, cy + 0.05, cz - 0.9], [cx + 0.2, 0.9, cz - 1.35], [1.45, 1.55, 1.95], [1.3, 1.83, 1.62]], 0.07, mk(cid, { c: '#3a3f45', r: 0.6 }), true);
  const coaxM = mk(cid, { c: '#1d2023', r: 0.5 });
  const ufl = [cx - 0.22, cy + 0.12, cz + 0.72];
  const pts = [];
  const T_ant = (B, d, axis, Lt) => {
    add(cid, box(0.6, 0.35, 0.5), mk(cid, { c: '#2f3338', r: 0.85 }), B);
    const tb = add(cid, cyl(0.11, 0.11, Lt, 10), mk(cid, { c: '#2b2f33', r: 0.6 }));
    alignTo(tb, B, d, Lt);
    const E = B.clone().addScaledVector(d, Lt);
    const n = new T.Vector3().crossVectors(axis, d).normalize();
    const el = add(cid, box(6.2, 0.24, 0.035), mk(cid, { c: '#c9a24e', m: 0.85, r: 0.35 }));
    el.position.copy(E);
    el.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axis, new T.Vector3().crossVectors(n, axis), n));
    add(cid, box(0.34, 0.34, 0.34), mk(cid, { c: '#141618', r: 0.6 }), E);
    return E;
  };
  if (o.ant === 'ceramic') {
    add(cid, box(0.3, 0.1, 0.62), mk(cid, { c: '#e9e3d1', r: 0.4 }), [cx, cy + 0.11, cz + 0.5]);
    pts.push(new T.Vector3(cx, cy + 0.18, cz + 0.5));
  } else {
    add(cid, cyl(0.11, 0.11, 0.08, 12), mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 }), ufl);
    if (o.ant === 'imt') {
      const F = new T.Vector3(0, 3.6, 5.45);
      tube(cid, [ufl, [cx - 0.35, 0.9, 4.95], [0.9, 2.6, 5.45], F], 0.045, coaxM, true);
      add(cid, box(0.5, 0.42, 0.62), mk(cid, { c: '#141618', r: 0.6 }), F);
      const leg = mk(cid, { c: '#1b1d20', r: 0.5 }), tip = mk(cid, { c: '#3a3f46', r: 0.5 });
      for (const sx of [-1, 1]) {
        const d = new T.Vector3(sx * 0.55, 0.45, 0.7).normalize();
        const m = add(cid, cyl(0.085, 0.085, 8.2, 10), leg); alignTo(m, F, d, 8.2);
        add(cid, new T.SphereGeometry(0.11, 12, 8), tip, F.clone().addScaledVector(d, 8.2));
      }
      pts.push(F.clone());
    } else {
      const B = new T.Vector3(0.6, 3.48, 5.45), d = new T.Vector3(0.35, 0.8, 0.5).normalize();
      tube(cid, [ufl, [cx - 0.35, 0.9, 4.95], [1.05, 2.5, 5.4], B], 0.045, coaxM, true);
      pts.push(T_ant(B, d, new T.Vector3().crossVectors(d, UP).normalize(), 3.0));
      if (o.ant === 'div') {
        const B2 = new T.Vector3(-0.6, 3.48, 5.45), d2 = new T.Vector3(-0.35, 0.8, 0.5).normalize();
        const ax2 = UP.clone().addScaledVector(d2, -UP.dot(d2)).normalize();
        tube(cid, [[cx - 0.1, cy + 0.12, cz + 0.85], [0.2, 1.0, 5.0], [-0.35, 2.6, 5.45], B2], 0.045, coaxM, true);
        pts.push(T_ant(B2, d2, ax2, 3.0));
      }
    }
  }
  Object.assign(c.parts, { ledM, glow, antPts: pts, board: new T.Vector3(cx, cy, cz) });
}

function buildVTX() {
  const cid = 'vtx', c = comps[cid], o = opt('vtx');
  const pcb = mk(cid, { c: '#121519', r: 0.5 });
  const shield = mk(cid, { c: '#cfd5da', m: 0.95, r: 0.28 });
  const fin = mk(cid, { c: '#8e959c', m: 0.9, r: 0.35 });
  const nyl = mk(cid, { c: '#e7e2d6', r: 0.6 });
  const gold = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
  const wireM = mk(cid, { c: '#3a3f45', r: 0.6 });
  const posts = (cx, cz, hw, hd, top) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cid, cyl(0.08, 0.08, top - 0.3, 8), nyl, [cx + sx * hw, 0.3 + (top - 0.3) / 2, cz + sz * hd]); };
  let conns = [];
  if (o.kind === 'analog') {
    const big = o.id === 'an25', w = big ? 2.3 : 2.0, cx = big ? -0.25 : -0.35, cz = 4.0, y = 1.5;
    posts(cx, cz, w / 2 - 0.15, w / 2 - 0.15, y - 0.07);
    add(cid, box(w, 0.14, w), pcb, [cx, y, cz]);
    add(cid, box(w * 0.62, 0.26, w * 0.55), shield, [cx - 0.15, y + 0.2, cz - 0.15]);
    if (big) for (let k = 0; k < 7; k++) add(cid, box(0.06, 0.42, w * 0.5), fin, [cx - 0.15 - w * 0.27 + k * (w * 0.54 / 6), y + 0.54, cz - 0.15]);
    add(cid, box(0.12, 0.05, 0.1), mk(cid, { c: '#3a0d0a', e: '#ff4a3a', ei: 1.4, keep: true }), [cx + 0.7, y + 0.1, cz + 0.55]);
    add(cid, box(0.2, 0.1, 0.2), mk(cid, { c: '#e3e6e9', r: 0.5 }), [cx + 0.7, y + 0.12, cz + 0.15]);
    add(cid, cyl(0.13, 0.13, 0.18, 12), gold, [cx + 0.35, y + 0.14, cz + w / 2 - 0.15]);
    conns = [new T.Vector3(cx + 0.35, y + 0.22, cz + w / 2 - 0.1)];
    tube(cid, [[cx - w / 2 + 0.2, y - 0.05, cz - w / 2 + 0.1], [-1.25, 1.75, 2.35], [-1.1, 1.85, 1.75]], 0.07, wireM, true);
  } else if (o.id === 'hd') {
    const cx = -0.15, cz = 3.95, y = 1.75;
    posts(cx, cz, 1.1, 1.0, y - 0.37);
    add(cid, box(2.6, 0.75, 2.4), shield, [cx, y, cz]);
    for (let k = 0; k < 9; k++) add(cid, box(0.07, 0.42, 2.1), fin, [cx - 1.15 + k * 0.2875, y + 0.58, cz]);
    for (const sx of [-1, 1]) add(cid, cyl(0.13, 0.13, 0.26, 12), gold, [cx + sx * 0.6, y + 0.05, cz + 1.25], [Math.PI / 2, 0, 0]);
    conns = [new T.Vector3(cx - 0.6, y + 0.05, cz + 1.38), new T.Vector3(cx + 0.6, y + 0.05, cz + 1.38)];
    tube(cid, [[cx - 1.1, y - 0.2, cz - 1.15], [-1.4, 1.7, 2.3], [-1.1, 1.85, 1.75]], 0.07, wireM, true);
  } else {
    const cx = -0.35, cz = 4.0, y = 1.5;
    posts(cx, cz, 0.85, 0.85, y - 0.07);
    add(cid, box(2.0, 0.14, 2.0), mk(cid, { c: '#0f2a1d', r: 0.5 }), [cx, y, cz]);
    add(cid, box(1.7, 0.32, 1.7), mk(cid, { c: '#3a3f45', m: 0.8, r: 0.35 }), [cx, y + 0.23, cz]);
    for (let k = 0; k < 6; k++) add(cid, box(0.07, 0.3, 1.6), fin, [cx - 0.7 + k * 0.28, y + 0.54, cz]);
    add(cid, cyl(0.13, 0.13, 0.18, 12), gold, [cx + 0.4, y + 0.14, cz + 0.88]);
    conns = [new T.Vector3(cx + 0.4, y + 0.22, cz + 0.95)];
    tube(cid, [[cx - 0.8, y - 0.05, cz - 0.9], [-1.25, 1.75, 2.35], [-1.1, 1.85, 1.75]], 0.07, wireM, true);
  }
  c.parts.conns = conns;
  c.parts.input = o.kind === 'analog' ? new T.Vector3(-0.9, 1.6, 3.0) : new T.Vector3(-1.0, 1.6, 2.85);
}

function buildVTXAnt() {
  const cid = 'vtxant', c = comps[cid], o = opt('vtxant'), v = opt('vtx');
  const tpu = mk(cid, { c: '#33383e', r: 0.85 });
  const coax = mk(cid, { c: '#1e2124', r: 0.55 });
  const mounts = v.dual ? [[-0.75, 1.9, 5.7], [0.75, 1.9, 5.7]] : [[0, 1.9, 5.7]];
  const conns = (comps.vtx.parts.conns || []);
  c.parts.tips = [];
  mounts.forEach((m, i) => {
    const M = new T.Vector3(m[0], m[1], m[2]);
    add(cid, box(0.95, 0.9, 0.55), tpu, [M.x, M.y, M.z - 0.05]);
    const from = conns[i] || conns[0];
    if (from) tube(cid, [from, [from.x * 0.6 + M.x * 0.4, from.y + 0.35, (from.z + M.z) / 2], [M.x, M.y, M.z - 0.3]], 0.05, coax, true);
    const d = new T.Vector3(v.dual ? (i ? 0.28 : -0.28) : 0, 1, 1).normalize();
    const L0 = { lolli: 3.0, pagoda: 2.5, stubby: 0, dipole: 2.2 }[o.id];
    if (L0 > 0) { const st = add(cid, cyl(0.1, 0.1, L0, 10), coax); alignTo(st, M, d, L0); }
    const E = M.clone().addScaledVector(d, L0);
    let tip = E.clone();
    if (o.id === 'lolli') {
      const s = add(cid, new T.SphereGeometry(0.62, 28, 16), mk(cid, { c: '#C8392C', r: 0.45 }));
      s.position.copy(E).addScaledVector(d, 0.32); s.quaternion.setFromUnitVectors(UP, d); s.scale.set(1, 0.6, 1);
      tip = s.position.clone();
    } else if (o.id === 'pagoda') {
      const pm = mk(cid, { c: '#22262a', r: 0.5 }), gm = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
      [0.8, 0.68, 0.55].forEach((r, k) => { const disc = add(cid, cyl(r, r, 0.07, 28), pm); disc.position.copy(E).addScaledVector(d, 0.1 + k * 0.24); disc.quaternion.setFromUnitVectors(UP, d); });
      const core = add(cid, cyl(0.07, 0.07, 0.7, 8), gm); alignTo(core, E, d, 0.7);
      tip = E.clone().addScaledVector(d, 0.6);
    } else if (o.id === 'stubby') {
      const s = add(cid, cyl(0.26, 0.34, 1.7, 18), mk(cid, { c: '#1b1d20', r: 0.7 })); alignTo(s, M, d, 1.7);
      tip = M.clone().addScaledVector(d, 1.7);
    } else {
      const sl = add(cid, cyl(0.09, 0.09, 0.6, 12), mk(cid, { c: '#b9bec4', m: 1, r: 0.3 })); alignTo(sl, E, d, 0.6);
      const rod = add(cid, cyl(0.04, 0.04, 0.7, 8), mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 })); alignTo(rod, E.clone().addScaledVector(d, 0.6), d, 0.7);
      tip = E.clone().addScaledVector(d, 1.3);
    }
    c.parts.tips.push(tip);
  });
}

function buildCam() {
  const cid = 'cam', c = comps[cid], o = camOpt(), s = o.size;
  const g = new T.Group(); g.position.set(0, 1.72, -4.55); g.rotation.x = cfg.tilt * Math.PI / 180; c.g.add(g); c.parts.pivot = g;
  const body = mk(cid, { c: '#1f2225', r: 0.55, m: 0.15 });
  const ringM = mk(cid, { c: o.ring, m: 0.8, r: 0.3 });
  const glass = mk(cid, { c: '#0b1522', r: 0.05, m: 0.3 });
  const screw = mk(cid, { c: '#c9a34a', m: 1, r: 0.3 });
  const lr = o.lens, fz = -s * 0.45;
  add(cid, box(s, s, s * 0.9), body, [0, 0, 0], null, g);
  add(cid, cyl(lr, lr * 1.08, 0.8, 32), body, [0, 0, fz - 0.4], [Math.PI / 2, 0, 0], g);
  add(cid, new T.TorusGeometry(lr * 1.01, 0.06, 8, 32), ringM, [0, 0, fz - 0.78], null, g);
  const gl = add(cid, new T.SphereGeometry(lr * 0.86, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 0, fz - 0.8], [-Math.PI / 2, 0, 0], g);
  gl.scale.set(1, 0.38, 1);
  for (const sx of [-1, 1]) add(cid, cyl(0.12, 0.12, 0.1, 12), screw, [sx * (s / 2 + 0.03), 0, 0], [0, 0, Math.PI / 2], g);
  if (o.digital) add(cid, box(s * 0.7, s * 0.25, 0.25), mk(cid, { c: '#c49a3a', m: 0.6, r: 0.4 }), [0, -s * 0.2, s * 0.5], null, g);
  const vin = comps.vtx.parts.input || new T.Vector3(-0.9, 1.6, 3.0);
  tube(cid, [[0, 1.75, -3.65], [-0.75, 2.55, -3.1], [-1.95, 2.55, -1.2], [-1.95, 2.45, 1.9], vin], 0.065, mk(cid, { c: o.digital ? '#8a6a2a' : '#2b2f33', r: 0.6 }), true);
  c.parts.lens = new T.Vector3(0, 1.72, -4.55 + fz - 0.8);
}

function buildBattery() {
  const cid = 'battery', c = comps[cid], o = opt('battery'), [W, H, Lz] = o.dim;
  const y0 = 3.47, zc = 3.45 - Lz / 2, mah = Math.round(o.ah * 1000);
  add(cid, box(Math.min(W, 3.7), 0.05, Lz * 0.9), mk(cid, { c: '#26282b', r: 0.95 }), [0, 3.445, zc]);
  if (o.chem === 'lipo') {
    const v = (o.s * 3.7).toFixed(1).replace('.', ',');
    const sideT = textTex([{ t: `${o.s}S1P ${mah} мА·год`, s: 40 }, { t: `${v} В · LiPo · 120C`, s: 28, w: 500 }], {
      w: 512, h: 256, bg: o.col, fg: '#ffffff', lh: 52,
      pre: (x, w, h) => { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(0, h - 46, w, 46); x.fillStyle = 'rgba(255,255,255,.85)'; x.fillRect(0, 26, w, 6); }
    });
    const topT = textTex([{ t: `${o.s}S`, s: 92 }], {
      w: 256, h: 512, bg: o.col, fg: 'rgba(255,255,255,.92)',
      pre: (x, w, h) => { x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(0, 0, w, 54); x.fillRect(0, h - 54, w, 54); }
    });
    c.tex.push(sideT, topT);
    const sideM = mk(cid, { c: '#ffffff', map: sideT, r: 0.45 }), topM = mk(cid, { c: '#ffffff', map: topT, r: 0.45 }), endM = mk(cid, { c: o.col, r: 0.5 });
    add(cid, box(W, H, Lz), [sideM, sideM, topM, endM, endM, endM], [0, y0 + H / 2, zc]);
  } else {
    const cellM = mk(cid, { c: '#3d7fd0', r: 0.35, m: 0.2 }), endM = mk(cid, { c: '#c7ccd2', m: 0.9, r: 0.3 });
    for (let ix = -1; ix <= 1; ix++) for (let iy = 0; iy < 2; iy++) {
      add(cid, cyl(1.02, 1.02, Lz - 0.12, 28), cellM, [ix * 2.08, y0 + 1.05 + iy * 2.08, zc], [Math.PI / 2, 0, 0]);
    }
    for (const sz of [-1, 1]) add(cid, box(W - 0.3, H - 0.4, 0.04), endM, [0, y0 + H / 2, zc + sz * (Lz / 2 - 0.04)]);
    add(cid, box(W + 0.06, H + 0.06, Lz + 0.05), mk(cid, { c: o.col, r: 0.3, o: 0.36, dw: false }), [0, y0 + H / 2, zc]);
    const lt = textTex([{ t: 'Li-ion 6S1P', s: 40 }, { t: '21700 · 4500 мА·год', s: 28, w: 500 }], { w: 512, h: 256, fg: '#ffffff', lh: 52, bg: 'rgba(16,40,38,.82)' });
    c.tex.push(lt);
    add(cid, new T.PlaneGeometry(4.6, 2.3), mk(cid, { c: '#ffffff', map: lt, r: 0.5 }), [0, y0 + H + 0.04, zc], [-Math.PI / 2, 0, -Math.PI / 2]);
  }
  const strap = mk(cid, { c: '#17191c', r: 0.8 });
  add(cid, box(W + 0.14, 0.05, 2.0), strap, [0, y0 + H + 0.06, -0.4]);
  for (const sx of [-1, 1]) add(cid, box(0.05, H + 0.32, 2.0), strap, [sx * (W / 2 + 0.07), (3.17 + y0 + H) / 2, -0.4]);
  add(cid, box(Math.max(3.0, W), 0.05, 2.0), strap, [0, 3.16, -0.4]);
  add(cid, box(0.9, 0.12, 2.15), mk(cid, { c: '#8d949b', m: 0.9, r: 0.3 }), [0.7, y0 + H + 0.12, -0.4]);
  const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
  [[-0.15, blk], [0.15, red]].forEach(([off, m]) => tube(cid, [[-0.55 + off, y0 + 0.5, 3.4], [-0.95 + off, y0 + 0.42, 3.55], [-1.55 + off, 3.82, 3.6]], 0.11, m, true));
  tube(cid, [[0.7, y0 + H - 0.5, 3.4], [0.85, y0 + H + 0.05, 3.75], [0.7, y0 + H + 0.12, 3.2]], 0.06, mk(cid, { c: '#efebe0', r: 0.6 }), true);
  add(cid, box(0.85, 0.22, 0.3), mk(cid, { c: '#f0ece2', r: 0.6 }), [0.7, y0 + H + 0.16, 2.9]);
}

function buildPower() {
  const cid = 'power', c = comps[cid], o = opt('power');
  const yel = mk(cid, { c: '#F2C230', r: 0.5 }), yel2 = mk(cid, { c: '#E0AD18', r: 0.55 });
  const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
  const x = -1.55, y = 3.82;
  add(cid, box(0.85, 0.8, 0.85), yel2, [x, y, 4.05]);
  add(cid, box(0.85, 0.8, 0.85), yel, [x, y, 4.95]);
  add(cid, box(0.9, 0.06, 0.1), yel2, [x, y + 0.25, 4.5]);
  [[-0.16, blk, -0.45], [0.16, red, 0.45]].forEach(([off, m, px]) => {
    tube(cid, [[x + off, y, 5.35], [x - 0.6 + off * 0.5, 3.2, 5.75], [-2.35, 1.8, 5.2], [-2.3, 1.05, 3.2], [px * 0.6 - 0.5, 0.95, 2.35], [px, 0.88, 1.92]], 0.11, m, true, 72);
  });
  if (o.cap) {
    const r = o.cap === 1 ? 0.42 : 0.36, len = o.cap === 1 ? 1.6 : 1.3, cz = 2.55;
    add(cid, cyl(r, r, len, 28), mk(cid, { c: '#1d2c4f', r: 0.5 }), [0, 0.75, cz], [0, 0, Math.PI / 2]);
    add(cid, cyl(r + 0.01, r + 0.01, 0.14, 28, true), mk(cid, { c: '#d3dbe5', r: 0.5 }), [len / 2 - 0.3, 0.75, cz], [0, 0, Math.PI / 2]);
    const cap = mk(cid, { c: '#c7ccd2', m: 0.9, r: 0.3 });
    for (const sx of [-1, 1]) add(cid, cyl(r * 0.95, r * 0.95, 0.03, 24), cap, [sx * (len / 2 + 0.01), 0.75, cz], [0, 0, Math.PI / 2]);
    const leg = mk(cid, { c: '#c9ced3', m: 1, r: 0.3 });
    for (const sx of [-1, 1]) tube(cid, [[sx * 0.25, 0.75, cz - r + 0.04], [sx * 0.4, 0.85, 2.05], [sx * 0.45, 0.88, 1.92]], 0.03, leg, true, 16);
  }
}

function buildGPS() {
  const cid = 'gps', c = comps[cid], o = opt('gps');
  c.parts.anchor = new T.Vector3(0, 3.9, 4.5);
  if (o.id === 'none') return;
  const y = 3.42;
  add(cid, box(1.9, 0.25, 1.9), mk(cid, { c: '#3a3f45', r: 0.85 }), [0, y + 0.125, 4.5]);
  add(cid, box(1.8, 0.12, 1.8), mk(cid, { c: '#13224a', r: 0.5 }), [0, y + 0.31, 4.5]);
  add(cid, box(1.32, 0.02, 1.32), mk(cid, { c: '#c7ccd2', m: 1, r: 0.3 }), [0, y + 0.38, 4.5]);
  add(cid, box(1.22, 0.4, 1.22), mk(cid, { c: '#c8a46a', r: 0.6 }), [0, y + 0.59, 4.5]);
  add(cid, cyl(0.12, 0.12, 0.05, 16), mk(cid, { c: '#d9dde1', m: 1, r: 0.3 }), [0, y + 0.81, 4.5]);
  add(cid, box(0.1, 0.05, 0.1), mk(cid, { c: '#0d1f4a', e: '#3d7bff', ei: 1.4, keep: true }), [0.75, y + 0.39, 3.75]);
  tube(cid, [[-0.7, y + 0.3, 3.65], [-1.15, 2.8, 3.2], [-1.0, 1.95, 2.2], [-0.9, 1.86, 1.7]], 0.06, mk(cid, { c: '#3a3f45', r: 0.6 }), true);
}

const BUILD = { frame: buildFrame, motors: buildMotors, props: buildProps, esc: buildESC, fc: buildFC, rx: buildRX, vtx: buildVTX, vtxant: buildVTXAnt, cam: buildCam, battery: buildBattery, power: buildPower, gps: buildGPS };
const EXPLODE = {
  frame: [0, 0, 0], motors: [0, 1.7, 0], props: [0, 4.2, 0], esc: [0, 1.4, 0], fc: [0, 3.2, 0],
  rx: [3.2, 0.6, 1.6], vtx: [-0.4, 1.8, 3.6], vtxant: [0, 2.6, 5.6], cam: [0, 0.7, -4.2],
  battery: [0, 10.2, 0], power: [-3.6, 1.2, 2.6], gps: [0, 7.6, 1.6]
};
const DEPENDS = {
  frame: ['frame', 'motors', 'props', 'esc'], motors: ['motors', 'props'], props: ['props'], esc: ['esc'], fc: ['fc'],
  rx: ['rx'], vtx: ['vtx', 'vtxant', 'cam'], vtxant: ['vtxant'], cam: ['cam'], battery: ['battery'], power: ['power'], gps: ['gps']
};
