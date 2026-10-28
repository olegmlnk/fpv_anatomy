/* Курс по БПЛА · процедурні 3D-моделі вузлів для 5″, 7″, 10″ і гекси.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= BUILDERS: 5″, 7″, 10″, HEX ================= */
function buildFrame() {
  if (plat().micro) return buildFrameWhoop();
  const cid = 'frame', c = comps[cid], lay = LAY();
  const carbon = mk(cid, { c: '#ffffff', map: TEX.carbon, r: 0.36, m: 0.2 });
  const alu = mk(cid, { c: '#434a52', m: 0.85, r: 0.3 });
  const screw = mk(cid, { c: '#a2a9b0', m: 1, r: 0.28 });
  const [bw, bl] = lay.body, [aw, at] = lay.arm;
  const bs = rrect(bw, bl, 0.8);
  bs.holes.push(rrect(Math.min(1.4, bw * 0.3), 1.2, 0.4, 0, bl / 2 - 1.3, true));
  bs.holes.push(rrect(1.2, 1.0, 0.4, 0, -(bl / 2 - 1.0), true));
  add(cid, slab(bs, 0.3), carbon);
  L.mp.forEach(p => {
    const s = armStart(p), dx = p.x - s.x, dz = p.z - s.y, len = Math.hypot(dx, dz);
    const arm = add(cid, slab(capsule(len, aw), at), carbon, [s.x, 0, s.y]);
    arm.rotation.y = Math.atan2(-dz, dx);
    add(cid, cyl(lay.pad, lay.pad, at, 36), carbon, [p.x, at / 2, p.z]);
  });
  const half = Math.max(1.02, camOpt().size / 2 + 0.06), cz = -lay.camZ, f = cz + 1.3, b = cz - 1.4;
  for (const sx of [-1, 1]) {
    const sh = new T.Shape();
    sh.moveTo(b, 0.3); sh.lineTo(f, 0.3); sh.lineTo(f, 2.0); sh.lineTo(f - 0.9, 3.15); sh.lineTo(b, 3.15); sh.lineTo(b, 0.3);
    const h = new T.Path(); h.absarc(cz, 1.72, 0.16, 0, Math.PI * 2, true); sh.holes.push(h);
    const g = new T.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }); g.rotateY(Math.PI / 2);
    add(cid, g, carbon, [sx > 0 ? half : -(half + 0.22), 0, 0]);
  }
  const top = new T.Group(); c.g.add(top); c.parts.top = top;
  const [tw, tl, tcz] = lay.top, bz = battPos().zc, slx = tw / 2 - 0.55;
  const ts = rrect(tw, tl, 0.6, 0, tcz);
  ts.holes.push(rrect(0.28, 2.1, 0.12, slx, -bz, true));
  ts.holes.push(rrect(0.28, 2.1, 0.12, -slx, -bz, true));
  if (cfg.platform === 'p5') ts.holes.push(rrect(1.2, 0.9, 0.35, 0, -2.6, true));
  add(cid, slab(ts, 0.22), carbon, [0, 3.2, 0], null, top);
  lay.stand.forEach(([x, z]) => {
    add(cid, cyl(0.24, 0.24, 2.9, 6), alu, [x, 1.75, z], null, top);
    add(cid, cyl(0.21, 0.21, 0.08, 12), screw, [x, 3.47, z], null, top);
  });
}

function motorDims(o) {
  const micro = !!plat().micro;
  return {
    micro, R: micro ? (o.st[0] + 2.5) / 20 : (o.st[0] + 5.5) / 20, H: (o.st[1] + 4.5) / 10,
    bh: micro ? 0.1 : 0.3, ct: micro ? 0.04 : 0.1, sr: micro ? 0.075 : 0.25, sl: micro ? 0.35 : 0.95
  };
}
function buildMotors() {
  const cid = 'motors', c = comps[cid], o = opt('motors'), d = motorDims(o), { R, H, bh, ct, sr, sl } = d;
  const base = mk(cid, { c: '#1f2226', m: 0.6, r: 0.42 });
  const bell = mk(cid, { c: o.col, m: 0.72, r: 0.3, side: T.DoubleSide });
  const capM = mk(cid, { c: '#17191c', m: 0.55, r: 0.35 });
  const copper = mk(cid, { c: '#b8733a', m: 0.9, r: 0.35 });
  const steel = mk(cid, { c: '#cdd2d7', m: 1, r: 0.22 });
  const band = mk(cid, { c: '#e9ecef', m: 0.3, r: 0.4 });
  const ts = new T.Shape(); ts.absarc(0, 0, R - 0.03 * (R / 1.38), 0, Math.PI * 2, false);
  for (let k = 0; k < 5; k++) {
    const a = k / 5 * Math.PI * 2, h = new T.Path();
    h.absarc(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6, R * 0.2, 0, Math.PI * 2, true); ts.holes.push(h);
  }
  const hb = new T.Path(); hb.absarc(0, 0, sr * 1.08, 0, Math.PI * 2, true); ts.holes.push(hb);
  const my = d.micro ? LAY().motorY : LAY().arm[1];
  c.parts.rot = [];
  L.seatY = my + bh + H + ct; L.motorR = R; L.motorY = my;
  L.mp.forEach((p, i) => {
    const g = new T.Group(); g.position.set(p.x, my, p.z); c.g.add(g);
    add(cid, cyl(R * 0.94, R * 0.97, bh, 32), base, [0, bh / 2, 0], null, g);
    add(cid, cyl(R * 0.8, R * 0.8, H * 0.82, 24), copper, [0, bh + H * 0.41, 0], null, g);
    const rot = new T.Group(); rot.position.y = bh; g.add(rot); c.parts.rot[i] = rot;
    add(cid, cyl(R, R, H, 40, true), bell, [0, H / 2 + 0.01, 0], null, rot);
    add(cid, cyl(R * 1.01, R * 1.01, H * 0.14, 40, true), band, [0, H * 0.2, 0], null, rot);
    add(cid, slab(ts, ct, 0), capM, [0, H, 0], null, rot);
    add(cid, cyl(sr, sr, sl, 16), steel, [0, H + sl / 2, 0], null, rot);
  });
}

