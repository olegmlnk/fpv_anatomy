/* Курс по БПЛА · рендерер, текстури, геометричні хелпери, розкладка платформ.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
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
  ['--accent', '--cw', '--ccw', '--sig-power', '--sig-ctrl', '--sig-motor', '--sig-video', '--led', '--ink', '--ok', '--warn', '--bad'].forEach(k => { TC[k] = css(k) || '#888888'; });
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

/* ---------- platform layout ---------- */
const LAYOUT = {
  p5: { body: [4.4, 11.4], arm: [1.3, 0.55], pad: 1.55, top: [4.0, 10.2, -0.5], stand: [[1.75, -3.0], [-1.75, -3.0], [1.75, 5.0], [-1.75, 5.0]], camZ: -4.55, battZc: null, rearMount: false, xtX: -1.55 },
  p7: { body: [4.8, 12.6], arm: [1.5, 0.6], pad: 1.85, top: [4.4, 12.0, -0.4], stand: [[1.9, -3.2], [-1.9, -3.2], [1.9, 5.4], [-1.9, 5.4]], camZ: -4.95, battZc: -0.6, rearMount: true, xtX: -1.6 },
  p10: { body: [6.0, 15.0], arm: [2.0, 0.8], pad: 2.3, top: [5.6, 14.0, -0.5], stand: [[2.4, -4.4], [-2.4, -4.4], [2.4, 6.2], [-2.4, 6.2]], camZ: -6.1, battZc: -1.8, rearMount: true, xtX: -2.2 },
  hex: { body: [7.0, 12.0], arm: [1.6, 0.6], pad: 1.85, top: [6.4, 11.4, -0.4], stand: [[2.6, -3.6], [-2.6, -3.6], [2.6, 4.8], [-2.6, 4.8]], camZ: -4.8, battZc: -2.6, rearMount: true, xtX: -2.4 },
  whoop: { micro: true, duct: 2.3, ductY: [0.72, 2.1], motorY: 1.05, plateY: 1.2, plateT: 0.14, board: 2.7, boardY: 1.5, camZ: -1.3 }
};
const LAY = () => LAYOUT[cfg.platform];

function computeLayout() {
  let p;
  switch (cfg.frame) {
    case 'squashed': p = [[8.9, 6.9], [8.9, -6.9], [-8.9, 6.9], [-8.9, -6.9]]; break;
    case 'deadcat': p = [[6.6, 8.6], [9.6, -6.0], [-6.6, 8.6], [-9.6, -6.0]]; break;
    case 'x7': { const a = 11.14; p = [[a, a], [a, -a], [-a, a], [-a, -a]]; break; }
    case 'dc7': p = [[9.24, 12.04], [13.44, -8.4], [-9.24, 12.04], [-13.44, -8.4]]; break;
    case 'x10': { const a = 15.2; p = [[a, a], [a, -a], [-a, a], [-a, -a]]; break; }
    case 'hex7': { const R = 19.5; p = [[0.5 * R, 0.866 * R], [0.5 * R, -0.866 * R], [-0.5 * R, 0.866 * R], [-0.5 * R, -0.866 * R], [R, 0], [-R, 0]]; break; }
    case 'w75': { const a = 2.65; p = [[a, a], [a, -a], [-a, a], [-a, -a]]; break; }
    default: { const a = 7.955; p = [[a, a], [a, -a], [-a, a], [-a, -a]]; }
  }
  L.mp = p.map(([x, z]) => new T.Vector3(x, 0, z));
}
function armStart(p) {
  if (cfg.platform === 'hex') return new T.Vector2(p.x, p.z).normalize().multiplyScalar(2.6);
  if (plat().micro) return new T.Vector2(Math.sign(p.x) * 0.9, Math.sign(p.z) * 0.9);
  return new T.Vector2(Math.sign(p.x) * LAY().body[0] * 0.25, p.z * 0.32);
}
/* розміщення батареї та залежних від неї вузлів */
function battPos() {
  const b = opt('battery'), [W, H, Lz] = battDims(b), lay = LAY();
  if (lay.micro) return { W, H, Lz, zc: 0.15, rear: 0.15 + Lz / 2, front: 0.15 - Lz / 2, top: H, bottom: 0 };
  const zc = lay.battZc == null ? 3.45 - Lz / 2 : lay.battZc;
  return { W, H, Lz, zc, rear: zc + Lz / 2, front: zc - Lz / 2, top: 3.47 + H };
}
function bodyRear() { const lay = LAY(); return lay.micro ? 1.6 : lay.body[1] / 2; }
