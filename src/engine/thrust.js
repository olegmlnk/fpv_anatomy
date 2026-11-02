/* Курс по БПЛА · потік повітря від пропелерів і «спроба зльоту».
 * Струмінь: пропелер засмоктує повітря згори широкою «лійкою» й відкидає вниз; під диском струмінь звужується
 * (≈0,7 радіуса пропа) і закручується в бік обертання, а біля землі розтікається в боки.
 * Неправильно встановлений проп: не того напряму — жене повітря вгору (кут тягне вниз), догори дриґом — тягне
 * в кілька разів слабше. «Спроба зльоту» показує наслідок: рівний підйом, переворот через поганий кут або завал на нього. */
import * as T from 'three';
import { C, comps, L, root, scene, TC } from './core.js';
import { MOT, motorDirs, S, wbLine } from './anim.js';
import { shadowMesh } from './demos.js';
import { plat } from '../data/options.js';
import { ORDER } from '../data/content.js';

const K = 30, NM = 6, H_IN = 0.85, H_OUT = 2.2, SPAN = H_IN + H_OUT, TAIL = 0.075, GY = 0.06;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const ease = u => u * u * (3 - 2 * u);
/* множник радіуса струменя на висоті y над диском (у радіусах пропа): лійка згори, звуження до ≈0,71 знизу */
const prof = y => y >= 0 ? 1 + 0.35 * Math.pow(Math.min(1, y / H_IN), 1.4) : 0.71 + 0.29 * Math.exp(y / 0.35);
const discY = () => L.seatY + (L.hubH || 0.55) * 0.58 + comps.props.ex.y * S.ex;

let flowG = null, partsL = null, segPos = null, segCol = null, segGeo = null;
const tubes = [], parts = [], arrowsT = [];
const _a = new T.Vector3(), _b = new T.Vector3(), _c = new T.Vector3(), _q = new T.Quaternion();

/* частка тяги кута: 1 — проп правильний, −0,35 — не того напряму (струмінь угору), 0,3 — догори дриґом */
export function propEff(i) {
  if (MOT.bad !== i) return 1;
  return MOT.badKind === 'dir' ? -0.35 : 0.3;
}