function bladeGeo(R, P, n, micro) {
  const s = R / 6.48;
  const r0 = micro ? 0.17 : 0.42 * Math.min(1.4, Math.max(0.75, s));
  const cm = (n === 2 ? 1.5 : 1.38) * Math.pow(s, 0.9) * (micro ? 1.35 : 1);
  const th = micro ? 0.03 : 0.07 * Math.min(1.6, Math.max(1, s));
  const N = 16, tE = 0.965;
  const ch = t => (t < 0.28 ? cm * (0.6 + 0.4 * Math.sin(t / 0.28 * Math.PI / 2)) : cm * (1 - 0.58 * Math.pow((t - 0.28) / 0.72, 1.3)));
  const xs = t => r0 + (R - r0) * t;
  const sh = new T.Shape();
  sh.moveTo(xs(0), -0.42 * ch(0));
  for (let i = 1; i <= N; i++) { const t = tE * i / N; sh.lineTo(xs(t), -0.42 * ch(t) - 0.08 * s * Math.sin(t * Math.PI)); }
  sh.quadraticCurveTo(R + 0.1 * s, 0.05 * s, xs(tE), 0.58 * ch(tE));
  for (let i = N - 1; i >= 0; i--) { const t = tE * i / N; sh.lineTo(xs(t), 0.58 * ch(t) + 0.06 * s * Math.sin(t * Math.PI)); }
  const g = new T.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -th / 2); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const phi = Math.min(0.62, Math.atan(P / (2 * Math.PI * Math.max(x, r0 * 0.7))));
    const cs = Math.cos(phi), sn = Math.sin(phi);
    pos.setXYZ(i, x, y * cs - z * sn, y * sn + z * cs);
  }
  g.computeVertexNormals();
  return g;
}
function buildProps() {
  const cid = 'props', c = comps[cid], o = opt('props'), micro = !!plat().micro;
  const R = o.d * 2.54 / 2, s = R / 6.48, geo = bladeGeo(R, o.pitch * 2.54, o.n, micro);
  const hubR = micro ? 0.24 : 0.6 * Math.min(1.5, Math.max(0.85, s)), hubH = micro ? 0.22 : 0.55 * Math.min(1.4, Math.max(0.9, s));
  const hubM = mk(cid, { c: o.col, r: 0.4 });
  const nutM = mk(cid, { c: '#b9bec4', m: 1, r: 0.25 });
  c.parts.spin = []; c.parts.hand = []; c.parts.blur = []; c.parts.bm = [];
  L.propR = R; L.hubH = hubH;
  const dirs = motorDirs();
  L.mp.forEach((p, i) => {
    const pg = new T.Group(); pg.position.set(p.x, L.seatY, p.z); c.g.add(pg);
    const spin = new T.Group(); pg.add(spin); c.parts.spin[i] = spin;
    const hand = new T.Group(); spin.add(hand); c.parts.hand[i] = hand;
    const bm = mk(cid, { c: o.col, r: 0.45, o: 0.9, side: T.DoubleSide }); bm.userData.dyn = true; c.parts.bm[i] = bm;
    for (let k = 0; k < o.n; k++) add(cid, geo, bm, [0, hubH * 0.55, 0], [0, k / o.n * Math.PI * 2, 0], hand);
    hand.scale.x = dirs[i] < 0 ? -1 : 1;
    add(cid, cyl(hubR, hubR * 1.1, hubH, 24), hubM, [0, hubH / 2, 0], null, spin);
    if (!micro) add(cid, cyl(0.42 * s, 0.42 * s, 0.42 * s, 6), nutM, [0, hubH + 0.21 * s, 0], null, spin);
    const bmat = new T.MeshBasicMaterial({ map: TEX.blur, color: C(o.col), transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide, toneMapped: false });
    bmat.userData = { blur: true }; c.mats.push(bmat);
    const disc = new T.Mesh(new T.RingGeometry(hubR, R, 72), bmat);
    disc.rotation.x = -Math.PI / 2; disc.position.y = hubH * 0.58; pg.add(disc); c.parts.blur[i] = disc;
  });
}

