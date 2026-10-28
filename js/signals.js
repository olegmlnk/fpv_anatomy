/* Курс по БПЛА · режим «Сигнали»: покрокові ланцюжки керування, живлення, відео, телеметрії.
 * Класичний скрипт: усі файли ділять глобальну область, порядок підключення важливий:
 * content.js → options.js → core.js → builders.js → whoop.js → anim.js → demos.js → signals.js → antlab.js → ui.js */
'use strict';
/* ================= SIGNALS: step-by-step chains ================= */
const SIG = { chain: 'ctrl', step: 0, t: 0, playing: !reduceMotion, hops: [], dur: 3.4, hold: 2.2 };
const CHAINS = [
  { id: 'ctrl', name: 'Керування', color: '--sig-ctrl', ink: 'var(--on-sig)', intro: 'Від стіка пульта до тяги пропелерів: як команда проходить через приймач, польотник і ESC.' },
  { id: 'power', name: 'Живлення', color: '--sig-power', ink: 'var(--on-sig)', intro: 'Як енергія батареї розходиться дроном: силова частина й стабілізатори напруги для електроніки.' },
  { id: 'video', name: 'Відео', color: '--sig-video', ink: 'var(--on-sig)', intro: 'Шлях картинки від сенсора камери до екрана окулярів. Аналоговий і цифровий тракти влаштовані по-різному.' },
  { id: 'tele', name: 'Телеметрія', color: '--led', ink: '#06210f', intro: 'Зворотний потік: оберти моторів, GPS і стан батареї повертаються до польотника й пілота.' }
];
const chainMeta = id => CHAINS.find(c => c.id === id);
let sigGroup = null, sigLines, sigRadio, sigGog, sigPk = [];

function sigInit() {
  sigGroup = new T.Group(); sigGroup.visible = false; scene.add(sigGroup);
  sigLines = new T.Group(); sigGroup.add(sigLines);
  sigRadio = makeRadioModel(sigGroup); sigGog = makeGogglesModel(sigGroup);
  for (let i = 0; i < 27; i++) { const s = glowSprite('#ffffff', 0.7); s.material.depthTest = false; s.renderOrder = 997; s.visible = false; sigGroup.add(s); sigPk.push(s); }
}
function sigEnter() { if (!sigGroup) return; sigGroup.visible = true; ctl.auto = false; updateSpinBtn(); SIG.t = 0; sigRebuild(true); }
function sigExit() {
  if (sigGroup) sigGroup.visible = false;
  setStatus(null);
  for (const [k, e] of LB) if (k.startsWith('sig')) e.on = false;
}
function sigTheme() { if (S.mode === 'signals') sigRebuild(false); }

/* ---------- geometry (лише коли є 3D) ---------- */
function arc(a, b, lift) {
  const k = kScale(), d = a.distanceTo(b), m = a.clone().lerp(b, 0.5);
  m.y += lift != null ? lift : Math.min(3 * k, Math.max(0.35 * k, d * 0.22));
  return [a, m, b];
}
function sigGeo() {
  const k = kScale(), P = plat(), D = P.fit * 0.95, c = droneCenter();
  sigRadio.scale.setScalar(0.8 * k); sigGog.scale.setScalar(0.8 * k);
  sigRadio.position.set(-D, c.y + D * 0.28, D * 0.35);
  sigGog.position.set(D, c.y + D * 0.28, D * 0.35);
  sigRadio.lookAt(c); sigGog.lookAt(c);
  sigRadio.updateMatrixWorld(true); sigGog.updateMatrixWorld(true);
  const fcP = comps.fc.parts, rxP = comps.rx.parts, vtP = comps.vtx.parts, W = (v, id) => v.clone().add(comps[id].g.position);
  const mcu = W(fcP.mcu, 'fc');
  return {
    k, lift: P.fit * 0.18,
    radio: sigRadio.localToWorld(sigRadio.userData.tip.clone()),
    gog: sigGog.localToWorld(sigGog.userData.ants[2].clone()),
    mcu, osd: W(fcP.osd || fcP.mcu, 'fc'),
    rxb: W(rxP.board, 'rx'), rxa: W((rxP.antPts || [rxP.board])[0], 'rx'), rxu: W(rxP.uart || rxP.board, 'rx'),
    vtxC: W(vtP.center || vtP.input, 'vtx'), vtxIn: W(vtP.input, 'vtx'), vtxU: W(vtP.uart || vtP.center, 'vtx'),
    conns: (vtP.conns || [vtP.center]).map(v => W(v, 'vtx')),
    tips: (comps.vtxant.parts.tips || []).map(v => W(v, 'vtxant')),
    camOut: W(comps.cam.parts.out || comps.cam.parts.lens, 'cam'), lens: W(comps.cam.parts.lens, 'cam'),
    hub: comps.esc.parts.kind === 'aio' ? mcu.clone().add(new T.Vector3(0, -0.05, 0.4 * k)) : W(new T.Vector3(0, 0.88, 0.3), 'esc'),
    pads: P.micro ? mcu.clone() : W(new T.Vector3(0, 0.88, 1.92), 'esc'),
    escs: (comps.esc.parts.escPos || []).map(v => W(v, 'esc')),
    mot: L.mp.map(p => W(new T.Vector3(p.x, L.seatY, p.z), 'motors')),
    prop: L.mp.map(p => W(new T.Vector3(p.x, L.seatY + 0.3 * k, p.z), 'props')),
    bat: W(comps.battery.parts.rear || comps.battery.parts.center, 'battery'),
    xt: W(comps.power.parts.xt, 'power'),
    cap: comps.power.parts.cap ? W(comps.power.parts.cap, 'power') : null,
    gps: cfg.gps !== 'none' && comps.gps.parts.anchor ? W(comps.gps.parts.anchor, 'gps') : null
  };
}

