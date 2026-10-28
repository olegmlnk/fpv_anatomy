/* Курс по БПЛА · анімації моторів, польотника й приймача, режими, головний цикл, вказівник.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= DEMOS, MODES, REBUILD, LOOP, POINTER ================= */
const statusEl = document.getElementById('status');
function setStatus(t) { if (!t) { statusEl.hidden = true; return; } statusEl.hidden = false; if (statusEl.textContent !== t) statusEl.textContent = t; }
function stopDemos() {
  if (!S.demo) return;
  S.demo = null; setStatus(null); applyLook();
}
function enterDemo(kind) {
  if (S.mode !== 'build') setMode('build');
  stopTour();
  S.demo = kind; ctl.auto = false; updateSpinBtn();
  if (S.explodeOn) toggleExplode(false);
  const k = kScale();
  if (kind === 'mot') { S.sel = 'motors'; S.ghost = false; const c = droneCenter(); setView(new T.Vector3(0, c.y, c.z * 0.3), 0, 1.02, fitDist(plat().fit * 0.95)); }
  else if (kind === 'fc') { S.sel = 'fc'; S.ghost = true; focusComp('fc', -1.78, 0.5); }
  else if (kind === 'rx') {
    S.sel = 'rx'; S.ghost = true;
    const b = comps.rx.parts.board.clone();
    setView(b.clone().add(new T.Vector3(-3.2 * k, 2.6 * k, 3.4 * k)), 0.78, 0.36, fitDist(9.5 * k));
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
    if (ok3d) {
      usbG.updateMatrixWorld(true);
      const pts = usbG.userData.pts.slice().reverse().map(p => usbG.localToWorld(p.clone()));
      pts.push(usbG.localToWorld(new T.Vector3(0, 0, 0)));
      pts.push(comps.fc.parts.mcu.clone().add(comps.fc.g.position));
      flashCurve = new T.CatmullRomCurve3(pts);
    }
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
  const dirs = motorDirs(), pp = comps.props.parts, mp = comps.motors.parts, N = L.mp.length, names = motorNames(), k = kScale();
  if (MOT.mode === 'test') { MOT.tt += dt; if (MOT.tt > 1.7) { MOT.tt = 0; MOT.ti = (MOT.ti + 1) % N; updateDemoUI(); } }
  const testing = MOT.mode === 'test', show = MOT.mode !== 'idle' && S.mode === 'build';
  for (let i = 0; i < 6; i++) {
    const e = label('m' + i, null, null);
    if (i >= N) { e.on = false; if (arrows[i]) arrows[i].visible = false; continue; }
    let target = 0;
    if (MOT.mode === 'spin') target = MOT.thr;
    else if (testing && i === MOT.ti && MOT.tt > 0.15 && MOT.tt < 1.4) target = Math.max(0.3, MOT.thr);
    MOT.vis[i] += (target - MOT.vis[i]) * (1 - Math.exp(-dt * (target > MOT.vis[i] ? 3.5 : 2.4)));
    MOT.ang[i] += dirs[i] * MOT.vis[i] * 32 * dt;
    if (mp.rot && mp.rot[i]) mp.rot[i].rotation.y = MOT.ang[i];
    if (pp.spin && pp.spin[i]) {
      pp.spin[i].rotation.y = MOT.ang[i];
      const blur = testing ? 0 : smooth(0.1, 0.48, MOT.vis[i]);
      const gf = (comps.props.ghost ? 0.08 : 1) * (S.mode === 'signals' ? 0.17 : 1), tf = testing ? 0.14 : 1;
      pp.blur[i].material.opacity = blur * 0.8 * gf;
      pp.bm[i].opacity = (0.9 - 0.72 * blur) * gf * tf;
    }
    const g = arrows[i];
    if (g && g.userData.base) {
      g.visible = show;
      g.position.copy(g.userData.base); g.position.y += comps.props.ex.y * S.ex;
      g.rotation.y += dirs[i] * dt * (0.6 + MOT.vis[i] * 2.2);
      g.userData.mat.opacity = testing ? (i === MOT.ti ? 0.95 : 0.22) : 0.92;
    }
    const cw = dirs[i] < 0, p = L.mp[i];
    label('m' + i, `<b>M${i + 1}</b> <i>${cw ? 'CW' : 'CCW'}</i>`, `mot ${cw ? 'cw' : 'ccw'}${testing && i !== MOT.ti ? ' dim' : ''}`);
    e.pos = new T.Vector3(p.x, L.seatY + 2.6 * k + comps.props.ex.y * S.ex, p.z);
    e.on = show;
  }
  if (S.demo === 'mot' && testing) {
    const i = MOT.ti, cw = dirs[i] < 0;
    setStatus(`M${i + 1} — ${names[i]} — ${cw ? 'за годинниковою (CW)' : 'проти годинникової (CCW)'}`);
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
  const k = kScale();
  p.btn.position.y = p.btnY - 0.055 * FC.btn * (p.usbScale || 1);
  const gf = comps.fc.ghost ? 0.25 : 1;
  p.ledS.emissiveIntensity = st ? 1.9 : 0.02;
  p.gS.material.opacity = st * gf; p.gP.material.opacity = 0.8 * gf;
  p.chipM.emissive.copy(C(TC['--accent'])); p.chipM.emissiveIntensity = pulse * 0.7;
  if (usbG) {
    const us = p.usbScale || 1;
    usbG.visible = FC.usb > 0.01 && S.mode === 'build';
    usbG.scale.setScalar(us);
    usbG.position.copy(p.usbPort).add(comps.fc.g.position);
    usbG.position.x += (0.65 - 3.4 * (1 - FC.usb)) * us;
  }
  const flashing = FC.mode === 'flash' && flashCurve && S.demo === 'fc';
  flashDots.forEach((s, i) => {
    s.visible = !!flashing;
    if (flashing) { const t = ((now * 0.55) + i / flashDots.length) % 1; flashCurve.getPointAt(t, s.position); s.scale.setScalar(0.6 * k); s.material.color.copy(C(TC['--accent'])); s.material.opacity = Math.sin(t * Math.PI); }
  });
  document.getElementById('fcLedS').classList.toggle('on', !!st);
  const bl = label('fcBtn', 'BOOT ↓', 'hot');
  bl.pos = p.btnPos.clone().add(comps.fc.g.position).add(new T.Vector3(0, 0.55 * k, 0));
  bl.on = S.demo === 'fc' && FC.mode === 'dfu' && FC.t < 1.7;
  const ml = label('fcMcu', FC.mode === 'flash' ? `запис ${Math.round(FC.prog * 100)} %` : 'DFU · STM32 BOOTLOADER', 'hot');
  ml.pos = p.mcu.clone().add(comps.fc.g.position).add(new T.Vector3(0, 0.75 * k, 0));
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
  const gf = comps.rx.ghost ? 0.3 : 1, k = kScale();
  p.ledM.emissiveIntensity = on ? 2.4 : 0.03;
  p.glow.material.opacity = on * gf;
  document.getElementById('rxLed').classList.toggle('on', !!on);
  const active = S.demo === 'rx' && ok3d && S.mode === 'build';
  const board = p.board.clone().add(comps.rx.g.position);
  const antW = (p.antPts || [board]).map(a => a.clone().add(comps.rx.g.position));
  const showRadio = active && (RX.mode === 'bind' || RX.mode === 'linked');
  radio.visible = showRadio;
  let tip = null;
  if (showRadio) {
    radio.scale.setScalar(0.8 * k);
    radio.position.copy(board).add(new T.Vector3(-8 * k, 5.4 * k, 7.6 * k));
    radio.lookAt(board);
    radio.updateMatrixWorld(true);
    tip = radio.localToWorld(radio.userData.tip.clone());
    RX.spawn -= dt; RX.tele -= dt;
    const spawn = (dir, colorKey) => {
      const pk = packets.find(q => !q.on); if (!pk) return;
      pk.on = true; pk.t = 0; pk.dir = dir; pk.target = antW[Math.floor(Math.random() * antW.length)];
      pk.s.material.color.copy(C(TC[colorKey])); pk.s.visible = true; pk.s.scale.setScalar(0.7 * k);
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
    const m = a.clone().lerp(b, 0.5); m.y += 2.4 * k;
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
    const sc = (0.4 + ph * 5) * k; r.scale.set(sc, sc, sc);
    r.material.opacity = (1 - ph) * 0.75; r.material.color.copy(C(TC['--led']));
  });
  const rl = label('rxLbl', RX.mode === 'bind' ? 'BIND · подвійне блимання' : RX.mode === 'linked' ? 'зв’язок · 250 Гц · LQ 100' : RX.mode === 'wifi' ? 'Wi-Fi «ExpressLRS RX» · 10.0.0.1' : 'немає зв’язку · шукає пульт', RX.mode === 'linked' || RX.mode === 'wifi' ? 'hot' : '');
  rl.pos = board.clone().add(new T.Vector3(0, 1.5 * k, 0)); rl.on = active;
  const tl = label('radioLbl', 'пульт ELRS', '');
  tl.pos = radio.position.clone().add(new T.Vector3(0, 3.6 * k, 0)); tl.on = showRadio;
  if (S.demo === 'rx') {
    setStatus(RX.mode === 'nolink' ? 'LED повільно блимає: приймач не бачить пульта'
      : RX.mode === 'bind' ? 'Біндинг: обмін ключами з пультом…'
        : RX.mode === 'linked' ? 'Зв’язок: пакети керування → приймач, телеметрія → пульт'
          : 'Wi-Fi: точка доступу для оновлення прошивки');
  }
}

/* ---------- explode & modes ---------- */
function toggleExplode(on) {
  S.explodeOn = on == null ? !S.explodeOn : on;
  document.getElementById('tExplode').setAttribute('aria-pressed', String(S.explodeOn));
  S.ghost = false; applyLook();
  const c = droneCenter();
  if (S.explodeOn) {
    if (S.demo) stopDemos();
    setView(new T.Vector3(0, c.y + 4.0 * plat().exS, c.z * 0.3), null, 0.3, fitDist(plat().fit * 1.28));
  } else setView(new T.Vector3(0, c.y * 0.9, c.z * 0.3), null, 0.44, fitDist(plat().fit));
}
function setMode(m) {
  if (S.mode === m) return;
  S.mode = m;
  stopTour(); stopDemos();
  if (S.explodeOn) { S.explodeOn = false; document.getElementById('tExplode').setAttribute('aria-pressed', 'false'); }
  S.sel = null; S.ghost = false; S.hover = null;
  if (ok3d) {
    const lab = m === 'antennas';
    root.visible = !lab; matMesh.visible = !lab; shadowMesh.visible = !lab; wbLine.visible = !lab;
    if (m === 'signals') sigEnter(); else sigExit();
    if (lab) labEnter(); else labExit();
    if (m === 'build') { homeView(); ctl.auto = !reduceMotion; updateSpinBtn(); }
    applyLook();
  }
  showPeek(null); onSelectUI(null); onModeUI(m);
}
function applyPlatform(id) {
  setPlatform(id);
  MOT.mode = 'idle'; MOT.ti = 0; FC.mode = 'run'; FC.usbT = 0; FC.usb = 0; FC.flashed = false; RX.mode = 'nolink';
  stopTour(); stopDemos();
  if (S.explodeOn) { S.explodeOn = false; S.ex = 0; document.getElementById('tExplode').setAttribute('aria-pressed', 'false'); }
  S.sel = null; S.ghost = false;
  if (!ok3d) return;
  for (const k of ORDER) comps[k].ex.set(EXPLODE[k][0], EXPLODE[k][1], EXPLODE[k][2]).multiplyScalar(plat().exS);
  rebuild(ORDER.slice(), true);
  scaleMat();
  if (S.mode === 'signals') sigEnter(); else if (S.mode === 'build') homeView();
}

/* ---------- rebuild ---------- */
function applyWireVis(id) { comps[id].meshes.forEach(m => { if (m.userData.wire) m.visible = S.wiresVis; }); }
function refreshPickables() { pickables = []; for (const id of ORDER) comps[id].meshes.forEach(m => pickables.push(m)); }
function rebuild(list, quiet) {
  S.ver = (S.ver || 0) + 1;
  if (!ok3d) return;
  if (list.includes('frame')) computeLayout();
  const seq = ORDER.filter(id => list.includes(id));
  for (const id of seq) { clearComp(id); BUILD[id](); }
  for (const id of seq) { applyWireVis(id); comps[id].flash = quiet ? 0 : 1; }
  refreshPickables(); positionArrows(); updatePropHands(); updateWheelbase();
  if (S.mode === 'signals') sigRebuild();
  applyLook();
  if (S.peekId) showPeek(S.peekId);
}
function tickFlash(dt) {
  const acc = C(TC['--accent']);
  for (const id of ORDER) {
    const c = comps[id]; if (!c.flash) continue;
    c.flash = Math.max(0, c.flash - dt * 1.3);
    for (const m of c.mats) { const u = m.userData; if (!u || u.blur || u.keep) continue; m.emissive.copy(acc); m.emissiveIntensity = Math.max(0, c.flash) * 0.55; }
    if (c.flash === 0) applyLook();
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
  camera = new T.PerspectiveCamera(34, 1, 0.1, 900);
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
  for (let i = 0; i < 6; i++) arrows.push(makeArrow());
  brkHover = makeBrackets(0.55); brkSel = makeBrackets(1);
  makeUSB(); makeRadio();
  sigInit(); labInit();
  ctl = { target: new T.Vector3(0, 2.4, 0.3), tTarget: new T.Vector3(0, 2.4, 0.3), yaw: 2.45, tYaw: 2.45, pitch: 0.44, tPitch: 0.44, dist: 46, tDist: 46, auto: !reduceMotion, drag: false };
  raycaster = new T.Raycaster(); ndc = new T.Vector2();
  rebuild(ORDER.slice(), true);
  scaleMat();
  resize();
  homeView(); ctl.target.copy(ctl.tTarget); ctl.dist = ctl.tDist;
  new ResizeObserver(resize).observe(stageEl);
  bindPointer();
  const onTheme = () => {
    readTheme(); drawMat(); updatePropHands();
    wbLine.material.color.copy(C(TC['--ink']));
    [brkHover, brkSel].forEach(b => b.material.color.copy(C(TC['--accent'])));
    sigTheme(); labTheme();
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
  if (ctl.auto && !ctl.drag && !S.demo && !S.tour) ctl.tYaw += dt * (S.mode === 'antennas' ? 0.06 : 0.14);
  const k = 1 - Math.exp(-dt * 5.5);
  ctl.target.lerp(ctl.tTarget, k);
  ctl.yaw += (ctl.tYaw - ctl.yaw) * k; ctl.pitch += (ctl.tPitch - ctl.pitch) * k; ctl.dist += (ctl.tDist - ctl.dist) * k;
  const cp = Math.cos(ctl.pitch);
  camera.position.set(ctl.target.x + ctl.dist * cp * Math.sin(ctl.yaw), ctl.target.y + ctl.dist * Math.sin(ctl.pitch), ctl.target.z + ctl.dist * cp * Math.cos(ctl.yaw));
  camera.lookAt(ctl.target);

  S.ex += ((S.explodeOn ? 1 : 0) - S.ex) * (1 - Math.exp(-dt * 4));
  if (Math.abs(S.ex - (S.explodeOn ? 1 : 0)) < 0.001) S.ex = S.explodeOn ? 1 : 0;
  for (const id of ORDER) comps[id].g.position.copy(comps[id].ex).multiplyScalar(S.ex);
  if (comps.frame.parts.top) comps.frame.parts.top.position.y = 5.0 * plat().exS * S.ex;
  const wv = S.ex < 0.02;
  if (wv !== S.wiresVis) { S.wiresVis = wv; ORDER.forEach(applyWireVis); }

  tickMotors(dt); tickFC(dt, now); tickRX(dt, now); tickTour(dt); tickFlash(dt);
  if (S.mode === 'signals') tickSig(dt, now);
  if (S.mode === 'antennas') tickLab(dt, now);

  const showNums = S.ex > 0.5 && S.mode === 'build';
  for (const id of ORDER) {
    const e = label('n_' + id, String(numN(id)), 'num' + (S.sel === id ? ' sel' : ''));
    e.on = showNums && !(id === 'gps' && cfg.gps === 'none');
    if (e.on) e.pos = calloutPos(id);
  }
  const wbl = LB.get('wb'); if (wbl) wbl.on = !S.demo && S.ex < 0.5 && S.mode === 'build' && !narrowMQ.matches;

  if (S.hover && S.hover !== S.sel && S.mode === 'build') { brkHover.visible = true; setBrackets(brkHover, compBox(S.hover).expandByScalar(0.15 * kScale())); } else brkHover.visible = false;
  if (S.sel && !S.demo && S.mode === 'build') { brkSel.visible = true; setBrackets(brkSel, compBox(S.sel).expandByScalar(0.18 * kScale())); brkSel.material.opacity = 0.7 + 0.3 * Math.sin(now * 3); } else brkSel.visible = false;

  renderer.render(scene, camera);
  updateLabels(); updateLeader();
}

/* ---------- pointer ---------- */
function bindPointer() {
  const ptrs = new Map(); let down = null, pinch = 0, lastTap = { id: null, t: 0 };
  const hoverAt = (x, y) => setHover(S.mode === 'build' ? pick(x, y) : null);
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
      if (pinch > 0) ctl.tDist = Math.min(400, Math.max(1.5, ctl.tDist * pinch / d));
      pinch = d; if (down) down.moved = true;
    }
  });
  const end = e => {
    const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = 0;
    if (!had) return;
    if (down && !down.moved && ptrs.size === 0 && e.type === 'pointerup' && S.mode === 'build') {
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
  canvas.addEventListener('dblclick', e => { if (S.mode !== 'build') return; const id = pick(e.clientX, e.clientY); if (id) openDrawer(id); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); ctl.tDist = Math.min(400, Math.max(1.5, ctl.tDist * Math.exp(e.deltaY * 0.0011))); }, { passive: false });
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