function escWires(cid, start, mid, p, mat, endY, fStart) {
  const s = armStart(p), endD = Math.hypot(p.x - s.x, p.z - s.y);
  const dir = new T.Vector2(p.x - s.x, p.z - s.y).normalize(), nrm = new T.Vector2(-dir.y, dir.x), ay = LAY().arm[1] + 0.07;
  const at = (f, yy, off) => [s.x + (p.x - s.x) * f + nrm.x * off, yy, s.y + (p.z - s.y) * f + nrm.y * off];
  const f1 = 1 - (L.motorR + 0.1) / endD, f2 = 1 - (L.motorR * 0.8) / endD;
  [-0.11, 0, 0.11].forEach(off => {
    const pts = [start(off)];
    if (mid) pts.push(mid(off));
    pts.push(at(fStart, ay, off), at(f1, ay, off), at(f2, endY, off));
    tube(cid, pts, 0.05, mat, true, 56);
  });
}
function buildESC() {
  const o = opt('esc');
  if (o.type === 'aio') return buildESCWhoop();
  const cid = 'esc', c = comps[cid], y = 0.75, z0 = 0.3;
  const pcb = mk(cid, { c: o.pcb, r: 0.55, m: 0.1 });
  const fet = mk(cid, { c: '#0b0c0e', r: 0.45, m: 0.2 });
  const chip = mk(cid, { c: '#26292d', r: 0.5 });
  const gold = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
  const rub = mk(cid, { c: '#1b1c1e', r: 0.9 });
  const nyl = mk(cid, { c: '#e7e2d6', r: 0.6 });
  const wireM = mk(cid, { c: '#2a2d31', r: 0.6 });
  add(cid, box(3.6, 0.16, 3.6), pcb, [0, y, z0]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(cid, new T.TorusGeometry(0.2, 0.08, 8, 16), rub, [sx * 1.525, y, z0 + sz * 1.525], [Math.PI / 2, 0, 0]);
    add(cid, cyl(0.1, 0.1, 1.9, 8), nyl, [sx * 1.525, 1.25, z0 + sz * 1.525]);
  }
  for (const sx of [-1, 1]) add(cid, box(0.6, 0.05, 0.42), gold, [sx * 0.45, y + 0.1, 1.86]);
  const motorEndY = L.motorY + 0.25;
  if (o.type === '4in1') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let a = 0; a < 2; a++) for (let b = 0; b < 3; b++) add(cid, box(0.34, 0.12, 0.3), fet, [sx * (0.62 + a * 0.42), y + 0.14, z0 + sz * (0.42 + b * 0.38)]);
      add(cid, box(0.4, 0.08, 0.4), chip, [sx * 0.42, y + 0.12, z0 + sz * 0.05]);
      for (let k = 0; k < 3; k++) add(cid, box(0.26, 0.04, 0.22), gold, [sx * 1.62, y + 0.09, z0 + sz * (0.95 + k * 0.3)]);
    }
    L.mp.forEach(p => {
      const sx = Math.sign(p.x), sz = Math.sign(p.z) || 1;
      escWires(cid, off => [sx * 1.62, y + 0.12, z0 + sz * (1.25 + off)], off => [sx * 2.05, 0.74, z0 + sz * 1.7 + off], p, wireM, motorEndY, 0.45);
    });
    c.parts.kind = '4in1';
  } else {
    /* PDB + окремі ESC на променях */
    const shrink = mk(cid, { c: '#2c5fa8', r: 0.4, o: 0.85 });
    const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cid, box(0.7, 0.05, 0.7), gold, [sx * 0.95, y + 0.1, z0 + sz * 0.95]);
    add(cid, box(1.2, 0.05, 1.2), gold, [0, y + 0.1, z0]);
    c.parts.escPos = [];
    L.mp.forEach(p => {
      const s = armStart(p), v = new T.Vector2(p.x - s.x, p.z - s.y), len = v.length(); v.normalize();
      const ay = LAY().arm[1] + 0.16, f = 0.5, ex = s.x + (p.x - s.x) * f, ez = s.y + (p.z - s.y) * f;
      const g = new T.Group(); g.position.set(ex, ay, ez); g.rotation.y = Math.atan2(-v.y, v.x); c.g.add(g);
      add(cid, box(2.2, 0.25, 1.0), shrink, [0, 0, 0], null, g);
      add(cid, box(1.6, 0.06, 0.7), pcb, [0, 0.14, 0], null, g);
      c.parts.escPos.push(new T.Vector3(ex, ay, ez));
      const n = new T.Vector2(-v.y, v.x);
      [[0.18, red], [-0.18, blk]].forEach(([off, m]) => tube(cid, [[Math.sign(p.x) * 0.9 + n.x * off * 0.3, y + 0.14, z0 + Math.sign(p.z || 1) * 0.9], [s.x + n.x * off, ay - 0.05, s.y + n.y * off], [ex - v.x * 1.1 + n.x * off, ay, ez - v.y * 1.1 + n.y * off]], 0.07, m, true, 32));
      escWires(cid, off => [ex + v.x * 1.1 + n.x * off, ay, ez + v.y * 1.1 + n.y * off], null, p, wireM, motorEndY, 0.62);
    });
    c.parts.kind = 'sep';
  }
}