/* ---------- ланцюжки: текст завжди, геометрія — функціями p(g) / n(g) ---------- */
function chainHops(id) {
  const P = plat(), micro = !!P.micro, r = calc(), N = P.motors;
  const rx = opt('rx'), vt = opt('vtx'), es = opt('esc'), ba = opt('battery'), cm = camOpt(), va = opt('vtxant'), pw = opt('power');
  const band = rx.ant === 'imt' ? '868/915 МГц' : '2,4 ГГц', crsf = rx.id === 'tbs';
  const sep = es.type === 'sep', hasGps = cfg.gps !== 'none';
  const hops = [], H = o => hops.push(o);
  if (id === 'ctrl') {
    H({
      from: 'Пульт', to: 'Приймач', proto: `радіо ${band} · ${crsf ? 'Crossfire' : 'ELRS'}`,
      text: `Пульт шле положення стіків і перемикачів пакетами: ${crsf ? 'Crossfire — 50 або 150 разів на секунду' : 'ELRS — від 25 до 1000 разів на секунду'}. Антена приймача ловить пакет, а чип перевіряє, що він саме від «свого» пульта.`,
      p: g => [[g.radio, g.radio.clone().lerp(g.rxa, 0.5).add(new T.Vector3(0, g.lift, 0)), g.rxa, g.rxb]]
    });
    H({
      from: 'Приймач', to: 'Польотник', proto: micro ? 'UART на платі · CRSF' : 'UART · CRSF, 420 000 бод',
      text: 'Приймач передає польотнику значення каналів: газ, крен, тангаж, рискання й перемикачі (AUX). Якщо пакети перестали надходити, польотник вмикає failsafe.',
      p: g => [[g.rxb, g.rxu, g.mcu]]
    });
    H({
      from: 'Польотник', to: 'PID-регулятор', proto: 'гіроскоп → PID, 2–8 кГц',
      text: 'У режимі Acro стік задає не кут, а швидкість обертання. Польотник порівнює її з даними гіроскопа й тисячі разів на секунду рахує поправку для кожного мотора.',
      n: g => g.mcu
    });
    H({
      from: 'Польотник', to: sep ? `${N} ESC` : micro ? 'ESC на платі' : '4-in-1 ESC', proto: `DShot600 · ${N} ${N > 4 ? 'каналів' : 'канали'}`, color: '--sig-motor',
      text: 'Цифрова команда газу окремо для кожного мотора, з контрольною сумою. З bidirectional DShot ESC ще й повертає оберти.',
      p: g => (sep ? g.escs.map(e => arc(g.mcu, e)) : [arc(g.mcu, g.hub, 0.6 * g.k)])
    });
    H({
      from: 'ESC', to: 'Мотори', proto: '3 фази на кожен мотор', color: '--sig-motor',
      text: 'Ключі (MOSFET) по черзі комутують три фази — мотор крутиться з потрібними обертами. Напрям обертання задає порядок комутації.',
      p: g => g.mot.map((m, i) => arc(sep ? g.escs[i] : g.hub, m))
    });
    H({
      from: 'Пропелери', to: 'Тяга', proto: 'тяга ↑, потік повітря ↓', color: '--sig-motor',
      text: 'Різниця обертів між моторами нахиляє й повертає дрон — так виконується команда стіка. Рискання дає реактивний момент: одні мотори крутяться за годинниковою, інші — проти.',
      p: g => g.prop.map(a => [a, a.clone().add(new T.Vector3(0, 1.5 * g.k, 0))])
    });
  } else if (id === 'power') {
    const conn = pw.conn === 'bt20' ? 'BT2.0' : pw.conn.toUpperCase();
    H({
      from: 'Акумулятор', to: `Роз’єм ${conn}`, proto: `${ba.s}S · ${fmt(r.vNom, 1)} В`,
      text: `${ba.s}S — це ${fmt(r.vNom, 1)} В номіналу й ${fmt(r.vFull, 1)} В повного заряду. На повному газі батарея віддає ≈${fmtA(r.iTotal)} А. Що вища напруга, то менший струм для тієї ж потужності — і тонші дроти.`,
      p: g => [arc(g.bat, g.xt)]
    });
    H({
      from: `Роз’єм ${conn}`, to: micro ? 'AIO-плата' : sep ? 'PDB' : '4-in-1 ESC',
      proto: micro ? '1S, напряму на плату' : pw.capV ? `пади + конденсатор ${pw.capV} В` : 'без конденсатора',
      text: micro ? 'На whoop батарея живить AIO-плату напряму: стабілізатори вже на платі.'
        : pw.capV ? 'Силові дроти припаяні до падів; конденсатор поруч гасить стрибки напруги, які створюють мотори при різкій зміні газу.'
          : 'Без конденсатора стрибки напруги від моторів ідуть прямо на ESC — ризик спалити його, плюс шум у відео.',
      p: g => [g.cap ? [g.xt, g.xt.clone().lerp(g.cap, 0.5).add(new T.Vector3(0, 0.6 * g.k, 0)), g.cap, g.pads] : arc(g.xt, g.pads)]
    });
    H({
      from: micro ? 'AIO-плата' : sep ? 'PDB → ESC' : 'ESC', to: 'Мотори', proto: 'основне споживання',
      text: 'Мотори забирають понад 95 % енергії — саме від них залежить час польоту.',
      p: g => g.mot.map((m, i) => (sep ? [g.hub, g.escs[i], m] : arc(g.hub, m)))
    });
    if (micro) {
      H({
        from: 'AIO-плата', to: 'Камера', proto: 'живлення по шлейфу',
        text: 'Польотник, ESC, приймач і VTX живляться від стабілізаторів на самій платі. Окремо живлення йде лише на камеру.',
        p: g => [arc(g.mcu, g.lens)]
      });
    } else {
      H({
        from: sep ? 'PDB' : 'ESC', to: 'Польотник', proto: 'VBAT по шлейфу',
        text: 'Польотник отримує напругу батареї: показує її в OSD і живить нею власні стабілізатори (BEC).',
        p: g => [arc(g.hub, g.mcu, 0.6 * g.k)]
      });
      H({
        from: 'Польотник (BEC 5 В)', to: hasGps ? 'Приймач і GPS' : 'Приймач', proto: '5 В',
        text: `Стабілізатор 5 В живить приймач${hasGps ? ', GPS' : ''} і світлодіоди.`,
        p: g => [arc(g.mcu, g.rxb)].concat(g.gps ? [arc(g.mcu, g.gps)] : [])
      });
      H({
        from: 'Польотник (BEC)', to: vt.kind === 'digital' ? 'Air unit → камера' : 'VTX і камера', proto: vt.kind === 'digital' ? '9–12 В або напряму VBAT' : '9 В на VTX, 5 В на камеру',
        text: vt.kind === 'digital' ? 'Air unit живиться від BEC 9–12 В або напряму від батареї — залежно від моделі. Камеру живить сам air unit.' : 'VTX живиться від BEC 9 В або напряму від батареї, камера — від 5 В. Окремий BEC зменшує шум у картинці.',
        p: g => (vt.kind === 'digital' ? [arc(g.mcu, g.vtxC), arc(g.vtxC, g.lens)] : [arc(g.mcu, g.vtxC), arc(g.mcu, g.lens)])
      });
    }
  } else if (id === 'video') {
    const circ = va.pol !== 'лінійна', two = vt.dual;
    if (vt.kind === 'analog') {
      H({
        from: cm.thermal ? 'Тепловізор' : 'Камера', to: micro ? 'AIO-плата (OSD)' : 'Польотник (OSD)', proto: 'CVBS · PAL/NTSC',
        text: cm.thermal ? 'Тепловізійний модуль видає звичайний аналоговий сигнал CVBS — далі його обробляють так само, як картинку денної камери.' : 'Сенсор → обробка (ISP) → композитний сигнал CVBS. Він іде на OSD-чип польотника.',
        p: g => [arc(g.camOut, g.osd)]
      });
      H({
        from: 'Польотник', to: 'VTX', proto: 'CVBS + символи OSD',
        text: 'OSD-чип (AT7456E) накладає на картинку символи: напругу, таймер, RSSI, режим польоту.',
        p: g => [arc(g.osd, g.vtxC)]
      });
      H({
        from: 'VTX', to: 'Антена', proto: 'FM · 5,8 ГГц',
        text: 'VTX модулює сигнал на обраний канал, наприклад R1 — 5658 МГц, без стиснення й буфера кадру.',
        p: g => g.tips.map((t, i) => arc(g.conns[i] || g.conns[0], t, 0.4 * g.k))
      });
      H({
        from: 'Антена', to: 'Окуляри', proto: `ефір · ${circ ? va.pol : 'лінійна поляризація'}`,
        text: circ ? 'Хвиля з круговою поляризацією. Антена на прийомі має бути тієї ж поляризації (RHCP ↔ RHCP) — у розділі «Антени» видно, що буде, якщо ні.' : 'Лінійна поляризація: на віражах з креном сигнал просідає, а відбиття додають провали. Кругова (RHCP/LHCP) стабільніша — див. розділ «Антени».',
        p: g => g.tips.map(t => [t, t.clone().lerp(g.gog, 0.5).add(new T.Vector3(0, g.lift, 0)), g.gog])
      });
      H({
        from: 'Окуляри', to: 'Екран', proto: 'демодуляція → екран',
        text: 'Приймач демодулює сигнал і одразу виводить на екран: затримка мінімальна. Слабкий сигнал дає шум і смуги, але картинку видно до останнього.',
        n: g => g.gog
      });
    } else {
      const hdz = vt.id === 'hdz';
      H({
        from: 'Камера', to: 'Air unit', proto: 'MIPI CSI · сирі дані',
        text: 'Сенсор передає сирі дані по шлейфу прямо в air unit. Аналогового сигналу в цьому тракті немає взагалі.',
        p: g => [arc(g.camOut, g.vtxIn)]
      });
      H({
        from: 'Air unit', to: 'Кодек', proto: hdz ? 'кодек HDZero, фікс. бітрейт' : 'H.264 / H.265 + запис',
        text: hdz ? 'HDZero кодує з фіксованим бітрейтом без буфера кадрів: затримка стабільна, а на межі картинка розсипається на пікселі.' : 'Air unit стискає відео кодеком і паралельно пише HD-запис на карту пам’яті.',
        n: g => g.vtxC
      });
      H({
        from: 'Польотник', to: 'Air unit', proto: 'UART · MSP DisplayPort', color: '--sig-ctrl',
        text: 'Польотник шле не картинку, а дані OSD: що й де намалювати. Символи малюють уже окуляри.',
        p: g => [arc(g.mcu, g.vtxU, 0.5 * g.k)]
      });
      H({
        from: 'Air unit', to: two ? 'Антени' : 'Антена', proto: 'цифровий канал 5,8 ГГц',
        text: `Пакети з корекцією помилок і адаптивним бітрейтом${two ? ', через дві антени' : ''}.`,
        p: g => g.tips.map((t, i) => arc(g.conns[i] || g.conns[0], t, 0.4 * g.k))
      });
      H({
        from: two ? 'Антени' : 'Антена', to: 'Окуляри', proto: 'ефір 5,8 ГГц',
        text: 'Окуляри приймають цифровий потік. На межі дальності — блоки й фризи, далі обрив.',
        p: g => g.tips.map(t => [t, t.clone().lerp(g.gog, 0.5).add(new T.Vector3(0, g.lift, 0)), g.gog])
      });
      H({
        from: 'Окуляри', to: 'Екран', proto: 'декодування + OSD',
        text: hdz ? 'Декодування з фіксованою затримкою в кілька мілісекунд.' : 'Окуляри декодують відео й малюють OSD поверх. Затримка ≈20–40 мс і змінюється разом з якістю сигналу.',
        n: g => g.gog
      });
    }
  } else {
    H({
      from: micro ? 'ESC на платі' : sep ? `${N} ESC` : 'ESC', to: 'Польотник', proto: 'bidirectional DShot · оберти',
      text: 'ESC повертає оберти кожного мотора. Польотник будує з них RPM-фільтр і прибирає вібрації з даних гіроскопа.',
      p: g => (sep ? g.escs.map(e => arc(e, g.mcu)) : [arc(g.hub, g.mcu, 0.5 * g.k)])
    });
    if (hasGps) H({
      from: 'GPS', to: 'Польотник', proto: 'UART · UBX, 10 Гц',
      text: 'Координати, висота, швидкість і кількість супутників. На них працюють GPS Rescue та Position Hold.',
      p: g => (g.gps ? [arc(g.gps, g.mcu)] : [])
    });
    H({
      from: 'Польотник', to: 'Приймач', proto: micro ? 'телеметрія на платі' : 'UART · CRSF-телеметрія',
      text: 'Напруга батареї, струм, режим польоту, координати — усе, що польотник віддає назад.',
      p: g => [[g.mcu, g.rxu, g.rxb]]
    });
    H({
      from: 'Приймач', to: 'Пульт', proto: `радіо ${band} · зворотний канал`,
      text: 'Пульт показує RSSI, LQ і напругу батареї та голосом попереджає, коли сигнал слабне.',
      p: g => [[g.rxb, g.rxa, g.rxa.clone().lerp(g.radio, 0.5).add(new T.Vector3(0, g.lift, 0)), g.radio]]
    });
  }
  return hops;
}

