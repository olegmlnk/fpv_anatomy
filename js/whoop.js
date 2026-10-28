/* Курс по БПЛА · 3D-моделі tiny whoop (AIO-плата, дакти).
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= BUILDERS: TINY WHOOP (AIO) ================= */
function buildFrameWhoop() {
  const cid = 'frame', c = comps[cid], W = LAY();
  const plastic = mk(cid, { c: '#202428', r: 0.55, m: 0.05, side: T.DoubleSide });
  const canopy = mk(cid, { c: '#E8820F', r: 0.35, o: 0.5, dw: false, side: T.DoubleSide });
  const [y0, y1] = W.ductY, h = y1 - y0;
  L.mp.forEach(p => {
    add(cid, cyl(W.duct, W.duct, h, 56, true), plastic, [p.x, y0 + h / 2, p.z]);
    add(cid, new T.TorusGeometry(W.duct, 0.06, 6, 56), plastic, [p.x, y1, p.z], [Math.PI / 2, 0, 0]);
    add(cid, new T.TorusGeometry(W.duct, 0.09, 6, 56), plastic, [p.x, y0, p.z], [Math.PI / 2, 0, 0]);
    add(cid, cyl(0.62, 0.62, 0.12, 24), plastic, [p.x, W.motorY - 0.06, p.z]);
    for (let k = 0; k < 3; k++) {
      const a = k * 2 * Math.PI / 3 + Math.PI / 6 + Math.atan2(p.z, p.x), len = W.duct - 0.6, mid = 0.6 + len / 2;
      const sp = add(cid, box(len, 0.1, 0.16), plastic, [p.x + Math.cos(a) * mid, W.motorY - 0.06, p.z + Math.sin(a) * mid]);
      sp.rotation.y = -a;
    }
  });
  add(cid, slab(rrect(3.4, 3.4, 0.7), W.plateT, 0.01), plastic, [0, W.plateY, 0]);
  const bp = battPos();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    add(cid, box(0.08, W.plateY + 0.02, 0.5), plastic, [sx * (bp.W / 2 + 0.06), (W.plateY + 0.02) / 2, bp.zc + sz * 1.1]);
    add(cid, box(0.25, 0.06, 0.5), plastic, [sx * (bp.W / 2 - 0.05), 0.03, bp.zc + sz * 1.1]);
  }
  const dome = add(cid, new T.SphereGeometry(1.55, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), canopy, [0, W.plateY + W.plateT, 0.05]);
  dome.scale.set(1, 0.82, 1.22);
  c.parts.top = null;
}

function buildESCWhoop() {
  const cid = 'esc', c = comps[cid], W = LAY(), y = W.boardY + 0.06;
  const fet = mk(cid, { c: '#0b0c0e', r: 0.45, m: 0.2 });
  const gold = mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 });
  const wireM = mk(cid, { c: '#2a2d31', r: 0.6 });
  L.mp.forEach(p => {
    const sx = Math.sign(p.x), sz = Math.sign(p.z);
    for (let k = 0; k < 2; k++) add(cid, box(0.2, 0.07, 0.16), fet, [sx * 0.92, y, sz * (0.62 + k * 0.22)]);
    add(cid, box(0.22, 0.03, 0.22), gold, [sx * 1.2, y - 0.02, sz * 1.2]);
    const d = new T.Vector2(p.x, p.z).normalize();
    [-0.05, 0.05].forEach(off => tube(cid, [[sx * 1.2 + off, y, sz * 1.2], [sx * 1.55, W.plateY + 0.1, sz * 1.55 + off], [p.x - d.x * 0.75, W.motorY + 0.05, p.z - d.y * 0.75 + off], [p.x - d.x * 0.45, W.motorY + 0.18, p.z - d.y * 0.45]], 0.025, wireM, true, 32));
  });
  c.parts.kind = 'aio';
}