function buildFC() {
  const o = opt('fc');
  if (o.id === 'aio1s') return buildFCWhoop();
  const cid = 'fc', c = comps[cid], y = 1.75, z0 = 0.3, ty = y + 0.08;
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
  add(cid, box(0.42, 0.08, 0.42), small, [-0.95, ty + 0.04, z0 - 1.05]);
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
  Object.assign(c.parts, {
    chipM, ledP, ledS, gP, gS, usbPort: new T.Vector3(-1.8, ty + 0.15, z0 + 0.4), usbScale: 1,
    mcu: new T.Vector3(0.15, ty + 0.15, z0), btnPos: new T.Vector3(-1.1, ty + 0.2, z0 + 1.25), osd: new T.Vector3(-0.95, ty + 0.1, z0 - 1.05),
    camPad: new T.Vector3(-1.72, ty + 0.02, z0 - 0.75)
  });
}

function buildRX() {
  const o = opt('rx');
  if (o.ant === 'aio') return buildRXWhoop();
  const cid = 'rx', c = comps[cid], cx = 1.5, cy = 0.42, cz = 3.3, lay = LAY();
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
  const pts = [], zr = bodyRear();
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
      const F = lay.rearMount ? new T.Vector3(0, 1.35, zr + 0.15) : new T.Vector3(0, 3.6, 5.45);
      tube(cid, [ufl, [cx - 0.35, 0.9, 4.95], lay.rearMount ? [0.6, 1.1, zr - 0.5] : [0.9, 2.6, 5.45], F], 0.045, coaxM, true);
      add(cid, box(0.5, 0.42, 0.62), mk(cid, { c: '#141618', r: 0.6 }), F);
      const leg = mk(cid, { c: '#1b1d20', r: 0.5 }), tip = mk(cid, { c: '#3a3f46', r: 0.5 });
      for (const sx of [-1, 1]) {
        const d = lay.rearMount ? new T.Vector3(sx * 0.55, 0.3, 0.78).normalize() : new T.Vector3(sx * 0.55, 0.45, 0.7).normalize();
        const m = add(cid, cyl(0.085, 0.085, 8.2, 10), leg); alignTo(m, F, d, 8.2);
        add(cid, new T.SphereGeometry(0.11, 12, 8), tip, F.clone().addScaledVector(d, 8.2));
      }
      pts.push(F.clone());
    } else {
      const B = lay.rearMount ? new T.Vector3(0.6, 1.0, zr - 0.15) : new T.Vector3(0.6, 3.48, 5.45);
      const d = lay.rearMount ? new T.Vector3(0.45, 0.25, 0.86).normalize() : new T.Vector3(0.35, 0.8, 0.5).normalize();
      tube(cid, [ufl, [cx - 0.35, 0.9, 4.95], lay.rearMount ? [0.9, 1.0, zr - 0.7] : [1.05, 2.5, 5.4], B], 0.045, coaxM, true);
      pts.push(T_ant(B, d, new T.Vector3().crossVectors(d, UP).normalize(), 3.0));
      if (o.ant === 'div') {
        const B2 = new T.Vector3(-B.x, B.y, B.z), d2 = new T.Vector3(-d.x, d.y, d.z);
        const ax2 = UP.clone().addScaledVector(d2, -UP.dot(d2)).normalize();
        tube(cid, [[cx - 0.1, cy + 0.12, cz + 0.85], [0.2, 1.0, Math.min(5.0, B2.z - 0.5)], lay.rearMount ? [-0.4, 1.0, zr - 0.6] : [-0.35, 2.6, 5.45], B2], 0.045, coaxM, true);
        pts.push(T_ant(B2, d2, ax2, 3.0));
      }
    }
  }
  Object.assign(c.parts, { ledM, glow, antPts: pts, board: new T.Vector3(cx, cy, cz), uart: new T.Vector3(1.3, 1.83, 1.62) });
}

