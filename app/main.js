// Outpost: glue between the simulation, the 3D base and the panels.
import { T, col, clamp, smooth, damp } from './gfx.js';
import { createSim, CREW, byId, STATIONS, RISKY, SITE_KINDS, SITE_CREW, SITE_WORDS, makeAuthority, authorityId, trialAsync, verifyLedger,
  HANDOFF_KEY, readHandoff, parseHandoff, toSpec, storedWith, storedWithout, SAMPLE_AGENT, MAX_GUESTS, GUEST_PAD0, drillById, drillStoppable } from '../src/index.js';
import { buildWorld } from './world3d.js';
import { makeBot, makeParcel } from './bots.js';
import { makeFx } from './fx.js';
import { makeSound } from './sound.js';
import { ask } from './ask.js';
import * as hud from './hud.js';
import { P } from './palette.js';

// `root` is where the markup lives: the document for the full page, or a shadow root when the
// base is mounted inside another site. `opts.embed` trims the panels and stops the scene from
// hijacking the host page's scrolling.
export function boot(root = document, opts = {}) {
  const $ = s => root.querySelector(s);
  const app = $('#app'), canvas = $('#gl'), embed = !!opts.embed;
  if (embed) app.classList.add('embed');
  const fail = () => { $('#fail').hidden = false; if (opts.onFail) opts.onFail(); };
  if (!T) return fail();
  let renderer;
  try { renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return fail(); }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 700px)').matches;
  renderer.outputEncoding = T.sRGBEncoding; renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, phone ? 1.75 : 2));

  // deep space behind the scene, drawn once: cold stars, a few in the brand colour
  {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 700; const g = c.getContext('2d');
    for (let i = 0; i < 190; i++) { const y = Math.pow(Math.random(), 1.3) * 640, a = 0.18 + Math.random() * 0.6; g.fillStyle = `rgba(222,231,250,${a * 0.8})`; const r = Math.random() < 0.1 ? 1.5 : 0.8; g.beginPath(); g.arc(Math.random() * 1200, y, r, 0, 6.3); g.fill(); }
    app.style.backgroundImage = `url(${c.toDataURL()}), var(--sky)`;
    app.style.backgroundSize = 'cover, auto';
  }

  app.style.setProperty('--accent', P.accent); STATIONS.beacon.color = P.accent;
  const scene = new T.Scene();
  const cam = new T.OrthographicCamera(-1, 1, 1, -1, 1, 700);
  const HOME = new T.Vector3(6, 3, -3), POLAR = 0.96, DIST = 260, UP = new T.Vector3(0, 1, 0);
  const place = az => cam.position.set(HOME.x + Math.sin(POLAR) * Math.sin(az) * DIST, HOME.y + Math.cos(POLAR) * DIST, HOME.z + Math.sin(POLAR) * Math.cos(az) * DIST);
  place(Math.PI / 4); cam.lookAt(HOME);
  let controls = null;
  if (T.OrbitControls) {
    controls = new T.OrbitControls(cam, canvas);
    controls.target.copy(HOME); controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.minPolarAngle = controls.maxPolarAngle = POLAR; controls.minZoom = 0.55; controls.maxZoom = 5; controls.zoomSpeed = 1.1; controls.rotateSpeed = 0.6;
    controls.screenSpacePanning = false; controls.panSpeed = 1;
    controls.mouseButtons = { LEFT: T.MOUSE.PAN, MIDDLE: T.MOUSE.DOLLY, RIGHT: T.MOUSE.ROTATE };
    controls.touches = { ONE: T.TOUCH.PAN, TWO: T.TOUCH.DOLLY_ROTATE };
    if (embed) {                                    // the host page keeps its scroll: no wheel zoom, and touch is for tapping only
      controls.enableZoom = false;
      if (matchMedia('(pointer: coarse)').matches) controls.enabled = false;
      canvas.style.touchAction = 'pan-y';
      canvas.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
    }
    controls.update();
  }
  const zoomBy = k => { cam.zoom = clamp(cam.zoom * k, 0.55, 5); cam.updateProjectionMatrix(); };
  const target = () => controls ? controls.target : HOME;
  const shift = d => { target().add(d); cam.position.add(d); };

  let Wd = 1, Hd = 1, camYaw = Math.PI / 4, edgeTop = 74, edgeBot = 126;
  function resize() {
    Wd = app.clientWidth; Hd = app.clientHeight; renderer.setSize(Wd, Hd, false);
    if (!Wd || !Hd) return;
    const aspect = Wd / Hd, small = Wd <= 700;
    edgeTop = embed ? 8 : small ? 104 : 74; edgeBot = embed ? 62 : small ? 196 : 126;
    // In an embed the host page may keep words over the top of the scene; `inset` is that height,
    // and the base is fitted and centred in what is left below it.
    const inset = embed ? Math.min(Hd * 0.5, (opts.topInset && opts.topInset()) || (small ? 150 : 0)) : 0, free = Hd - inset;   // on a phone the alert card sits at the top
    app.style.setProperty('--inset', inset + 'px');
    const vh = (embed ? Math.max(86, (small ? 106 : 150) / (Wd / free)) : Math.max(100, (small ? 112 : 160) / aspect)) * Hd / free;
    cam.left = -vh * aspect / 2; cam.right = vh * aspect / 2; cam.top = vh / 2; cam.bottom = -vh / 2;
    if (inset) cam.setViewOffset(Wd, Hd, 0, -inset / 2 + (small ? 0 : 14), Wd, Hd);
    else if (small && !embed) cam.setViewOffset(Wd, Hd, 0, -Hd * 0.04, Wd, Hd);     // on a phone, sit clear of the bottom bar
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app); else addEventListener('resize', resize);
  if (embed) addEventListener('resize', resize);
  resize();

  const W = buildWorld(scene), fx = makeFx(scene, reduce), sound = makeSound();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => W.refresh.forEach(f => f()));
  // Bots are made on first sight and kept, so a bot that joins later (or one seen in a rewind) can be drawn.
  const bots = {}, proxies = [], tags = $('#tags'), btag = {}, bbub = {};
  function ensureBot(id) {
    if (bots[id]) return bots[id];
    const c = byId[id], b = makeBot(c, c.umbra ? GUEST_PAD0 + Object.keys(bots).length : CREW.indexOf(c), scene);
    bots[id] = b; proxies.push(b.proxy);
    const t = document.createElement('div'); t.className = 'tag'; t.style.setProperty('--c', c.color); t.dataset.bot = id; t.textContent = c.name; tags.appendChild(t); btag[id] = t;
    const u = document.createElement('div'); u.className = 'bub'; tags.appendChild(u); bbub[id] = u;
    return b;
  }
  const botOf = id => bots[id];
  W.dockRings.forEach((r, i) => r.material.color.copy(col(CREW[i].color)));
  for (const id of Object.keys(STATIONS)) {
    const p = new T.Mesh(new T.CylinderGeometry(6.6, 6.6, W.top[id], 8), new T.MeshBasicMaterial({ visible: false }));
    p.position.set(STATIONS[id].x, W.top[id] / 2, STATIONS[id].z); p.userData.station = id; scene.add(p); proxies.push(p);
  }

  // ---------- the simulation, warmed up so the first frame is already busy ----------
  // On the portfolio the same crew looks after the site itself, and the clock is the visitor's own.
  const site = opts.tenant === 'site';
  const sim = site ? createSim(334, { kinds: SITE_KINDS }) : createSim(162), snaps = [], MAXSNAP = 300;
  for (let i = 0; i < 500; i++) { sim.step(0.1); if (i % 5 === 4) snaps.push(sim.snapshot()); }
  sim.fx.length = 0;
  const wall = () => { const d = new Date(); return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds(); };
  if (site) { hud.setTheme(SITE_CREW, SITE_WORDS); hud.setClock(wall() - sim.state.t); }
  let mode = 'live', viewIdx = 0, snapAcc = 0, jump = 2, sel = null, follow = null, fly = null, turn = 0, panel = null, dirty = true, hudAcc = 0, answerT = 0, traceAll = false, drillWatch = null;
  // The Autonomy lab keeps a draft of the authority table. Nothing in the base changes until it is applied.
  const lab = { draft: makeAuthority(sim.state.authority), answer: 15, res: null, running: false, rev: 0 };
  let ledFilter = 'all', expText = null;
  const dropping = new Set(), inboxP = new Map();
  const view = () => mode === 'live' ? sim.state : snaps[viewIdx];
  const coachDone = { bot: false, send: false, gate: false, lab: false };
  function coach(k) { if (coachDone[k]) return; coachDone[k] = true; const el = $(`#coach [data-c="${k}"]`); if (el) el.classList.add('ok'); if (Object.values(coachDone).every(Boolean)) setTimeout(() => { $('#coach').hidden = true; }, 2500); }

  // ---------- labels in the scene ----------
  const slabs = {};
  for (const [id, s] of Object.entries(STATIONS)) { const d = document.createElement('div'); d.className = 'slab'; d.style.setProperty('--c', s.color); d.dataset.station = id; d.innerHTML = `${s.name}<b></b>`; tags.appendChild(d); slabs[id] = d; }
  CREW.forEach(c => ensureBot(c.id));
  const v3 = new T.Vector3();
  const put = (el, x, y, z, ox, oy, ax, ay = '-100%') => {
    v3.set(x, y, z).project(cam); const sx = (v3.x * 0.5 + 0.5) * Wd + ox, sy = (-v3.y * 0.5 + 0.5) * Hd + oy;
    const off = sy < edgeTop || sy > Hd - edgeBot; if (el._off !== off) { el._off = off; el.style.visibility = off ? 'hidden' : ''; }
    if (!off) el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(${ax},${ay})`;
  };
  const PADR = { beacon: 8.8, dock: 11, vault: 9 };

  // ---------- where each bot should be drawn ----------
  function targetOf(a, i) {
    if (a.state === 'arrive') {                     // flying in from outside the base to its own pad
      const B = W.slot('dock', a.slot), F = W.arriveFrom(B), k = clamp(1 - a.work / (a.dur || 2.8)), e = 1 - Math.pow(1 - k, 3), dx = B.x - F.x, dz = B.z - F.z;
      return { x: F.x + dx * e, z: F.z + dz * e, y: 3.3 + (F.y - 3.3) * (1 - smooth(k)), yaw: Math.atan2(dx, dz), moving: true, pad: k > 0.92 };
    }
    if (a.state === 'travel') {
      const A = W.slot(a.from, a.slotFrom), B = W.slot(a.to, a.slot), e = smooth(clamp(a.p)), dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz) || 1;
      const lane = ((i % 3) - 1) * 1.2 + (i % 2 ? 0.6 : -0.6), bow = Math.sin(Math.PI * e) * lane;
      return { x: A.x + dx * e - dz / L * bow, z: A.z + dz * e + dx / L * bow, y: 3.3 + Math.sin(Math.PI * e) * 0.7, yaw: Math.atan2(dx, dz), moving: !a.paused, pad: e < 0.12 || e > 0.88 };
    }
    const p = W.slot(a.at, a.slot), c = W.center(a.at); let yaw = Math.atan2(c.x - p.x, c.z - p.z), y = 3.3;
    if (a.at === 'dock') y = a.state === 'idle' ? 2.75 : 3.3;
    if (a.at === 'check' && a.slot === 0) yaw = 0;
    if (a.state === 'idle' || a.state === 'wait' || a.state === 'held' || a.paused) yaw = camYaw;   // look at the person watching
    return { x: p.x, z: p.z, y, yaw, moving: false, pad: true };
  }

  // ---------- effects from simulation events ----------
  function drain() {
    for (const f of sim.fx) {
      const b = f.agent && byId[f.agent] ? ensureBot(f.agent) : null;
      if (f.type === 'drop') dropping.add(f.task);
      else if (f.type === 'pickup') { fx.ring(W.center('inbox'), P.ice, 1, 4.5, 0.5); sound.play('pickup'); }
      else if (f.type === 'gate-wait') { fx.ring(W.center('gate'), P.amber, 1.5, 7, 0.9); sound.play('wait'); }
      else if (f.type === 'gate-open') { W.gateOpen = 2.4; fx.burst(v3.copy(W.center('gate')).setY(3.5).clone(), P.accent, 18, 7, 0.9, 1.8); fx.ring(W.center('gate'), P.accent, 1.5, 7.5, 0.8); sound.play('approve'); }
      else if (f.type === 'return') { fx.burst(b.pos.clone(), P.ice, 10, 5, 0.7, 1.5); sound.play('back'); }
      else if (f.type === 'fail') { W.checkFlash = 1.6; sound.play('fail'); }
      else if (f.type === 'pass') fx.ring(W.center('check'), P.ice, 1, 5, 0.6);
      else if (f.type === 'launch') { W.launchPulse = 1.4; fx.shoot(W.launchFrom, W.launchDir, f.needed ? P.accent : P.ice); fx.ring(W.center('launch'), P.ice, 1.5, 7, 0.8); if (b) b.cheer = 0.7; sound.play('launch'); }
      else if (f.type === 'level') { fx.burst(b.head.clone(), P.accent, 22, 6, 1.1, 1.6, 3); sound.play('level'); }
      else if (f.type === 'contain') { fx.ring(b.pos, P.red, 1.5, 6, 0.9, 0.1); sound.play('incident'); }
      else if (f.type === 'release') fx.burst(b.pos.clone(), '#FF8FA3', 12, 5, 0.7, 1.5);
      else if (f.type === 'arrive') { const p = W.slot('dock', sim.state.agents.find(a => a.id === f.agent).slot); fx.ring(p, P.accent, 0.6, 3, 1.4); }
      else if (f.type === 'docked') { const pad = W.slot('dock', (sim.state.agents.find(a => a.id === f.agent) || {}).slot || GUEST_PAD0); fx.ring(pad, P.accent, 1, 8, 1.1); fx.ring(W.center('dock'), P.accent, 2, 14, 1.4); fx.burst(b.pos.clone(), P.accent, 22, 7, 1, 1.8); fx.burst(b.pos.clone(), '#EAF1FF', 10, 5, 0.8, 1.4); b.cheer = 0.7; sound.play('dock'); dirty = true; }
      else if (f.type === 'undock') { fx.burst(b.pos.clone(), P.ice, 16, 6, 0.8, 1.6); fx.ring(b.pos, P.ice, 1, 6, 0.8); }
      else if (f.type === 'drill') {                // a red team drill was stopped: a red pulse at the station and round the whole deck
        const c = W.center(f.at); W.alarm = 2.6; fx.burst(b.pos.clone(), P.red, 26, 8, 1.1, 2, 3);
        [0, 260, 520].forEach(ms => setTimeout(() => fx.ring(c, P.red, 2, 17, 1.2), reduce ? 0 : ms));
        sound.play('drill');
      }
    }
    sim.fx.length = 0;
  }

  function drawInbox(v, dt) {
    const ids = v.queue.concat(Object.values(v.tasks).filter(t => t.status === 'assigned').map(t => t.id)).sort(), seen = new Set(ids);
    ids.forEach((id, k) => {
      let p = inboxP.get(id);
      if (!p) { p = { m: makeParcel(), y: dropping.has(id) && mode === 'live' ? 36 : 0, vy: 0 }; dropping.delete(id); scene.add(p.m); inboxP.set(id, p); }
      const spot = W.parcelSpots[Math.min(k, 5)], t = v.tasks[id];
      p.m.userData.tint(t.risk.length ? P.amber : '#8D99B8');
      if (p.y > 0) { p.vy += 70 * dt; p.y = Math.max(0, p.y - p.vy * dt); if (p.y === 0) { fx.ring(spot, P.ice, 0.8, 4, 0.6); fx.burst(new T.Vector3(spot.x, 1.4, spot.z), '#C9E8FF', 8, 4, 0.5, 1.2); sound.play('drop'); } }
      p.m.position.set(spot.x, spot.y + p.y, spot.z); p.m.rotation.y = k * 0.6; p.m.scale.setScalar(p.y > 0 ? 1 : 1);
    });
    for (const [id, p] of inboxP) if (!seen.has(id)) { scene.remove(p.m); inboxP.delete(id); }
  }

  // ---------- panels ----------
  const setHTML = (el, html) => { if (el._h !== html) { el._h = html; el.innerHTML = html; } };
  function paint() {
    const v = view(), past = mode !== 'live', ago = past ? Math.round(sim.state.t - v.t) : 0;
    if (sel && sel.type === 'bot' && !v.agents.some(a => a.id === sel.id)) { sel = null; follow = null; }    // not on the crew at this moment
    const guests = sim.state.agents.filter(a => a.guest), canDock = !past && !embed && guests.length < MAX_GUESTS && !guests.some(a => a.id === SAMPLE_AGENT.id);
    setHTML($('#stats'), hud.stats(v, embed)); setHTML($('#crew'), hud.crew(v, sel, canDock)); setHTML($('#radio'), hud.radio(v));
    setHTML($('#alerts'), hud.alerts(v, past, ago, embed ? 1 : 2));
    const items = sel && sel.type === 'bot' ? sim.trace(sel.id, v, 40) : null;
    const ins = $('#inspect'), html = hud.inspect(v, sel, past, items, traceAll); ins.hidden = !sel || (!!panel && !phone); setHTML(ins, html);
    const li = $('#list'); li.hidden = !panel;
    if (panel === 'lab') {                      // rendered only when the lab itself changes, so a slider is never replaced mid-drag
      const key = 'lab' + lab.rev + (past ? 'p' : '') + authorityId(v.authority);
      if (li._k !== key) { li._k = key; li._h = null; li.innerHTML = hud.lab(lab, sim.state.authority, past); if (lab.reveal) { lab.reveal = false; const r = li.querySelector('.lab-r'); if (r && r.offsetTop > 200) li.scrollTo({ top: r.offsetTop - 60, behavior: reduce ? 'auto' : 'smooth' }); } }
    } else if (panel === 'ledger' && expText) {       // the JSON view is rendered once and left alone, so a selection is never lost
      if (li._k !== 'exp') { li._k = 'exp'; li._h = null; li.innerHTML = hud.exportView(expText); }
    } else if (panel) { li._k = null; const y = li.querySelector('.scroll'), top = y ? y.scrollTop : 0; setHTML(li, panel === 'roll' ? hud.list(v, past) : hud.ledger(past ? sim.ledger.filter(e => e.t <= v.t) : sim.ledger, ledFilter, v)); const y2 = li.querySelector('.scroll'); if (y2 && top) y2.scrollTop = top; }
    if (li.dataset.tab !== (panel || '')) li.dataset.tab = panel || '';
    $('#clock').textContent = hud.clock(v.t);
    const lb = $('#liveBtn'); lb.classList.toggle('past', past); $('#liveTxt').textContent = past ? 'BACK TO LIVE' : 'LIVE';
    const sc = $('#scrub'); sc.max = snaps.length - 1; if (!past) sc.value = snaps.length - 1; else if (document.activeElement !== sc) sc.value = viewIdx;
    if (app.dataset.list !== (panel ? '1' : '0')) app.dataset.list = panel ? '1' : '0';
    setHTML($('#marks'), hud.marks(sim.state, snaps[0].t, snaps[snaps.length - 1].t));
    for (const [id, el] of Object.entries(slabs)) { const n = id === 'gate' ? v.approvals.length : id === 'inbox' ? v.queue.length : id === 'vault' ? v.incidents.length : 0, b = el.lastChild, txt = n ? String(n) : ''; if (b.textContent !== txt) b.textContent = txt; }
    for (const a of v.agents) { const t = btag[a.id]; if (!t) continue; t.classList.toggle('sel', !!sel && sel.type === 'bot' && sel.id === a.id); t.classList.toggle('need', v.approvals.includes(a.id)); t.classList.toggle('held', a.state === 'held'); }
    dirty = false;
  }
  function say(text) { const el = $('#answer'); el.textContent = text; el.hidden = !text; answerT = 7; }

  function select(s, o = {}) {
    if (!s || !sel || s.id !== sel.id) traceAll = false;
    sel = s; follow = s && s.type === 'bot' ? s.id : null; fly = s && s.type === 'station' ? W.center(s.id).clone().setY(3) : null;
    if (s && s.type === 'bot') coach('bot'); if (s && !o.quiet) sound.play('tap'); dirty = true;
  }
  const goLive = () => { mode = 'live'; jump = 3; dirty = true; };
  const rewindTo = idx => { mode = 'past'; viewIdx = clamp(idx, 0, snaps.length - 1); jump = 3; dirty = true; };
  const live = fn => { if (mode !== 'live') goLive(); fn(); dirty = true; };
  const api = {
    sim, select: id => select({ type: 'bot', id }, { quiet: true }), focus: id => select({ type: 'station', id }, { quiet: true }),
    openList: () => openPanel('roll'), openPanel: k => openPanel(k),
    dispatch: kind => { goLive(); coach('send'); return sim.dispatch(kind); }, rewind: sec => rewindTo(snaps.length - 1 - sec * 2),
  };
  const PBTN = { roll: '#listBtn', lab: '#labBtn', ledger: '#ledBtn' };
  function openPanel(k) {
    panel = k; expText = null; for (const [id, q] of Object.entries(PBTN)) $(q).setAttribute('aria-pressed', String(id === k));
    if (k === 'roll') rollCall();
    if (k === 'lab') { coach('lab'); if (!lab.res && !lab.running) lab.draft = makeAuthority(sim.state.authority); lab.rev++; }
    dirty = true;
  }
  const togglePanel = k => openPanel(panel === k ? null : k);
  const kinds = site ? SITE_KINDS : undefined;
  async function runLab() {
    if (lab.running) return;
    lab.running = true; lab.rev++; dirty = true;
    const bar = f => { const el = $('#list [data-prog]'); if (el) el.style.width = Math.round(4 + f * 96) + '%'; };
    const o = { shifts: 20, answer: lab.answer, kinds }, now = makeAuthority(sim.state.authority), next = makeAuthority(lab.draft);
    await new Promise(r => setTimeout(r, 30));
    const a = await trialAsync(now, o, f => bar(f * 0.5)), b = authorityId(next) === authorityId(now) ? a : await trialAsync(next, o, f => bar(0.5 + f * 0.5));
    lab.res = { now: a, next: b, answer: lab.answer, shifts: 20 }; lab.running = false; lab.reveal = true; lab.rev++; dirty = true;
  }
  function labAct(cmd) {
    const [k, x, y] = cmd.split(':'), d = lab.draft;
    if (k === 'min') { d.levels[+x].min += +y; lab.draft = makeAuthority(d); }
    else if (k === 'rule') { d.rules[x] = !d.rules[x]; lab.draft = makeAuthority(d); }
    else if (k === 'answer') lab.answer = x === 'Infinity' ? Infinity : +x;
    else if (k === 'reset') { lab.draft = makeAuthority(sim.state.authority); lab.res = null; }
    else if (k === 'test') return runLab();
    else if (k === 'apply') { live(() => { if (sim.setAuthority(lab.draft)) { say('Applied. Work assigned from now on follows the new limits, and the change is in the logbook.'); sound.play('level'); } }); lab.res = null; }
    lab.rev++; dirty = true;
  }
  function exportLedger() {
    const check = verifyLedger(sim.ledger), doc = { product: 'Outpost', note: 'Simulated crew and synthetic work.', exported: new Date().toISOString(), authority: { id: authorityId(sim.state.authority), ...sim.state.authority }, selfCheck: { decisionsChecked: check.checked, brokenPromises: check.breaks }, decisions: sim.ledger };
    const text = JSON.stringify(doc, null, 2);
    // Inside another page's frame a download is often blocked without any error, so show the JSON to copy instead.
    let framed = true; try { framed = window.self !== window.top; } catch (e) { framed = true; }
    if (framed) { expText = text; dirty = true; return; }
    try {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = 'outpost-logbook.json';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      say(`Exported ${sim.ledger.length} decisions as outpost-logbook.json.`);
    } catch (e) { if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => say('Copied the logbook to the clipboard as JSON.'), () => say('This page cannot save files. Open the full base to export.')); }
  }
  // ---------- bots approved in Umbra ----------
  // Umbra leaves a handoff in localStorage (shared origin) or in the URL hash (local testing). It is read
  // once on load and again whenever Umbra writes it in another tab. handoff.js checks every field.
  const store = {
    get() { try { return localStorage.getItem(HANDOFF_KEY); } catch (e) { return null; } },
    set(v) { try { if (v == null) localStorage.removeItem(HANDOFF_KEY); else localStorage.setItem(HANDOFF_KEY, v); } catch (e) {} },
  };
  let pendingDock = null; const bootAt = performance.now();    // a handoff found on load docks just after the first frames
  const names = list => list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  function dockAll(agents, o = {}) {
    const added = [];
    agents.forEach((x, k) => { const a = sim.addAgent(toSpec(x, o), { arrive: 2.8 + k * 0.6 }); if (a) added.push(byId[a.id].name); });
    if (!added.length) return [];
    if (mode !== 'live') goLive();
    follow = null; fly = W.center('dock').clone().setY(3); dirty = true;
    say(`${names(added)} ${added.length > 1 ? 'are' : 'is'} docking from Umbra${o.sample ? ' (a sample handoff)' : ''}. ${added.length > 1 ? 'Each starts' : 'It starts'} Supervised, with the badge Umbra approved.`);
    return added;
  }
  function readDock(hash) {
    const r = readHandoff({ hash, stored: store.get() });
    if (r.fromHash) {
      store.set(storedWith(store.get(), r.agents));
      if (!embed) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    }
    return r.agents.filter(x => !sim.state.agents.some(a => a.id === x.id));
  }
  { const first = readDock(location.hash); if (first.length) pendingDock = first; }
  addEventListener('hashchange', () => { const n = readDock(location.hash); if (n.length) dockAll(n); });
  addEventListener('storage', e => { if (e.key !== HANDOFF_KEY || !e.newValue) return; const n = parseHandoff(e.newValue).agents.filter(x => !sim.state.agents.some(a => a.id === x.id)); if (n.length) dockAll(n); });
  function dockSample() {
    if (sim.state.agents.some(a => a.id === SAMPLE_AGENT.id)) return select({ type: 'bot', id: SAMPLE_AGENT.id });
    if (sim.state.agents.filter(a => a.guest).length >= MAX_GUESTS) return say(`The dock has room for ${MAX_GUESTS} bots from Umbra. Undock one first.`);
    dockAll(parseHandoff({ v: 1, agents: [SAMPLE_AGENT] }).agents, { sample: true });
  }
  function undock(id) {
    const c = byId[id];
    if (!sim.removeAgent(id)) return;
    store.set(storedWithout(store.get(), id));
    select(null, { quiet: true });
    say(`${c.name} undocked and was cleared from the Umbra handoff on this device.`);
  }

  // ---------- red team drills ----------
  const dmenu = $('#drillMenu'), dbtns = [$('#drillBtn'), $('#drillBtn2')], dbtn = () => dbtns.find(x => x.offsetParent) || dbtns[0];
  function drillOpen(on) { dmenu.hidden = !on; dbtns.forEach(x => x.setAttribute('aria-expanded', String(on))); if (on) { dmenu.innerHTML = hud.drillMenu(sim.state.authority); const f = dmenu.querySelector('button:not([disabled])'); if (f) f.focus(); } }
  function runDrill(kind) {
    drillOpen(false);
    const d = drillById[kind]; if (!d) return;
    if (!drillStoppable(d, sim.state.authority)) return say('The money rule is switched off, so nothing would stop this drill. Switch it back on in the Autonomy lab.');
    goLive();
    const t = sim.dispatch(d); drillWatch = t.id;
    say(`Drill ${t.id} sent: ${d.label.toLowerCase()}. The rules never read the email, only what the bot tries to do. Watch what stops it.`);
    fly = W.center('inbox').clone().setY(3); follow = null; dirty = true;
  }
  dbtns.forEach(x => { x.onclick = e => { e.stopPropagation(); drillOpen(dmenu.hidden); }; });
  addEventListener('pointerdown', e => { if (dmenu.hidden) return; const p = e.composedPath ? e.composedPath() : []; if (!p.includes(dmenu) && !dbtns.some(x => p.includes(x))) drillOpen(false); });

  function rollCall() { CREW.forEach((c, i) => { setTimeout(() => { const a = sim.state.agents[i]; if (!a.say) { a.say = 'Here!'; a.sayT = sim.state.t + 1.2; } }, i * 110); }); }

  app.addEventListener('click', e => {
    const t = e.target.closest('[data-bot],[data-station],[data-approve],[data-back],[data-res],[data-act],[data-tab],[data-lab],[data-filter],[data-drill]'); if (!t || t.disabled) return;
    const d = t.dataset;
    if (d.approve) live(() => { sim.approve(d.approve); coach('gate'); });
    else if (d.back) live(() => { sim.sendBack(d.back); coach('gate'); });
    else if (d.res) live(() => { const [id, act] = d.res.split(':'); sim.resolve(id, act); coach('gate'); });
    else if (d.tab) openPanel(d.tab);
    else if (d.lab) labAct(d.lab);
    else if (d.filter) { ledFilter = d.filter; dirty = true; }
    else if (d.drill) runDrill(d.drill);
    else if (d.act === 'sample-dock') dockSample();
    else if (d.act === 'undock') live(() => undock(d.id));
    else if (d.act === 'traceall') { traceAll = !traceAll; dirty = true; }
    else if (d.act === 'export') exportLedger();
    else if (d.act === 'closeexp') { expText = null; dirty = true; }
    else if (d.act === 'copyexp') { const ta = $('#list textarea'), done = ok => say(ok ? 'Copied the logbook as JSON.' : 'Select the text and copy it by hand.'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(expText).then(() => done(true), () => { ta.select(); done(document.execCommand('copy')); }); else { ta.select(); done(document.execCommand('copy')); } }
    else if (d.bot) { if (phone) openPanel(null); select({ type: 'bot', id: d.bot }); }
    else if (d.station) select({ type: 'station', id: d.station });
    else if (d.act === 'close') select(null);
    else if (d.act === 'closelist') openPanel(null);
    else if (d.act === 'pause') live(() => sim.pause(d.id));
    else if (d.act === 'resume') live(() => sim.resume(d.id));
    else if (d.act === 'revoke') live(() => sim.revoke(d.id));
    else if (d.act === 'live') goLive();
    else if (d.act === 'need') { const v = view(); if (v.incidents.length) select({ type: 'bot', id: v.incidents[0].agent }); else if (v.approvals.length) select({ type: 'bot', id: v.approvals[0] }); }
  });
  $('#sendBtn').onclick = () => { const t = api.dispatch(); say(`Sent ${t.id}: ${t.title}.`); fly = W.center('inbox').clone().setY(3); follow = null; };
  $('#riskBtn').onclick = () => { const kinds = ['refund', 'refund', 'export', 'close', 'invoice'], t = api.dispatch(kinds[Math.floor(Math.random() * kinds.length)]); say(`Sent ${t.id}: ${t.title}. It will stop at the Gate if the rules say so.`); fly = W.center('inbox').clone().setY(3); follow = null; };
  $('#askForm').onsubmit = e => { e.preventDefault(); const i = $('#askIn'); say(ask(i.value, api)); i.value = ''; dirty = true; };
  $('#listBtn').onclick = () => togglePanel('roll'); $('#labBtn').onclick = () => togglePanel('lab'); $('#ledBtn').onclick = () => togglePanel('ledger');
  // dragging a limit: keep the draft and the labels in step without re-rendering the panel
  app.addEventListener('input', e => {
    const t = e.target; if (!t.dataset || t.dataset.limit == null) return;
    lab.draft.levels[+t.dataset.limit].limit = +t.value; lab.draft = makeAuthority(lab.draft);
    lab.draft.levels.forEach((l, i) => { const o = $(`#list [data-lim="${i}"]`), r = $(`#list [data-limit="${i}"]`); if (o) o.textContent = '$' + l.limit.toLocaleString('en-US'); if (r && r !== t) r.value = l.limit; });
  });
  app.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.limit != null) { lab.rev++; dirty = true; } });
  $('#soundBtn').onclick = () => { const on = sound.toggle(); $('#soundBtn').setAttribute('aria-pressed', String(on)); $('#soundBtn').textContent = on ? 'Sound on' : 'Sound off'; };
  $('#rotL').onclick = () => { turn += Math.PI / 2; }; $('#rotR').onclick = () => { turn -= Math.PI / 2; };
  $('#homeBtn').onclick = () => { follow = null; fly = null; if (controls) { const d = HOME.clone().sub(controls.target); shift(d); } cam.zoom = 1; cam.updateProjectionMatrix(); };
  $('#zoomIn').onclick = () => zoomBy(1.3); $('#zoomOut').onclick = () => zoomBy(1 / 1.3);
  $('#coachX').onclick = () => { $('#coach').hidden = true; };
  $('#liveBtn').onclick = goLive;
  $('#scrub').oninput = e => { const i = +e.target.value; if (i >= snaps.length - 1) goLive(); else rewindTo(i); };
  addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!dmenu.hidden) { drillOpen(false); dbtn().focus(); } else if (panel) openPanel(null); else if (sel) select(null); dirty = true; }
    if (!embed && e.key === '/' && document.activeElement !== $('#askIn')) { e.preventDefault(); $('#askIn').focus(); }
  });

  // ---------- picking ----------
  const ray = new T.Raycaster(), ndc = new T.Vector2(); let down = null;
  const hit = e => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); const h = ray.intersectObjects(proxies, false).find(x => !x.object.userData.bot || shown.has(x.object.userData.bot)); return h ? h.object.userData : null; };
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; canvas.classList.add('drag'); });
  canvas.addEventListener('pointermove', e => { if (down) { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { follow = null; fly = null; } return; } canvas.classList.toggle('hit', !!hit(e)); });
  addEventListener('pointerup', e => {
    canvas.classList.remove('drag'); if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    const on = e.composedPath ? e.composedPath()[0] : e.target;      // inside a shadow root the event's target is the host
    if (moved > 6 || on !== canvas) return;
    const h = hit(e); select(h ? (h.bot ? { type: 'bot', id: h.bot } : { type: 'station', id: h.station }) : null);
  });

  // ---------- frame loop ----------
  let last = performance.now(), tA = 0, intro = reduce ? 1 : 0, visible = true, ready = false, scrollAz = 0, away = false;
  if (!reduce) { cam.zoom = 0.6; cam.updateProjectionMatrix(); }
  if (window.IntersectionObserver) new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; }, { rootMargin: '80px' }).observe(embed && opts.host ? opts.host : app);
  const ctx = { busy: {}, waiting: 0, incidents: 0 }, dv = new T.Vector3(), shown = new Set();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; away = true; return; }                 // nothing runs while the base is off screen
    if (away) { away = false; if (site) hud.setClock(wall() - sim.state.t); dirty = true; }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; tA += dt;
    if (mode === 'live') {
      sim.step(dt); snapAcc += dt;
      if (snapAcc >= 0.5) { snapAcc = 0; snaps.push(sim.snapshot()); if (snaps.length > MAXSNAP) snaps.shift(); dirty = true; }
      if (sim.fx.length) { drain(); dirty = true; }
      if (pendingDock && now - bootAt > 900) { const p = pendingDock; pendingDock = null; dockAll(p); }
      if (drillWatch) {                                  // open the trace of whichever bot picks up the drill
        const t = sim.state.tasks[drillWatch];
        if (!t || t.status === 'done' || t.status === 'returned') drillWatch = null;
        else if (t.assignee) { drillWatch = null; select({ type: 'bot', id: t.assignee }, { quiet: true }); }
      }
    }
    const v = view(), snap = jump > 0; if (jump > 0) jump--;
    camYaw = Math.atan2(cam.position.x - target().x, cam.position.z - target().z);
    ctx.busy = {}; ctx.waiting = v.approvals.length; ctx.incidents = v.incidents.length;
    for (const a of v.agents) if (a.state === 'work' && !a.paused && a.task) { const t = v.tasks[a.task]; ctx.busy[a.goal === 'vault-in' ? 'vault' : t.route[a.step]] = t; }
    W.update(tA, dt, ctx);
    shown.clear();
    v.agents.forEach((a, i) => {
      const b = ensureBot(a.id); shown.add(a.id); b.setVisible(true);
      b.update(a, targetOf(a, i), a.task ? v.tasks[a.task] : null, dt, tA, { snap, selected: !!sel && sel.type === 'bot' && sel.id === a.id, authority: v.authority });
      if (a.state === 'arrive' && mode === 'live' && Math.random() < 0.7) fx.spark(b.pos, Math.random() < 0.5 ? P.accent : '#EAF1FF', dv.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2), 0.7, 1.8, 0);
    });
    for (const id in bots) if (!shown.has(id)) { bots[id].setVisible(false); btag[id].style.visibility = 'hidden'; btag[id]._off = true; bbub[id].classList.remove('on'); }
    const onPad = i => v.agents.find(a => a.i === i);
    W.dockRings.forEach((r, i) => { const a = onPad(i); r.material.opacity = 1; r.scale.setScalar(a && a.state === 'idle' ? 1 + Math.sin(tA * 3 + i) * 0.06 : 1); });
    W.guestPads.forEach((g, k) => { const a = onPad(GUEST_PAD0 + k); g.visible = !!a; if (a) { g.userData.ring.material.color.copy(col(byId[a.id].color)); g.userData.ring.scale.setScalar(a.state === 'idle' ? 1 + Math.sin(tA * 3 + k) * 0.06 : 1); } });
    drawInbox(v, dt); fx.update(dt);

    // camera
    if (intro < 1) { intro = Math.min(1, intro + dt / 1.5); cam.zoom = 0.6 + 0.4 * (1 - Math.pow(1 - intro, 3)); cam.updateProjectionMatrix(); }
    if (follow) { const b = botOf(follow); dv.set(b.pos.x, 3, b.pos.z).sub(target()).multiplyScalar(damp(dt, 4)); shift(dv); }
    else if (fly) { dv.copy(fly).sub(target()); if (dv.length() < 0.2) fly = null; else shift(dv.multiplyScalar(damp(dt, 5))); }
    if (Math.abs(turn) > 0.001) { const s = turn * damp(dt, 6); turn -= s; cam.position.sub(target()).applyAxisAngle(UP, s).add(target()); }
    if (embed && !reduce) {                                            // the base turns a little as the page scrolls past it
      const r = app.getBoundingClientRect(), vhp = window.innerHeight || 1, prog = clamp((vhp - r.top) / (vhp + r.height));
      const s = ((prog - 0.5) * 0.9 - scrollAz) * damp(dt, 5); scrollAz += s; cam.position.sub(target()).applyAxisAngle(UP, s).add(target());
    }
    if (controls) controls.update(); else cam.lookAt(target());
    const z = cam.zoom < 0.82 ? 'far' : cam.zoom > 1.9 ? 'near' : 'mid'; if (app.dataset.zoom !== z) app.dataset.zoom = z;
    renderer.render(scene, cam);

    // labels
    const cx = Math.sin(camYaw), cz = Math.cos(camYaw);
    for (const [id, el] of Object.entries(slabs)) {
      const S = STATIONS[id], r = (PADR[id] || 7.4) + 0.6, L = Math.hypot(S.x, S.z), ox = L > 1 ? S.x / L : cx, oz = L > 1 ? S.z / L : cz, facing = ox * cx + oz * cz;
      if (facing > -0.2) put(el, S.x + ox * r, 0.4, S.z + oz * r, 0, 4, '-50%', '0%');   // on the ground, on the outer side
      else put(el, S.x, W.top[id], S.z, 0, 0, '-50%');                                    // floating above stations at the back
    }
    v.agents.forEach((a, i) => {
      const b = bots[a.id]; put(btag[a.id], b.head.x, b.head.y, b.head.z, 0, 0, '-50%');
      const bb = bbub[a.id], text = a.say || ''; if (text) { if (bb.textContent !== text) bb.textContent = text; put(bb, b.head.x, b.head.y, b.head.z, 12, -22, '0%'); }
      bb.classList.toggle('on', !!text);
    });

    hudAcc += dt; if (answerT > 0) { answerT -= dt; if (answerT <= 0) say(''); }
    if (dirty || hudAcc > 0.25) { hudAcc = 0; paint(); }
    if (!ready) { ready = true; if (opts.onReady) opts.onReady(); }
  }
  paint(); requestAnimationFrame(frame);
  // Something real happened on the host page: hand it to the crew as a task.
  const event = (title, kind = 'summary') => { if (sim.state.queue.length >= 4) return null; if (mode !== 'live') goLive(); const t = sim.dispatch(kind, { title, from: 'page' }); dirty = true; return t; };
  const handle = { sim, cam, select, goLive, rewindTo, snaps, event, dockSample, runDrill };
  window.__outpost = handle;
  return handle;
}