function buildFCWhoop() {
  const cid = 'fc', c = comps[cid], W = LAY(), o = opt('fc'), y = W.boardY;
  const pcb = mk(cid, { c: o.pcb, r: 0.5, m: 0.1 });
  const chipM = mk(cid, { c: '#222428', r: 0.45, keep: true });
  const small = mk(cid, { c: '#1d1f22', r: 0.5 });
  const steel = mk(cid, { c: '#c7ccd2', m: 1, r: 0.25 });
  const rub = mk(cid, { c: '#1b1c1e', r: 0.9 });
  const ledP = mk(cid, { c: '#5a1410', e: '#ff3b2f', ei: 1.6, keep: true });
  const ledS = mk(cid, { c: '#0d1f4a', e: '#3d7bff', ei: 1.8, keep: true });
  add(cid, box(W.board, 0.1, W.board), pcb, [0, y, 0]);
  const sh = y - (W.plateY + W.plateT);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(cid, cyl(0.13, 0.13, sh, 10), rub, [sx * 1.12, W.plateY + W.plateT + sh / 2, sz * 1.12]);
  add(cid, box(0.55, 0.08, 0.55), chipM, [0.1, y + 0.09, -0.2]);
  add(cid, box(0.25, 0.05, 0.25), small, [-0.45, y + 0.075, -0.55]);
  add(cid, box(0.4, 0.14, 0.5), steel, [-1.15, y + 0.12, 0.35]);
  add(cid, box(0.2, 0.06, 0.2), small, [-0.7, y + 0.08, 0.95]);
  c.parts.btn = add(cid, box(0.12, 0.05, 0.12), mk(cid, { c: '#e3e6e9', r: 0.5 }), [-0.7, y + 0.13, 0.95]);
  c.parts.btnY = y + 0.13;
  add(cid, box(0.12, 0.05, 0.09), ledP, [0.9, y + 0.07, -1.0]);
  add(cid, box(0.12, 0.05, 0.09), ledS, [1.1, y + 0.07, -1.0]);
  const gP = glowSprite('#ff4a3a', 0.45), gS = glowSprite('#4d86ff', 0.55);
  gP.position.set(0.9, y + 0.13, -1.0); gS.position.set(1.1, y + 0.13, -1.0); c.g.add(gP); c.g.add(gS);
  Object.assign(c.parts, {
    chipM, ledP, ledS, gP, gS, usbPort: new T.Vector3(-1.35, y + 0.12, 0.35), usbScale: 0.4,
    mcu: new T.Vector3(0.1, y + 0.13, -0.2), btnPos: new T.Vector3(-0.7, y + 0.16, 0.95), osd: new T.Vector3(0.1, y + 0.13, -0.2)
  });
}

function buildRXWhoop() {
  const cid = 'rx', c = comps[cid], W = LAY(), y = W.boardY;
  add(cid, box(0.38, 0.06, 0.38), mk(cid, { c: '#26292d', r: 0.5 }), [0.85, y + 0.08, 0.6]);
  add(cid, box(0.28, 0.07, 0.12), mk(cid, { c: '#e9e3d1', r: 0.4 }), [1.12, y + 0.085, 1.05]);
  const ledM = mk(cid, { c: '#0f3d1d', e: '#3dff7a', ei: 2, keep: true });
  add(cid, box(0.1, 0.05, 0.1), ledM, [0.55, y + 0.075, 1.0]);
  const glow = glowSprite('#45ff86', 0.55); glow.position.set(0.55, y + 0.14, 1.0); c.g.add(glow);
  Object.assign(c.parts, { ledM, glow, antPts: [new T.Vector3(1.12, y + 0.15, 1.05)], board: new T.Vector3(0.85, y, 0.6), uart: new T.Vector3(0.4, y + 0.08, 0.2) });
}

function buildVTXWhoop() {
  const cid = 'vtx', c = comps[cid], W = LAY(), y = W.boardY;
  add(cid, box(0.95, 0.16, 0.75), mk(cid, { c: '#cfd5da', m: 0.95, r: 0.28 }), [-0.35, y + 0.13, 0.85]);
  add(cid, cyl(0.07, 0.07, 0.08, 10), mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 }), [0.02, y + 0.1, 1.2]);
  Object.assign(c.parts, {
    conns: [new T.Vector3(0.02, y + 0.14, 1.22)], center: new T.Vector3(-0.35, y + 0.2, 0.85),
    input: new T.Vector3(-0.3, y + 0.1, -0.9), uart: new T.Vector3(-0.1, y + 0.1, 0.2)
  });
}