function buildVTX() {
  const o = opt('vtx');
  if (o.id === 'aiovtx') return buildVTXWhoop();
  const cid = 'vtx', c = comps[cid];
  const pcb = mk(cid, { c: '#121519', r: 0.5 });
  const shield = mk(cid, { c: '#cfd5da', m: 0.95, r: 0.28 });
  const fin = mk(cid, { c: '#8e959c', m: 0.9, r: 0.35 });
  const nyl = mk(cid, { c: '#e7e2d6', r: 0.6 });
  const gold = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
  const wireM = mk(cid, { c: '#3a3f45', r: 0.6 });
  const posts = (cx, cz, hw, hd, top) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cid, cyl(0.08, 0.08, top - 0.3, 8), nyl, [cx + sx * hw, 0.3 + (top - 0.3) / 2, cz + sz * hd]); };
  let conns = [], center;
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
    center = new T.Vector3(cx, y + 0.2, cz);
  } else if (o.id === 'hd') {
    const cx = -0.15, cz = 3.95, y = 1.75;
    posts(cx, cz, 1.1, 1.0, y - 0.37);
    add(cid, box(2.6, 0.75, 2.4), shield, [cx, y, cz]);
    for (let k = 0; k < 9; k++) add(cid, box(0.07, 0.42, 2.1), fin, [cx - 1.15 + k * 0.2875, y + 0.58, cz]);
    for (const sx of [-1, 1]) add(cid, cyl(0.13, 0.13, 0.26, 12), gold, [cx + sx * 0.6, y + 0.05, cz + 1.25], [Math.PI / 2, 0, 0]);
    conns = [new T.Vector3(cx - 0.6, y + 0.05, cz + 1.38), new T.Vector3(cx + 0.6, y + 0.05, cz + 1.38)];
    tube(cid, [[cx - 1.1, y - 0.2, cz - 1.15], [-1.4, 1.7, 2.3], [-1.1, 1.85, 1.75]], 0.07, wireM, true);
    center = new T.Vector3(cx, y + 0.3, cz);
  } else {
    const cx = -0.35, cz = 4.0, y = 1.5;
    posts(cx, cz, 0.85, 0.85, y - 0.07);
    add(cid, box(2.0, 0.14, 2.0), mk(cid, { c: '#0f2a1d', r: 0.5 }), [cx, y, cz]);
    add(cid, box(1.7, 0.32, 1.7), mk(cid, { c: '#3a3f45', m: 0.8, r: 0.35 }), [cx, y + 0.23, cz]);
    for (let k = 0; k < 6; k++) add(cid, box(0.07, 0.3, 1.6), fin, [cx - 0.7 + k * 0.28, y + 0.54, cz]);
    add(cid, cyl(0.13, 0.13, 0.18, 12), gold, [cx + 0.4, y + 0.14, cz + 0.88]);
    conns = [new T.Vector3(cx + 0.4, y + 0.22, cz + 0.95)];
    tube(cid, [[cx - 0.8, y - 0.05, cz - 0.9], [-1.25, 1.75, 2.35], [-1.1, 1.85, 1.75]], 0.07, wireM, true);
    center = new T.Vector3(cx, y + 0.3, cz);
  }
  c.parts.conns = conns; c.parts.center = center;
  c.parts.input = o.kind === 'analog' ? new T.Vector3(-0.9, 1.6, 3.0) : new T.Vector3(-1.0, 1.6, 2.85);
  c.parts.uart = new T.Vector3(-1.1, 1.85, 1.75);
}

function buildVTXAnt() {
  const o = opt('vtxant');
  if (o.id === 'whip') return buildVTXAntWhoop();
  const cid = 'vtxant', c = comps[cid], v = opt('vtx'), lay = LAY();
  const tpu = mk(cid, { c: '#33383e', r: 0.85 });
  const coax = mk(cid, { c: '#1e2124', r: 0.55 });
  const mz = lay.rearMount ? bodyRear() + 0.25 : 5.7;
  const mounts = v.dual ? [[-0.75, 1.9, mz], [0.75, 1.9, mz]] : [[0, 1.9, mz]];
  const conns = (comps.vtx.parts.conns || []);
  c.parts.tips = []; c.parts.mounts = [];
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
    c.parts.tips.push(tip); c.parts.mounts.push(M);
  });
}