/* ---------- build, frame, tick ---------- */
function sigClear() {
  sigLines.children.slice().forEach(o => { sigLines.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  for (const [k, e] of LB) if (k.startsWith('sig')) e.on = false;
}
function sigRebuild(reframe) {
  SIG.hops = chainHops(SIG.chain);
  if (SIG.step >= SIG.hops.length) SIG.step = 0;
  SIG.t = 0;
  if (ok3d && sigGroup) {
    sigClear();
    const g = sigGeo(), k = g.k, box3 = new T.Box3().setFromObject(root);
    const useR = SIG.chain === 'ctrl' || SIG.chain === 'tele', useG = SIG.chain === 'video';
    sigRadio.visible = useR; sigGog.visible = useG;
    if (useR) box3.expandByObject(sigRadio);
    if (useG) box3.expandByObject(sigGog);
    SIG.hops.forEach(h => {
      const col = C(TC[h.color || chainMeta(SIG.chain).color] || '#888888');
      const mat = new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthTest: false, depthWrite: false, toneMapped: false });
      h.col = col; h.mat = mat; h.curves = []; h.sprite = null;
      (h.p ? h.p(g) : []).forEach(pts => {
        if (!pts || pts.length < 2) return;
        const curve = new T.CatmullRomCurve3(pts.map(p => p.clone()), false, 'centripetal');
        const m = new T.Mesh(new T.TubeGeometry(curve, Math.max(28, pts.length * 18), 0.11 * k, 8, false), mat);
        m.renderOrder = 990; sigLines.add(m);
        const end = curve.getPointAt(1), tan = curve.getTangentAt(1);
        const cone = new T.Mesh(new T.ConeGeometry(0.3 * k, 0.75 * k, 14), mat);
        cone.position.copy(end).addScaledVector(tan, -0.3 * k); cone.quaternion.setFromUnitVectors(UP, tan); cone.renderOrder = 991;
        sigLines.add(cone); h.curves.push(curve);
      });
      h.node = h.n ? h.n(g) : null;
      if (h.node) {
        const sp = glowSprite('#ffffff', 1.6 * k); sp.material.color.copy(col); sp.material.depthTest = false; sp.renderOrder = 992;
        sp.position.copy(h.node); sigLines.add(sp); h.sprite = sp;
      }
    });
    const lr = label('sigRadioL', 'Пульт', 'tag'); lr.pos = sigRadio.position.clone().add(new T.Vector3(0, 3.5 * k, 0)); lr.on = useR;
    const lg = label('sigGogL', 'Окуляри', 'tag'); lg.pos = sigGog.position.clone().add(new T.Vector3(0, 3.7 * k, 0)); lg.on = useG;
    if (reframe) {
      const sph = box3.getBoundingSphere(new T.Sphere());
      setView(sph.center, 0.3, 0.6, fitDist(sph.radius * 0.8));
    }
  }
  renderSigPanel();
}
function sigSetChain(id) { SIG.chain = id; SIG.step = 0; SIG.t = 0; SIG.playing = !reduceMotion && ok3d; sigRebuild(true); }
function sigGo(i) { SIG.step = Math.max(0, Math.min(SIG.hops.length - 1, i)); SIG.t = 0; markSigSteps(); }
function sigToggle() { SIG.playing = !SIG.playing; if (SIG.playing && SIG.step >= SIG.hops.length - 1) SIG.step = 0; SIG.t = 0; markSigSteps(); }
const midOf = h => (h.curves.length ? h.curves[0].getPointAt(0.5) : h.node);
function tickSig(dt, now) {
  const n = SIG.hops.length; if (!n || !SIG.hops[0].mat) return;
  if (SIG.playing) {
    SIG.t += dt;
    if (SIG.step < n - 1 && SIG.t > SIG.dur) { SIG.step++; SIG.t = 0; markSigSteps(); }
    else if (SIG.step === n - 1 && SIG.t > SIG.dur + SIG.hold) { SIG.step = 0; SIG.t = 0; markSigSteps(); }
  } else SIG.t += dt;
  const k = kScale(), cur = SIG.hops[SIG.step], prog = (SIG.t % SIG.dur) / (SIG.dur * 0.85);
  SIG.hops.forEach((h, i) => {
    h.mat.opacity = i < SIG.step ? 0.45 : i === SIG.step ? 0.8 + 0.2 * Math.sin(now * 6) : 0.09;
    if (h.sprite) { const s = (i === SIG.step ? 1.7 + 0.5 * Math.sin(now * 5) : 1.1) * k; h.sprite.scale.set(s, s, s); h.sprite.material.opacity = i <= SIG.step ? 1 : 0.25; }
    const e = label('sig' + i, i === SIG.step ? `<b>${i + 1}</b> ${h.proto}` : String(i + 1), i === SIG.step ? 'hot' : 'num');
    e.pos = midOf(h); e.on = !!e.pos && i <= SIG.step; e.ox = 0; e.oy = 0;
  });
  for (let i = n; i < 10; i++) { const e = LB.get('sig' + i); if (e) e.on = false; }
  let si = 0;
  cur.curves.forEach(c => {
    for (let j = 0; j < 3 && si < sigPk.length; j++) {
      const s = sigPk[si++], t = prog - j * 0.07;
      s.visible = t > 0 && t < 1;
      if (s.visible) { c.getPointAt(t, s.position); s.material.color.copy(cur.col); s.scale.setScalar((0.75 - j * 0.15) * k); s.material.opacity = 1 - j * 0.25; }
    }
  });
  for (; si < sigPk.length; si++) sigPk[si].visible = false;
  const hasPath = cur.curves.length > 0, lift = new T.Vector3(0, 0.75 * k, 0);
  const la = label('sigA', cur.from, 'tag'), lb = label('sigB', cur.to, 'tag'), hot = LB.get('sig' + SIG.step);
  la.pos = hasPath ? cur.curves[0].getPointAt(0).add(lift) : null; la.on = hasPath;
  lb.pos = hasPath ? cur.curves[0].getPointAt(1).add(lift) : null; lb.on = hasPath;
  la.ox = la.oy = lb.ox = lb.oy = 0;
  /* розводимо мітки «звідки / куди / протокол», якщо відрізок на екрані короткий */
  if (hasPath) {
    const sa = toScreen(la.pos), sb = toScreen(lb.pos);
    let dx = sa.x - sb.x, dy = sa.y - sb.y, len = Math.hypot(dx, dy);
    if (len < 1) { dx = -1; dy = 0; len = 1; }
    const ux = dx / len, uy = dy / len, push = Math.max(0, (230 - len) / 2);
    la.ox = ux * push; la.oy = uy * push; lb.ox = -ux * push; lb.oy = -uy * push;
    if (hot && len < 300) { let nx = -uy, ny = ux; if (ny > 0) { nx = -nx; ny = -ny; } hot.ox = nx * 34; hot.oy = ny * 34 - 10; }
  }
  const lr = LB.get('sigRadioL'), lg = LB.get('sigGogL');
  if (lr) lr.on = sigRadio.visible && cur.from !== 'Пульт' && cur.to !== 'Пульт';
  if (lg) lg.on = sigGog.visible && cur.from !== 'Окуляри' && cur.to !== 'Окуляри';
  setStatus(`${SIG.step + 1}/${n} · ${cur.from} → ${cur.to}`);
}

