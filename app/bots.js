// The crew. Each bot is a little hovering robot with a screen for a face, a hat of its own,
// and a parcel it tows behind it. Everything it shows comes from the simulation state.
import { T, col, std, lit, add, mesh, box, cyl, ball, cone, torus, sprite, canvasTex, glowTex, clamp, damp } from './gfx.js';
import { levelOf, LEVELS } from '../src/index.js';
import { P } from './palette.js';

const INK = '#04060D', EYE = P.ice;
const shade = (c, k = 0.68) => '#' + new T.Color(c).multiplyScalar(k).getHexString();

function drawFace(g, mood, blink) {
  g.clearRect(0, 0, 128, 72);
  g.fillStyle = INK; g.beginPath(); const r = 18; g.moveTo(r, 0); g.arcTo(128, 0, 128, 72, r); g.arcTo(128, 72, 0, 72, r); g.arcTo(0, 72, 0, 0, r); g.arcTo(0, 0, 128, 0, r); g.fill();
  const L = 42, R = 86, Y = 37;
  g.fillStyle = EYE; g.strokeStyle = EYE; g.lineWidth = 7; g.lineCap = 'round';
  const line = (x0, y0, x1, y1) => { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const dot = (x, y, rr) => { g.beginPath(); g.arc(x, y, rr, 0, 6.3); g.fill(); };
  if (blink && !['sleep', 'happy', 'paused'].includes(mood)) { line(L - 10, Y, L + 10, Y); line(R - 10, Y, R + 10, Y); return; }
  if (mood === 'sleep') { for (const x of [L, R]) { g.beginPath(); g.arc(x, Y - 6, 11, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); } }
  else if (mood === 'happy') { for (const x of [L, R]) { g.beginPath(); g.arc(x, Y + 7, 11, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); } }
  else if (mood === 'work') { for (const x of [L, R]) { g.beginPath(); g.moveTo(x - 11, Y - 4); g.lineTo(x + 11, Y - 4); g.lineTo(x + 8, Y + 5); g.lineTo(x - 8, Y + 5); g.closePath(); g.fill(); } }
  else if (mood === 'wait') { dot(L, Y, 13); dot(R, Y, 13); g.fillStyle = INK; dot(L + 1, Y - 5, 5.5); dot(R + 1, Y - 5, 5.5); }
  else if (mood === 'alert') { g.lineWidth = 6; for (const x of [L, R]) { g.beginPath(); g.arc(x, Y, 11, 0, 6.3); g.stroke(); } }
  else if (mood === 'sneak') { dot(L, Y, 11); dot(R, Y, 11); g.fillStyle = INK; dot(L + 6, Y + 1, 5); dot(R + 6, Y + 1, 5); }
  else if (mood === 'paused') { g.lineWidth = 6; for (const x of [L, R]) { line(x - 5, Y - 9, x - 5, Y + 9); line(x + 5, Y - 9, x + 5, Y + 9); } }
  else { dot(L, Y, 10); dot(R, Y, 10); }
}

const BODY = {
  pod:  { geo: () => { const g = new T.SphereGeometry(1.15, 12, 9); g.scale(1, 0.92, 1); return g; }, w: 1.15, top: 1.04, bot: -1.04, front: 1.02 },
  box:  { geo: () => new T.BoxGeometry(1.9, 1.7, 1.6), w: 0.95, top: 0.85, bot: -0.85, front: 0.8 },
  cone: { geo: () => new T.CylinderGeometry(0.82, 1.22, 1.9, 8), w: 1.05, top: 0.95, bot: -0.95, front: 0.99 },
  drum: { geo: () => new T.CylinderGeometry(1.1, 1.1, 1.6, 14), w: 1.1, top: 0.8, bot: -0.8, front: 1.1 },
};

function hat(kind, g, top, c) {
  const dk = std(c, { emissive: col(c), emissiveIntensity: 0.4, roughness: 0.45 }), spin = [];
  if (kind === 'antenna') { g.add(cyl(0.05, 0.05, 0.8, 5, dk, 0, top + 0.4, 0), ball(0.2, lit(c), 0, top + 0.9, 0, false)); return { h: 1.1, spin }; }
  if (kind === 'visor') { const t = torus(0.78, 0.13, 6, 14, dk, 0, top - 0.12, 0); t.rotation.x = Math.PI / 2; g.add(t); const a = cyl(0.04, 0.04, 0.9, 5, dk, 0.55, top + 0.35, -0.2); a.rotation.z = -0.35; g.add(a, ball(0.13, lit(P.red), 0.71, top + 0.78, -0.2, false)); return { h: 0.95, spin }; }
  if (kind === 'halo') { const t = torus(0.62, 0.07, 6, 22, lit(P.ice), 0, top + 0.55, 0, false); t.rotation.x = Math.PI / 2; g.add(t); return { h: 0.75, spin }; }
  if (kind === 'prop') { g.add(cyl(0.06, 0.06, 0.5, 5, dk, 0, top + 0.25, 0)); const p = new T.Group(); p.position.y = top + 0.55; p.add(box(1.7, 0.05, 0.24, std(P.ice), 0, 0, 0), box(0.24, 0.05, 1.7, std(P.ice), 0, 0, 0)); g.add(p); spin.push(p); return { h: 0.75, spin }; }
  if (kind === 'spike') { g.add(cone(0.32, 0.85, 6, dk, 0, top + 0.4, 0)); return { h: 0.95, spin }; }
  if (kind === 'cap') { g.add(cyl(0.74, 0.78, 0.34, 10, dk, 0, top + 0.16, 0), box(0.95, 0.09, 0.7, dk, 0, top + 0.06, 0.72)); return { h: 0.5, spin }; }
  if (kind === 'bow') { const b = std(P.ice); const l = cone(0.34, 0.6, 6, b, -0.32, top + 0.3, 0), r = cone(0.34, 0.6, 6, b, 0.32, top + 0.3, 0); l.rotation.z = -Math.PI / 2; r.rotation.z = Math.PI / 2; g.add(l, r, ball(0.17, b, 0, top + 0.3, 0)); return { h: 0.7, spin }; }
  const d = mesh(new T.SphereGeometry(0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), std(P.ceramic, { side: T.DoubleSide }), 0, top + 0.7, 0); d.rotation.x = Math.PI - 0.6; g.add(cyl(0.05, 0.05, 0.5, 5, dk, 0, top + 0.25, 0), d); return { h: 1.0, spin };
}

export function makeParcel() {
  const g = new T.Group(), m = std('#8D99B8', { emissive: col('#8D99B8'), emissiveIntensity: 0.4, roughness: 0.5 });
  g.add(box(0.92, 0.92, 0.92, m, 0, 0, 0), box(0.96, 0.96, 0.2, std(P.navy), 0, 0, 0, false), box(0.2, 0.96, 0.96, std(P.navy), 0, 0, 0, false));
  g.userData.m = m; g.userData.c = '';
  g.userData.tint = c => { if (g.userData.c !== c) { g.userData.c = c; m.color.copy(col(c)); m.emissive.copy(col(c)); } };
  return g;
}

export function makeBot(spec, i, scene) {
  const SC = 1.5, root = new T.Group(), body = new T.Group(); root.add(body); root.scale.setScalar(SC); scene.add(root);
  const c = spec.color, B0 = BODY[spec.body], main = std('#EDF1F9', { emissive: col('#C9D3EA'), emissiveIntensity: 0.16, roughness: 0.36, metalness: 0.04, flatShading: false }), dk = std(c, { emissive: col(c), emissiveIntensity: 0.4, roughness: 0.45 });
  body.add(mesh(B0.geo(), main));
  if (spec.body === 'box') body.add(box(1.94, 0.24, 1.64, dk, 0, -0.52, 0, false));
  if (spec.body === 'drum') { const t = torus(1.12, 0.1, 6, 18, dk, 0, -0.45, 0, false); t.rotation.x = Math.PI / 2; body.add(t); }
  body.add(box(1.52, 0.9, 0.18, std('#070A14'), 0, 0.12, B0.front - 0.03, false));
  const fc = canvasTex(128, 72, g => drawFace(g, 'sleep', false));
  body.add(mesh(new T.PlaneGeometry(1.34, 0.755), new T.MeshBasicMaterial({ map: fc.tex, transparent: true }), 0, 0.12, B0.front + 0.075, false));
  const hl = ball(0.27, dk, -(B0.w + 0.3), -0.25, 0.25), hr = ball(0.27, dk, B0.w + 0.3, -0.25, 0.25); body.add(hl, hr);
  const th = cone(0.42, 0.5, 8, std(P.dark), 0, B0.bot - 0.18, 0, false); th.rotation.x = Math.PI; body.add(th);
  const flame = sprite(c, 3.4, 0.8); flame.position.y = B0.bot - 0.75; body.add(flame);
  const H = hat(spec.hat, body, B0.top, c);
  const pips = [0, 1, 2].map(() => { const p = mesh(new T.OctahedronGeometry(0.15), lit(P.accent), 0, 0, 0, false); body.add(p); return p; });
  body.traverse(o => { if (o.isMesh && o.material.isMeshStandardMaterial) { o.castShadow = true; } });
  const proxy = mesh(new T.SphereGeometry(2.1, 8, 6), new T.MeshBasicMaterial({ visible: false }), 0, 0, 0, false);
  proxy.userData.bot = spec.id; root.add(proxy);

  // things that live in the world around the bot
  const pool = mesh(new T.PlaneGeometry(6.6, 6.6), new T.MeshBasicMaterial({ map: glowTex(), color: col(c), transparent: true, opacity: 0.4, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.8, 0, false); pool.rotation.x = -Math.PI / 2; scene.add(pool);
  const ring = mesh(new T.RingGeometry(2.5, 2.9, 40), lit(P.accent, { transparent: true, opacity: 0.95, side: T.DoubleSide, depthWrite: false }), 0, 0.84, 0, false); ring.rotation.x = -Math.PI / 2; ring.visible = false; scene.add(ring);
  const dome = mesh(new T.SphereGeometry(3.9, 18, 14), add(P.red, 0.22), 0, 0, 0, false); dome.visible = false; scene.add(dome);
  const parcel = makeParcel(); parcel.scale.setScalar(1.35); parcel.visible = false; scene.add(parcel);
  const tg = new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
  const tether = new T.Line(tg, new T.LineBasicMaterial({ color: col(P.ice), transparent: true, opacity: 0.6 })); tether.visible = false; tether.frustumCulled = false; scene.add(tether);

  const B = { spec, i, root, proxy, pos: new T.Vector3(), head: new T.Vector3(), yaw: 0.8, mood: 'sleep', blink: false, nextBlink: 1 + i * 0.37, cheer: 0, tilt: 0, lift: 0, ppos: new T.Vector3(), init: false };

  B.update = (a, tgt, task, dt, t, o) => {
    const k = o.snap || !B.init ? 1 : damp(dt, 11);
    B.pos.x += (tgt.x - B.pos.x) * k; B.pos.z += (tgt.z - B.pos.z) * k; B.lift += (tgt.y - B.lift) * (o.snap || !B.init ? 1 : damp(dt, 7));
    let dy = tgt.yaw - B.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); B.yaw += dy * (o.snap || !B.init ? 1 : damp(dt, 9));
    const idle = a.state === 'idle', frozen = a.paused, bob = frozen ? 0 : Math.sin(t * 2.6 + i * 1.3) * (idle ? 0.03 : 0.12);
    B.pos.y = B.lift + bob; root.position.copy(B.pos); root.rotation.y = B.yaw;

    // body language
    B.tilt += ((tgt.moving && !frozen ? 0.2 : 0) - B.tilt) * damp(dt, 8);
    body.rotation.x = B.tilt; body.rotation.z = a.state === 'work' && !frozen ? Math.sin(t * 9 + i) * 0.045 : 0;
    if (B.cheer > 0) { B.cheer -= dt; body.rotation.y = (1 - clamp(B.cheer / 0.7)) * Math.PI * 2; body.position.y = Math.sin(clamp(B.cheer / 0.7) * Math.PI) * 0.9; } else { body.rotation.y = 0; body.position.y = 0; }
    const hx = B0.w + 0.3; let ly = -0.25, ry = -0.25, lz = 0.25, rz = 0.25;
    if (!frozen) {
      if (a.state === 'work') { ly += Math.max(0, Math.sin(t * 11)) * 0.35; ry += Math.max(0, Math.sin(t * 11 + 3.14)) * 0.35; lz = rz = 0.6; }
      else if (a.state === 'wait') { ly = ry = 0.25 + Math.sin(t * 3) * 0.06; lz = rz = 0.75; }
      else if (tgt.moving) { lz = rz = -0.1; ly = ry = -0.35 + Math.sin(t * 6 + i) * 0.06; }
      else if (a.state === 'held') { ly = ry = 0.55; }
    }
    hl.position.set(-hx, ly, lz); hr.position.set(hx, ry, rz);
    flame.material.opacity = idle ? 0.22 : frozen ? 0.3 : 0.7 + Math.sin(t * 23 + i) * 0.15; flame.scale.setScalar(idle ? 2.2 : 3.4 + (tgt.moving ? 0.8 : 0));
    pool.position.set(B.pos.x, tgt.pad ? 0.76 : 0.05, B.pos.z); pool.material.opacity = idle ? 0.14 : 0.4;
    H.spin.forEach(s => { s.rotation.y += dt * (idle || frozen ? 1.5 : 18); });

    // face
    const mood = frozen ? 'paused' : a.mood;
    if (t > B.nextBlink) { B.blink = !B.blink; B.nextBlink = t + (B.blink ? 0.13 : 2.2 + ((i * 7 + Math.floor(t)) % 5) * 0.6); B.mood = ''; }
    if (mood !== B.mood) { B.mood = mood; drawFace(fc.g, mood, B.blink); fc.tex.needsUpdate = true; }

    // trust shown as pips circling the hat
    const lv = LEVELS.indexOf(levelOf(a.clean)) + 1, py = B0.top + H.h + 0.45;
    pips.forEach((p, j) => { p.visible = j < lv; const an = t * 1.6 + j * (6.283 / lv); p.position.set(Math.cos(an) * 0.62, py + Math.sin(t * 3 + j) * 0.05, Math.sin(an) * 0.62); p.rotation.y = t * 2; });

    // parcel on a tether
    const carrying = task && task.status === 'active';
    parcel.visible = tether.visible = !!carrying;
    if (carrying) {
      parcel.userData.tint(task.approved ? P.accent : task.approval && task.approval.needed ? P.amber : '#8D99B8');
      const fx = Math.sin(B.yaw), fz = Math.cos(B.yaw), want = new T.Vector3(B.pos.x - fx * 3.3, B.pos.y + 0.1 + Math.sin(t * 3.1 + i) * 0.15, B.pos.z - fz * 3.3);
      if (o.snap || !parcel.userData.on) B.ppos.copy(want); else B.ppos.lerp(want, damp(dt, 6));
      parcel.position.copy(B.ppos); parcel.rotation.y = B.yaw + Math.sin(t * 1.7 + i) * 0.3; parcel.rotation.z = Math.sin(t * 2.3 + i) * 0.12;
      const p = tg.attributes.position; p.setXYZ(0, B.pos.x - fx * 1.4, B.pos.y - 0.3, B.pos.z - fz * 1.4); p.setXYZ(1, B.ppos.x, B.ppos.y, B.ppos.z); p.needsUpdate = true;
    }
    parcel.userData.on = !!carrying;

    dome.visible = a.state === 'held';
    if (dome.visible) { dome.position.copy(B.pos); dome.scale.setScalar(1 + Math.sin(t * 6) * 0.05); dome.material.opacity = 0.16 + 0.08 * Math.sin(t * 8); }
    ring.visible = !!o.selected; if (ring.visible) { ring.position.set(B.pos.x, tgt.pad ? 0.82 : 0.1, B.pos.z); ring.rotation.z = t * 0.8; ring.scale.setScalar(1 + Math.sin(t * 4) * 0.04); }
    B.head.set(B.pos.x, B.pos.y + (B0.top + H.h + 0.75) * SC, B.pos.z); B.init = true;
  };
  return B;
}