function buildCam() {
  const o = camOpt();
  if (o.id === 'c03') return buildCamWhoop();
  const cid = 'cam', c = comps[cid], s = o.size, lay = LAY();
  const g = new T.Group(); g.position.set(0, 1.72, lay.camZ); g.rotation.x = cfg.tilt * Math.PI / 180; c.g.add(g); c.parts.pivot = g;
  const body = mk(cid, { c: o.thermal ? '#2d3136' : '#1f2225', r: 0.55, m: 0.15 });
  const ringM = mk(cid, { c: o.ring, m: 0.8, r: 0.3 });
  const glass = o.thermal ? mk(cid, { c: '#2d2348', r: 0.1, m: 0.9 }) : mk(cid, { c: '#0b1522', r: 0.05, m: 0.3 });
  const screw = mk(cid, { c: '#c9a34a', m: 1, r: 0.3 });
  const lr = o.lens, fz = -s * 0.45, depth = o.thermal ? s * 1.1 : s * 0.9;
  add(cid, box(s, s, depth), body, [0, 0, (depth - s * 0.9) / 2], null, g);
  if (o.thermal) {
    const fin = mk(cid, { c: '#5b6168', m: 0.8, r: 0.4 });
    for (let k = 0; k < 5; k++) add(cid, box(s * 0.9, 0.06, s * 0.3), fin, [0, -s * 0.36 + k * s * 0.18, s * 0.55 + 0.15], null, g);
  }
  add(cid, cyl(lr, lr * 1.08, o.thermal ? 1.0 : 0.8, 32), body, [0, 0, fz - (o.thermal ? 0.5 : 0.4)], [Math.PI / 2, 0, 0], g);
  const lz = fz - (o.thermal ? 0.98 : 0.78);
  add(cid, new T.TorusGeometry(lr * 1.01, 0.06, 8, 32), ringM, [0, 0, lz], null, g);
  const gl = add(cid, new T.SphereGeometry(lr * 0.86, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass, [0, 0, lz - 0.02], [-Math.PI / 2, 0, 0], g);
  gl.scale.set(1, o.thermal ? 0.22 : 0.38, 1);
  for (const sx of [-1, 1]) add(cid, cyl(0.12, 0.12, 0.1, 12), screw, [sx * (s / 2 + 0.03), 0, 0], [0, 0, Math.PI / 2], g);
  if (o.digital) add(cid, box(s * 0.7, s * 0.25, 0.25), mk(cid, { c: '#c49a3a', m: 0.6, r: 0.4 }), [0, -s * 0.2, s * 0.5], null, g);
  const z = lay.camZ, cabM = mk(cid, { c: o.digital ? '#8a6a2a' : '#2b2f33', r: 0.6 }), st = [0, 1.75, z + 0.9 + (o.thermal ? 0.3 : 0)];
  if (o.digital) tube(cid, [st, [-0.75, 2.55, z + 1.45], [-1.95, 2.55, -1.2], [-1.95, 2.45, 1.9], comps.vtx.parts.input], 0.065, cabM, true);
  else tube(cid, [st, [-0.75, 2.55, z + 1.45], [-1.95, 2.45, Math.min(-1.6, z + 2.6)], [-2.0, 1.95, -0.75], comps.fc.parts.camPad || new T.Vector3(-1.72, 1.85, -0.45)], 0.065, cabM, true);
  c.parts.lens = new T.Vector3(0, 1.72, z + lz);
  c.parts.out = new T.Vector3(0, 1.75, z + 0.9);
}

function buildBattery() {
  const o = opt('battery');
  if (plat().micro) return buildBatteryWhoop();
  const cid = 'battery', c = comps[cid], bp = battPos(), { W, H, Lz, zc } = bp;
  const y0 = 3.47, mah = Math.round(o.ah * 1000);
  add(cid, box(Math.min(W, LAY().top[0] - 0.3), 0.05, Lz * 0.9), mk(cid, { c: '#26282b', r: 0.95 }), [0, 3.445, zc]);
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
    const [nx, ny, nz] = o.cells;
    const cellM = mk(cid, { c: '#3d7fd0', r: 0.35, m: 0.2 }), endM = mk(cid, { c: '#c7ccd2', m: 0.9, r: 0.3 });
    const cg = cyl(1.02, 1.02, 6.88, 24);
    for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
      add(cid, cg, cellM, [(ix - (nx - 1) / 2) * 2.08, y0 + 1.05 + iy * 2.08, zc + (iz - (nz - 1) / 2) * 7.0], [Math.PI / 2, 0, 0]);
    }
    for (const sz of [-1, 1]) add(cid, box(W - 0.3, H - 0.4, 0.04), endM, [0, y0 + H / 2, zc + sz * (Lz / 2 - 0.04)]);
    add(cid, box(W + 0.06, H + 0.06, Lz + 0.05), mk(cid, { c: o.col, r: 0.3, o: 0.36, dw: false }), [0, y0 + H / 2, zc]);
    const lt = textTex([{ t: `Li-ion ${o.s}S${o.p}P`, s: 40 }, { t: `21700 · ${fmt(mah)} мА·год`, s: 28, w: 500 }], { w: 512, h: 256, fg: '#ffffff', lh: 52, bg: 'rgba(16,40,38,.82)' });
    c.tex.push(lt);
    add(cid, new T.PlaneGeometry(Math.min(Lz * 0.6, 4.6), Math.min(W * 0.75, 2.3)), mk(cid, { c: '#ffffff', map: lt, r: 0.5 }), [0, y0 + H + 0.04, zc], [-Math.PI / 2, 0, -Math.PI / 2]);
  }
  const strap = mk(cid, { c: '#17191c', r: 0.8 });
  add(cid, box(W + 0.14, 0.05, 2.0), strap, [0, y0 + H + 0.06, zc]);
  for (const sx of [-1, 1]) add(cid, box(0.05, H + 0.32, 2.0), strap, [sx * (W / 2 + 0.07), (3.17 + y0 + H) / 2, zc]);
  add(cid, box(Math.max(3.0, W), 0.05, 2.0), strap, [0, 3.16, zc]);
  add(cid, box(0.9, 0.12, 2.15), mk(cid, { c: '#8d949b', m: 0.9, r: 0.3 }), [0.7, y0 + H + 0.12, zc]);
  const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
  const xtX = LAY().xtX, r = bp.rear;
  [[-0.15, blk], [0.15, red]].forEach(([off, m]) => tube(cid, [[-0.55 + off, y0 + 0.5, r - 0.05], [xtX + 0.6 + off, y0 + 0.42, r + 0.1], [xtX + off, 3.82, r + 0.15]], 0.11, m, true));
  tube(cid, [[0.7, y0 + H - 0.5, r - 0.05], [0.85, y0 + H + 0.05, r + 0.3], [0.7, y0 + H + 0.12, r - 0.25]], 0.06, mk(cid, { c: '#efebe0', r: 0.6 }), true);
  add(cid, box(0.85, 0.22, 0.3), mk(cid, { c: '#f0ece2', r: 0.6 }), [0.7, y0 + H + 0.16, r - 0.55]);
  c.parts.rear = new T.Vector3(0, y0 + 0.5, r); c.parts.center = new T.Vector3(0, y0 + H / 2, zc);
}