function buildVTXAntWhoop() {
  const cid = 'vtxant', c = comps[cid], W = LAY();
  const from = comps.vtx.parts.conns[0];
  const M = new T.Vector3(0, W.plateY + 1.2, 1.55), d = new T.Vector3(0, 0.75, 0.66).normalize();
  tube(cid, [from, [0.05, W.boardY + 0.5, 1.45], M], 0.03, mk(cid, { c: '#1e2124', r: 0.55 }), true, 20);
  const sl = add(cid, cyl(0.055, 0.055, 0.5, 10), mk(cid, { c: '#1e2124', r: 0.55 })); alignTo(sl, M, d, 0.5);
  const rod = add(cid, cyl(0.022, 0.022, 1.2, 8), mk(cid, { c: '#d5ab4f', m: 1, r: 0.3 })); alignTo(rod, M.clone().addScaledVector(d, 0.5), d, 1.2);
  c.parts.tips = [M.clone().addScaledVector(d, 1.7)]; c.parts.mounts = [M];
}

function buildCamWhoop() {
  const cid = 'cam', c = comps[cid], o = camOpt(), W = LAY(), s = o.size;
  const g = new T.Group(); g.position.set(0, 1.9, W.camZ); g.rotation.x = cfg.tilt * Math.PI / 180; c.g.add(g); c.parts.pivot = g;
  const body = mk(cid, { c: '#1f2225', r: 0.55, m: 0.15 });
  add(cid, box(s, s, s * 0.85), body, [0, 0, 0], null, g);
  add(cid, cyl(o.lens, o.lens * 1.08, 0.35, 24), body, [0, 0, -s * 0.42 - 0.17], [Math.PI / 2, 0, 0], g);
  add(cid, new T.TorusGeometry(o.lens, 0.03, 6, 24), mk(cid, { c: o.ring, m: 0.8, r: 0.3 }), [0, 0, -s * 0.42 - 0.35], null, g);
  const gl = add(cid, new T.SphereGeometry(o.lens * 0.85, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mk(cid, { c: '#0b1522', r: 0.05, m: 0.3 }), [0, 0, -s * 0.42 - 0.36], [-Math.PI / 2, 0, 0], g);
  gl.scale.set(1, 0.38, 1);
  const vin = comps.vtx.parts.input;
  tube(cid, [[0, 1.85, W.camZ + 0.45], [-0.2, W.boardY + 0.3, -1.0], vin], 0.03, mk(cid, { c: '#2b2f33', r: 0.6 }), true, 20);
  c.parts.lens = new T.Vector3(0, 1.9, W.camZ - s * 0.42 - 0.36);
  c.parts.out = new T.Vector3(0, 1.85, W.camZ + 0.45);
}

function buildBatteryWhoop() {
  const cid = 'battery', c = comps[cid], o = opt('battery'), bp = battPos(), { W, H, Lz, zc } = bp;
  const mah = Math.round(o.ah * 1000);
  const t = textTex([{ t: `1S ${mah}`, s: 54 }, { t: 'LiHV 4,35 В', s: 30, w: 500 }], { w: 512, h: 256, bg: o.col, fg: '#ffffff', lh: 58 });
  c.tex.push(t);
  const sideM = mk(cid, { c: '#ffffff', map: t, r: 0.45 }), endM = mk(cid, { c: o.col, r: 0.5 });
  add(cid, box(W, H, Lz), [sideM, sideM, endM, endM, endM, endM], [0, H / 2, zc]);
  const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
  [[-0.1, blk], [0.1, red]].forEach(([off, m]) => tube(cid, [[off, H * 0.7, bp.rear - 0.05], [off, H * 0.7, bp.rear + 0.15], [off, 0.4, bp.rear + 0.12]], 0.035, m, true, 16));
  add(cid, box(0.44, 0.3, 0.42), mk(cid, { c: '#e9e4d6', r: 0.6 }), [0, 0.4, bp.rear + 0.25]);
  c.parts.rear = new T.Vector3(0, H / 2, bp.rear); c.parts.center = new T.Vector3(0, H / 2, zc);
}

function buildPowerWhoop() {
  const cid = 'power', c = comps[cid], W = LAY(), bp = battPos();
  add(cid, box(0.44, 0.3, 0.42), mk(cid, { c: '#F2C230', r: 0.5 }), [0, 0.4, bp.rear + 0.67]);
  const red = mk(cid, { c: '#C9362B', r: 0.55 }), blk = mk(cid, { c: '#1b1d20', r: 0.6 });
  [[-0.1, blk], [0.1, red]].forEach(([off, m]) => tube(cid, [[off, 0.4, bp.rear + 0.88], [off, 0.9, bp.rear + 0.9], [off * 2, W.plateY + 0.2, 1.75], [off * 2, W.boardY, 1.25]], 0.035, m, true, 24));
  c.parts.xt = new T.Vector3(0, 0.4, bp.rear + 0.67);
}