/* «труба» струменя: гвинтові смуги біжать уздовж потоку (напрям гвинта — бік обертання), нижче землі не малюємо */
const VS = `varying vec2 vUv; varying float vF; varying float vWY;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0); vWY = wp.y;
  vec4 mv = viewMatrix * wp;
  vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;
const FS = `uniform vec3 uColor; uniform float uPhase; uniform float uAlpha; uniform float uTwist;
varying vec2 vUv; varying float vF; varying float vWY;
void main() {
  if (vWY < 0.02) discard;
  float s = fract(vUv.y * 7.0 + vUv.x * uTwist - uPhase);
  float band = smoothstep(0.0, 0.16, s) * (1.0 - smoothstep(0.3, 0.6, s));
  float ends = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.7, 1.0, vUv.y));
  float a = uAlpha * ends * smoothstep(0.02, 0.45, vWY) * (0.1 + 0.9 * band) * (0.3 + 0.7 * (1.0 - vF)) * smoothstep(0.0, 0.18, vF);
  gl_FragColor = linearToOutputTexel(vec4(uColor, a));
}`;

function respawn(p) { p.r = 0.18 + 0.78 * Math.sqrt(Math.random()); p.a = Math.random() * Math.PI * 2; }
export function initThrust() {
  flowG = new T.Group(); flowG.visible = false; root.add(flowG);
  const pts = [];
  for (let j = 0; j <= 18; j++) { const y = H_IN - SPAN * j / 18; pts.push(new T.Vector2(prof(y), y)); }
  const geo = new T.LatheGeometry(pts, 48);
  for (let m = 0; m < NM; m++) {
    const mat = new T.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: T.DoubleSide, toneMapped: false,
      uniforms: { uColor: { value: new T.Color() }, uPhase: { value: Math.random() }, uAlpha: { value: 0 }, uTwist: { value: 2 } }
    });
    const t = new T.Mesh(geo, mat); t.renderOrder = 4; t.frustumCulled = false; flowG.add(t); tubes.push(t);
  }
  /* частинки — у світових координатах: біля землі шлях «складається» й повітря розтікається вбік */
  const n = NM * K;
  segPos = new Float32Array(n * 6); segCol = new Float32Array(n * 8);
  segGeo = new T.BufferGeometry();
  segGeo.setAttribute('position', new T.BufferAttribute(segPos, 3));
  segGeo.setAttribute('color', new T.BufferAttribute(segCol, 4));
  partsL = new T.LineSegments(segGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
  partsL.frustumCulled = false; partsL.renderOrder = 5; partsL.visible = false; scene.add(partsL);
  for (let m = 0; m < NM; m++) for (let k = 0; k < K; k++) { const p = { m, s: Math.random() }; respawn(p); parts.push(p); }
  /* стрілки тяги над кожним мотором */
  for (let m = 0; m < NM; m++) {
    const g = new T.Group(), mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const shaft = new T.Mesh(new T.CylinderGeometry(0.11, 0.11, 1, 10), mat), head = new T.Mesh(new T.ConeGeometry(0.32, 0.7, 14), mat);
    shaft.renderOrder = head.renderOrder = 6; g.add(shaft, head);
    g.userData = { shaft, head, mat }; g.visible = false; flowG.add(g); arrowsT.push(g);
  }
}
/* точка частинки у світі; повертає, наскільки шлях пішов «під землю» (0 — над землею) */
function partPos(out, mp, yd, R, mir, s, r, a) {
  const y = H_IN - SPAN * s, rr = R * r * prof(y), ly = yd + mir * y * R;
  out.set(mp.x + rr * Math.cos(a), ly, mp.z - rr * Math.sin(a)).applyMatrix4(root.matrix);
  if (out.y >= GY) return 0;
  _c.set(mp.x, ly, mp.z).applyMatrix4(root.matrix);
  const e = GY - out.y;
  let dx = out.x - _c.x, dz = out.z - _c.z, l = Math.hypot(dx, dz);
  if (l < 1e-4) { dx = Math.cos(a); dz = -Math.sin(a); l = 1; }
  out.x += dx / l * e * 1.25; out.z += dz / l * e * 1.25; out.y = GY;
  return e;
}
export function tickThrust(dt) {
  if (!flowG) return;
  const N = L.mp.length, show = MOT.flow && S.mode === 'build' && root.visible && MOT.vis.some((v, i) => i < N && v > 0.02);
  flowG.visible = partsL.visible = show;
  if (!show) return;
  root.updateMatrix();
  const R = L.propR || 6, s = R / 6.48, yd = discY(), dirs = motorDirs();
  const cAir = C(TC['--sig-ctrl'] || '#2b6bd9'), cBad = C(TC['--bad'] || '#c2372b'), cOk = C(TC['--ok'] || '#2f855a');
  tubes.forEach((t, i) => {
    const mp = L.mp[i];
    if (!mp) { t.visible = false; return; }
    const vis = MOT.vis[i], th = vis * propEff(i), u = t.material.uniforms;
    t.visible = vis > 0.02;
    t.position.set(mp.x, yd, mp.z); t.scale.set(R, th >= 0 ? R : -R, R);
    u.uColor.value.copy(th >= 0 ? cAir : cBad);
    u.uAlpha.value = clamp(vis * 2.5, 0, 1) * (0.12 + 0.5 * Math.min(1, Math.abs(propEff(i))));
    u.uTwist.value = 2 * dirs[i];
    u.uPhase.value = (u.uPhase.value + dt * 7 * (0.08 + 0.7 * Math.abs(th))) % 1000;
  });
  parts.forEach((p, j) => {
    const o = j * 6, oc = j * 8, i = p.m;
    if (i >= N) { segCol[oc + 3] = segCol[oc + 7] = 0; return; }
    const vis = MOT.vis[i], th = vis * propEff(i), mp = L.mp[i], mir = th >= 0 ? 1 : -1;
    p.s += (0.08 + 0.7 * Math.abs(th)) * dt;
    if (p.s > 1) { p.s -= 1; respawn(p); }
    p.a += dirs[i] * dt * (0.4 + 2.6 * Math.abs(th));
    const e = partPos(_a, mp, yd, R, mir, p.s, p.r, p.a);
    partPos(_b, mp, yd, R, mir, Math.max(0, p.s - TAIL), p.r, p.a - dirs[i] * 0.05);
    segPos[o] = _a.x; segPos[o + 1] = _a.y; segPos[o + 2] = _a.z;
    segPos[o + 3] = _b.x; segPos[o + 4] = _b.y; segPos[o + 5] = _b.z;
    const c = th >= 0 ? cAir : cBad;
    const al = clamp(vis * 3, 0, 1) * Math.sin(Math.PI * p.s) * (1 - clamp(e / (1.3 * R), 0, 1)) * (0.25 + 0.7 * Math.min(1, Math.abs(propEff(i))));
    segCol[oc] = c.r; segCol[oc + 1] = c.g; segCol[oc + 2] = c.b; segCol[oc + 3] = al;
    segCol[oc + 4] = c.r; segCol[oc + 5] = c.g; segCol[oc + 6] = c.b; segCol[oc + 7] = 0;
  });
  segGeo.attributes.position.needsUpdate = true; segGeo.attributes.color.needsUpdate = true;
  arrowsT.forEach((g, i) => {
    const mp = L.mp[i];
    if (!mp) { g.visible = false; return; }
    const th = MOT.vis[i] * propEff(i), Lh = (0.6 + 3.2 * Math.abs(th)) * s;
    g.visible = MOT.vis[i] > 0.05;
    if (!g.visible) return;
    const { shaft, head, mat } = g.userData;
    shaft.scale.set(s, Lh, s); shaft.position.y = Lh / 2; head.scale.setScalar(s); head.position.y = Lh + 0.35 * s;
    mat.color.copy(th >= 0 ? cOk : cBad); mat.opacity = clamp(MOT.vis[i] * 2.2, 0, 0.88);
    const base = yd + (L.hubH || 0.55) + 0.9 * s;
    if (th >= 0) { g.rotation.x = 0; g.position.set(mp.x, base, mp.z); }
    else { g.rotation.x = Math.PI; g.position.set(mp.x, base + Lh + 0.7 * s, mp.z); }
  });
}

/* ================= СПРОБА ЗЛЬОТУ ================= */
export const TO = { on: false, t: 0, kind: 'ok', i: -1, dur: 0, P: new T.Vector3(), axis: new T.Vector3(1, 0, 0), c0: new T.Vector3(), cur: new T.Vector3(), lift: 0, view: { c: new T.Vector3(), r: 0, yaw: 0.5 } };
const hull = [], _bb = new T.Box3();
/* габарит видимих деталей вузла (у координатах root, коли він на місці) */
function visBox(obj) {
  const b = new T.Box3();
  obj.traverseVisible(o => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    b.union(_bb.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
  });
  return b;
}
/* опорні точки корпусу: кути габаритів вузлів і краї дисків пропелерів — щоб при перевороті нічого не пішло під землю */
function buildHull() {
  hull.length = 0;
  root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
  const all = new T.Box3();
  for (const id of ORDER) {
    if (id === 'props' || !comps[id]) continue;
    const b = visBox(comps[id].g); if (b.isEmpty()) continue;
    all.union(b);
    for (let k = 0; k < 8; k++) hull.push(new T.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z));
  }
  const R = L.propR || 6, yd = discY();
  L.mp.forEach(mp => { for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; hull.push(new T.Vector3(mp.x + R * Math.cos(a), yd, mp.z + R * Math.sin(a))); } });
  if (all.isEmpty()) all.set(new T.Vector3(-1, 0, -1), new T.Vector3(1, 3, 1));
  all.getCenter(TO.c0);
}
function needLift(q) {
  let mn = Infinity;
  for (const h of hull) { const y = _a.copy(h).sub(TO.P).applyQuaternion(q).y + TO.P.y; if (y < mn) mn = y; }
  return Math.max(0, -mn);
}
export function takeoffKind() { return MOT.bad < 0 ? 'ok' : MOT.badKind === 'dir' ? 'flip' : 'tip'; }
export function takeoffStart() {
  const kind = takeoffKind(), R = L.propR || 6;
  TO.on = true; TO.t = 0; TO.kind = kind; TO.i = MOT.bad;
  TO.dur = kind === 'ok' ? 5.2 : kind === 'flip' ? 3.7 : 3.0;
  buildHull();
  const v = TO.view;
  if (kind === 'ok') {
    TO.P.set(0, 0, 0); TO.lift = 1.6 * R;
    v.c.set(TO.c0.x, TO.c0.y + 0.8 * R, TO.c0.z); v.r = plat().fit * 1.35; v.yaw = 0.5;
  } else {
    const mp = L.mp[TO.i], d = _b.set(mp.x, 0, mp.z).normalize(), dm = Math.hypot(mp.x, mp.z);
    TO.P.set(mp.x, 0, mp.z); TO.axis.set(d.z, 0, -d.x);
    v.yaw = Math.atan2(TO.axis.x, TO.axis.z);
    if (kind === 'flip') { v.c.set(mp.x, 0.42 * (2 * dm + R), mp.z); v.r = 1.12 * (2 * dm + R); }
    else { v.c.set(0.3 * mp.x, TO.c0.y + 0.3 * R, 0.3 * mp.z); v.r = plat().fit * 1.35; }
  }
  if (wbLine) wbLine.material.opacity = 0;
  return kind;
}
export function takeoffStop() {
  TO.on = false;
  if (root) { root.position.set(0, 0, 0); root.quaternion.identity(); }
  if (shadowMesh) { shadowMesh.position.set(0, -0.01, 0); shadowMesh.material.opacity = 1; }
  if (wbLine) wbLine.material.opacity = 0.45;
}
/* газ, якого вимагає анімація зльоту (null — звичайний газ) */
export function takeoffThr() {
  if (!TO.on) return null;
  const t = TO.t;
  if (TO.kind === 'ok') return t < 0.7 ? 0.55 : t < 1.9 ? 0.62 : t < 3.7 ? 0.5 : t < 5.0 ? 0.4 : 0.2;
  if (TO.kind === 'flip') return t < 1.5 ? 0.62 : 0;
  return t < 1.4 ? 0.62 : t < 2.2 ? 0.35 : 0;
}
/* повертає true, коли анімація щойно завершилась */
export function tickTakeoff(dt) {
  if (!TO.on) return false;
  TO.t += dt;
  const t = TO.t, R = L.propR || 6;
  let theta = 0, hop = 0;
  if (TO.kind === 'ok') {
    const H = TO.lift;
    if (t >= 0.7 && t < 1.9) hop = H * ease((t - 0.7) / 1.2);
    else if (t >= 1.9 && t < 3.7) hop = H + 0.05 * R * Math.sin((t - 1.9) * 3.4);
    else if (t >= 3.7 && t < 5.0) hop = H * (1 - ease((t - 3.7) / 1.3));
  } else if (TO.kind === 'flip') {
    /* 0,6–1,55 с — перекидання через поганий кут; 1,55–2,7 — лежить на спині; 2,7–3,7 — повертаємо назад */
    if (t >= 0.6 && t < 1.55) { const u = (t - 0.6) / 0.95; theta = Math.PI * u * u; hop = 0.3 * R * Math.sin(Math.PI * u); }
    else if (t >= 1.55 && t < 2.7) theta = Math.PI;
    else if (t >= 2.7) theta = Math.PI * (1 - ease(Math.min(1, (t - 2.7) / 1.0)));
  } else {
    if (t >= 0.6 && t < 1.4) { const u = ease((t - 0.6) / 0.8); theta = 0.5 * u; hop = 0.15 * R * u; }
    else if (t >= 1.4 && t < 2.2) { theta = 0.5 + 0.06 * Math.sin((t - 1.4) * 14); hop = 0.15 * R; }
    else if (t >= 2.2) { const u = ease(Math.min(1, (t - 2.2) / 0.7)); theta = 0.5 * (1 - u); hop = 0.15 * R * (1 - u); }
  }
  /* поворот навколо точки опори P (кут з поганим пропом): X' = q·X + (P − q·P), плюс підйом над землею */
  _q.setFromAxisAngle(TO.axis, theta);
  const lift = TO.kind === 'ok' ? hop : Math.max(hop, needLift(_q));
  root.quaternion.copy(_q);
  root.position.copy(TO.P).sub(_a.copy(TO.P).applyQuaternion(_q)); root.position.y += lift;
  /* тінь іде за дроном і блідне з висотою */
  TO.cur.copy(TO.c0).applyQuaternion(_q).add(root.position);
  if (shadowMesh) {
    shadowMesh.position.set(TO.cur.x, -0.01, TO.cur.z);
    shadowMesh.material.opacity = 1 - 0.55 * clamp(lift / (1.6 * R), 0, 1);
  }
  if (t >= TO.dur) { takeoffStop(); return true; }
  return false;
}