function buildPower() {
  const o = opt('power');
  if (o.conn === 'bt20') return buildPowerWhoop();
  const cid = 'power', c = comps[cid], lay = LAY(), bp = battPos();
  const big = o.conn === 'xt90', s = big ? 1.25 : 1;
  const yel = mk(cid, { c: '#F2C230', r: 0.5 }), yel2 = mk(cid, { c: '#E0AD18', r: 0.55 });
  const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
  const x = lay.xtX, y = 3.42 + 0.4 * s, zf = bp.rear + 0.6 * s, zm = bp.rear + 1.5 * s;
  add(cid, box(0.85 * s, 0.8 * s, 0.85 * s), yel2, [x, y, zf]);
  add(cid, box(0.85 * s, 0.8 * s, 0.85 * s), yel, [x, y, zm]);
  add(cid, box(0.9 * s, 0.06, 0.1), yel2, [x, y + 0.25 * s, (zf + zm) / 2]);
  const sideX = -(lay.body[0] / 2 + 0.15), tail = zm + 0.42 * s;
  [[-0.16, blk, -0.45], [0.16, red, 0.45]].forEach(([off, m, px]) => {
    tube(cid, [[x + off, y, tail], [x - 0.6 + off * 0.5, 3.2, tail + 0.4], [sideX, 1.8, Math.min(tail, bodyRear() - 0.3)], [sideX + 0.05, 1.05, 3.2], [px * 0.6 - 0.5, 0.95, 2.35], [px, 0.88, 1.92]], 0.11 * (big ? 1.2 : 1), m, true, 72);
  });
  if (o.capV) {
    const r = big && o.capV >= 50 ? 0.5 : o.capV === 50 ? 0.36 : 0.42, len = big && o.capV >= 50 ? 2.0 : o.capV === 50 ? 1.3 : 1.6, cz = 2.55;
    add(cid, cyl(r, r, len, 28), mk(cid, { c: o.capV >= 63 ? '#4a2a1d' : '#1d2c4f', r: 0.5 }), [0, 0.75, cz], [0, 0, Math.PI / 2]);
    add(cid, cyl(r + 0.01, r + 0.01, 0.14, 28, true), mk(cid, { c: '#d3dbe5', r: 0.5 }), [len / 2 - 0.3, 0.75, cz], [0, 0, Math.PI / 2]);
    const cap = mk(cid, { c: '#c7ccd2', m: 0.9, r: 0.3 });
    for (const sx of [-1, 1]) add(cid, cyl(r * 0.95, r * 0.95, 0.03, 24), cap, [sx * (len / 2 + 0.01), 0.75, cz], [0, 0, Math.PI / 2]);
    const leg = mk(cid, { c: '#c9ced3', m: 1, r: 0.3 });
    for (const sx of [-1, 1]) tube(cid, [[sx * 0.25, 0.75, cz - r + 0.04], [sx * 0.4, 0.85, 2.05], [sx * 0.45, 0.88, 1.92]], 0.03, leg, true, 16);
    c.parts.cap = new T.Vector3(0, 0.75, cz);
  }
  c.parts.xt = new T.Vector3(x, y, (zf + zm) / 2);
}