/* ---------- panel ---------- */
function renderSigPanel() {
  const panel = document.getElementById('sigPanel'); if (!panel) return;
  const meta = chainMeta(SIG.chain), vt = opt('vtx');
  panel.style.setProperty('--c', `var(${meta.color})`); panel.style.setProperty('--c-ink', meta.ink);
  panel.querySelectorAll('[data-chain]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.chain === SIG.chain)));
  let intro = meta.intro;
  if (SIG.chain === 'video') intro += vt.kind === 'digital' ? ' Зараз на дроні цифрова система.' : ' Зараз на дроні аналогова система.';
  document.getElementById('sigIntro').textContent = intro;
  document.getElementById('sigSteps').innerHTML = SIG.hops.map((h, i) =>
    `<li data-i="${i}"><button type="button" data-step="${i}"><span class="n">${i + 1}</span><span class="st-b"><b>${h.from} → ${h.to}</b><code>${h.proto}</code><span class="st-t">${h.text}</span></span></button></li>`).join('');
  const ex = document.getElementById('sigExtra');
  if (SIG.chain === 'video') {
    const micro = !!plat().micro;
    ex.innerHTML = `<div class="sig-sys"><span class="lab-k">Система на дроні</span><div class="seg sm" role="group" aria-label="Відеосистема">` +
      `<button type="button" data-vsys="analog" aria-pressed="${vt.kind === 'analog'}">Аналог</button>` +
      `<button type="button" data-vsys="digital" aria-pressed="${vt.kind === 'digital'}"${micro ? ' disabled' : ''}>Цифра</button></div></div>` +
      (micro ? '<p class="note">На цьому whoop VTX вбудований в AIO-плату — лише аналог.</p>' : '') +
      '<button type="button" class="lnk" data-open="cam">Порівняння аналогу й цифри →</button>';
  } else ex.innerHTML = '';
  document.getElementById('sigPlay').hidden = !ok3d;
  markSigSteps();
}
function markSigSteps() {
  document.querySelectorAll('#sigSteps li').forEach(li => {
    const i = +li.dataset.i;
    li.classList.toggle('cur', i === SIG.step); li.classList.toggle('done', i < SIG.step);
    li.firstChild.setAttribute('aria-current', i === SIG.step ? 'step' : 'false');
  });
  const pos = document.getElementById('sigPos'); if (pos) pos.textContent = `${SIG.step + 1} / ${SIG.hops.length}`;
  const pl = document.getElementById('sigPlay'); if (pl) { pl.textContent = SIG.playing ? 'Пауза' : 'Відтворити'; pl.setAttribute('aria-pressed', String(SIG.playing)); }
}
function sigUIInit() {
  const panel = document.getElementById('sigPanel');
  document.getElementById('sigTabs').innerHTML = CHAINS.map(c => `<button type="button" data-chain="${c.id}" style="--cc: var(${c.color}); --cci: ${c.ink}" aria-pressed="false"><i></i>${c.name}</button>`).join('');
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.dataset.chain) sigSetChain(b.dataset.chain);
    else if (b.dataset.step != null) { SIG.playing = false; sigGo(+b.dataset.step); }
    else if (b.id === 'sigPrev') { SIG.playing = false; sigGo(SIG.step - 1); }
    else if (b.id === 'sigNext') { SIG.playing = false; sigGo(SIG.step + 1); }
    else if (b.id === 'sigPlay') sigToggle();
    else if (b.dataset.vsys) {
      if (opt('vtx').kind !== b.dataset.vsys) { setOpt('vtx', b.dataset.vsys === 'digital' ? 'hd' : 'an1'); if (!ok3d) sigRebuild(false); }
    } else if (b.dataset.open) openDrawer(b.dataset.open);
  });
}