function buildGPS() {
  const cid = 'gps', c = comps[cid], o = opt('gps'), lay = LAY();
  if (lay.micro) { c.parts.anchor = new T.Vector3(0, 2.4, 1.2); return; }
  let gx = 0, gz = 4.5, mast = 0;
  if (lay.rearMount) {
    const [tw, tl, tcz] = lay.top, bp = battPos();
    gx = tw / 2 - 0.95; gz = -tcz + tl / 2 - 1.0;
    if (gz + 0.95 > bp.front && gz - 0.95 < bp.rear && Math.abs(gx) - 0.95 < bp.W / 2) mast = bp.top - 3.42 + 0.45;
    else mast = 0.2;
  }
  const y = 3.42 + mast;
  c.parts.anchor = new T.Vector3(gx, y + 0.5, gz);
  if (o.id === 'none') return;
  if (mast > 0.3) {
    add(cid, cyl(0.13, 0.13, mast, 10), mk(cid, { c: '#ffffff', map: TEX.carbon, r: 0.4, m: 0.2 }), [gx, 3.42 + mast / 2, gz]);
    add(cid, cyl(0.35, 0.35, 0.12, 16), mk(cid, { c: '#3a3f45', r: 0.8 }), [gx, 3.48, gz]);
  }
  add(cid, box(1.9, 0.25, 1.9), mk(cid, { c: '#3a3f45', r: 0.85 }), [gx, y + 0.125, gz]);
  add(cid, box(1.8, 0.12, 1.8), mk(cid, { c: '#13224a', r: 0.5 }), [gx, y + 0.31, gz]);
  add(cid, box(1.32, 0.02, 1.32), mk(cid, { c: '#c7ccd2', m: 1, r: 0.3 }), [gx, y + 0.38, gz]);
  add(cid, box(1.22, 0.4, 1.22), mk(cid, { c: '#c8a46a', r: 0.6 }), [gx, y + 0.59, gz]);
  add(cid, cyl(0.12, 0.12, 0.05, 16), mk(cid, { c: '#d9dde1', m: 1, r: 0.3 }), [gx, y + 0.81, gz]);
  add(cid, box(0.1, 0.05, 0.1), mk(cid, { c: '#0d1f4a', e: '#3d7bff', ei: 1.4, keep: true }), [gx + 0.75, y + 0.39, gz - 0.75]);
  tube(cid, [[gx - 0.7, y + 0.3, gz - 0.85], [gx * 0.5 - 1.15, Math.max(2.8, y - 0.6), Math.min(gz - 1.3, 3.2)], [-1.0, 1.95, 2.2], [-0.9, 1.86, 1.7]], 0.06, mk(cid, { c: '#3a3f45', r: 0.6 }), true);
}

const BUILD = { frame: buildFrame, motors: buildMotors, props: buildProps, esc: buildESC, fc: buildFC, rx: buildRX, vtx: buildVTX, vtxant: buildVTXAnt, cam: buildCam, battery: buildBattery, power: buildPower, gps: buildGPS };
const EXPLODE = {
  frame: [0, 0, 0], motors: [0, 1.7, 0], props: [0, 4.2, 0], esc: [0, 1.4, 0], fc: [0, 3.2, 0],
  rx: [3.2, 0.6, 1.6], vtx: [-0.4, 1.8, 3.6], vtxant: [0, 2.6, 5.6], cam: [0, 0.7, -4.2],
  battery: [0, 10.2, 0], power: [-3.6, 1.2, 2.6], gps: [0, 7.6, 1.6]
};
const DEPENDS = {
  frame: ['frame', 'motors', 'props', 'esc'], motors: ['motors', 'props'], props: ['props'], esc: ['esc'],
  rx: ['rx'], vtx: ['frame', 'vtx', 'vtxant', 'cam'], fc: ['fc', 'cam'], vtxant: ['vtxant'], cam: ['frame', 'cam'], battery: ['frame', 'battery', 'power', 'gps'], power: ['power'], gps: ['gps']
};
