// The base itself: a floating hex deck, nine stations, and the small things that make it feel lived in.
import { T, col, std, lit, add, mesh, box, cyl, ball, cone, torus, flat, sprite, canvasTex, glowTex, seeded, clamp } from './gfx.js';
import { STATIONS } from '../src/index.js';
import { P } from './palette.js';

const DECK = P.deck;
const C = { white: P.ceramic, dark: P.dark, navy: P.navy, metal: P.metal, accent: P.accent, amber: P.amber, mint: P.teal, sky: P.cyan, lilac: P.violet, pink: P.magenta, red: P.red, orange: P.orange, blue: P.blue, ice: P.ice };
const DISPLAY = '"Geist", "Helvetica Neue", system-ui, sans-serif';
const rad = d => d * Math.PI / 180;

export function buildWorld(scene) {
  const rnd = seeded(42), anim = [], W = { anim, top: {}, parcelSpots: [], refresh: [] };
  const glowing = (c, k = 0.6) => std(c, { emissive: col(c), emissiveIntensity: k });
  const M = { white: std(C.white, { roughness: 0.5 }), dark: std(C.dark, { roughness: 0.6, metalness: 0.2 }), navy: std(C.navy, { roughness: 0.55, metalness: 0.25 }), metal: std(C.metal, { metalness: 0.35, roughness: 0.45 }), accent: glowing(C.accent, 0.5), amber: glowing(C.amber, 0.5) };

  // ---------- light ----------
  scene.add(new T.HemisphereLight(col('#C2CEEA'), col('#0A0C14'), 0.66));
  const key = new T.DirectionalLight(col('#F4F6FF'), 1.0);
  key.position.set(-55, 85, 38); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 10; sc.far = 220;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.6;
  scene.add(key); W.key = key;
  const fill = new T.DirectionalLight(col('#8FA2D8'), 0.3); fill.position.set(60, 40, -50); scene.add(fill);

  // ---------- deck ----------
  const S = 3.9, N = 7, tiles = [];
  const near = (x, z, d) => Object.values(STATIONS).some(s => Math.hypot(s.x - x, s.z - z) < d);
  for (let q = -N; q <= N; q++) for (let r = Math.max(-N, -q - N); r <= Math.min(N, -q + N); r++) {
    const ring = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)), x = 1.5 * S * q, z = Math.sqrt(3) * S * (r + q / 2);
    if (ring === N && rnd() < 0.3 && !near(x, z, 12)) continue;
    tiles.push({ x, z, y: ring >= N ? -0.6 - rnd() * 0.3 : -0.6, c: ring >= N - 1 ? P.rim : DECK[Math.floor(rnd() * 3)], s: 1 });
  }
  const V = STATIONS.vault;
  for (let k = 0; k < 7; k++) {
    const a = rad(30 + k * 60), d = k === 6 ? 0 : S * Math.sqrt(3);
    tiles.push({ x: V.x + Math.cos(a) * d, z: V.z + Math.sin(a) * d, y: -0.6, c: k % 2 ? P.vaultA : P.vaultB, s: 1, v: 1 });
  }
  tiles.push({ x: 45.4, z: -28.3, y: -0.75, c: P.vaultA, s: 0.6, v: 1 }, { x: 48.2, z: -31.3, y: -0.7, c: P.vaultB, s: 0.6, v: 1 });
  const tg = new T.CylinderGeometry(3.72, 3.72, 1.2, 6); tg.rotateY(Math.PI / 6);
  const deck = new T.InstancedMesh(tg, new T.MeshStandardMaterial({ roughness: 0.58, metalness: 0.22, flatShading: true }), tiles.length);
  const m4 = new T.Matrix4(), qI = new T.Quaternion(), qI2 = new T.Quaternion(), v3 = new T.Vector3(), sc3 = new T.Vector3();
  tiles.forEach((t, i) => { deck.setMatrixAt(i, m4.compose(v3.set(t.x, t.y, t.z), qI, sc3.set(t.s, 1, t.s))); deck.setColorAt(i, col(t.c)); });
  deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);

  // every tile gets a thin seam, and the outline of the island is lit: white for the base, red for the Vault
  {
    const hv = (x, z, R, k) => { const a = rad(60 * k); return [x + Math.cos(a) * R, z + Math.sin(a) * R]; };
    const seam = [], edges = new Map();
    for (const t of tiles) for (let k = 0; k < 6; k++) {
      const R = 3.72 * t.s, a = hv(t.x, t.z, R, k), b = hv(t.x, t.z, R, k + 1), y = t.y + 0.615;
      seam.push(a[0], y, a[1], b[0], y, b[1]);
      const A = hv(t.x, t.z, S * t.s, k), B = hv(t.x, t.z, S * t.s, k + 1), id = Math.round((A[0] + B[0]) * 4) + ':' + Math.round((A[1] + B[1]) * 4), e = edges.get(id);
      if (e) e.n++; else edges.set(id, { n: 1, a, b, y, v: t.v });
    }
    const sg = new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(seam, 3));
    scene.add(new T.LineSegments(sg, new T.LineBasicMaterial({ color: col(P.seam), transparent: true, opacity: 0.55 })));
    const rim = [...edges.values()].filter(e => e.n === 1);
    const bar = new T.InstancedMesh(new T.BoxGeometry(1, 0.1, 0.1), new T.MeshBasicMaterial(), rim.length);
    const hg = new T.PlaneGeometry(1, 2.6); hg.rotateX(-Math.PI / 2);
    const fade = canvasTex(8, 64, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); });
    const halo = new T.InstancedMesh(hg, new T.MeshBasicMaterial({ map: fade.tex, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }), rim.length);
    const e3 = new T.Euler();
    rim.forEach((e, i) => {
      const dx = e.b[0] - e.a[0], dz = e.b[1] - e.a[1], L = Math.hypot(dx, dz); qI2.setFromEuler(e3.set(0, -Math.atan2(dz, dx), 0));
      m4.compose(v3.set((e.a[0] + e.b[0]) / 2, e.y + 0.02, (e.a[1] + e.b[1]) / 2), qI2, sc3.set(L + 0.2, 1, 1));
      bar.setMatrixAt(i, m4); halo.setMatrixAt(i, m4); const c = col(e.v ? P.red : P.ice); bar.setColorAt(i, c); halo.setColorAt(i, c);
    });
    scene.add(bar, halo); W.rim = halo;
    anim.push(t => { halo.material.opacity = 0.15 + 0.04 * Math.sin(t * 1.1); });
  }

  // rock under the island, with a few crystals
  const rock = std(P.hull, { roughness: 0.7, metalness: 0.3 });
  const under = cone(45, 34, 7, rock, 0, -18.2, 0, false); under.rotation.x = Math.PI; scene.add(under);
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 6.28, d = 14 + rnd() * 22, h = 9 + rnd() * 14;
    const c1 = cone(4 + rnd() * 5, h, 5, rock, Math.cos(a) * d, -8 - h / 2 - rnd() * 6, Math.sin(a) * d, false); c1.rotation.x = Math.PI; scene.add(c1);
  }
  const vUnder = cone(11, 13, 6, std('#160C1A', { roughness: 0.8 }), V.x, -7.7, V.z, false); vUnder.rotation.x = Math.PI; scene.add(vUnder);
  [C.accent, C.ice, C.accent, C.ice, C.accent].forEach((c, i) => {
    const a = i * 1.26 + 0.4, d = 30 + rnd() * 8;
    const k = mesh(new T.OctahedronGeometry(1.4 + rnd()), lit(c), Math.cos(a) * d, -9 - rnd() * 7, Math.sin(a) * d, false); k.scale.y = 1.9; scene.add(k);
    const g = sprite(c, 10, 0.3); g.position.copy(k.position); scene.add(g);
    anim.push(t => { g.material.opacity = 0.22 + 0.1 * Math.sin(t * 1.3 + i); });
  });

  // engines under the hull, and a holographic floor far below that the beacon pings
  [[0, -36, 0, 46], [-16, -24, 12, 24], [18, -26, -10, 26]].forEach(([x, y, z, k], i) => { const g = sprite(P.accent, k, 0.3); g.position.set(x, y, z); scene.add(g); anim.push(t => { g.material.opacity = 0.2 + 0.07 * Math.sin(t * 1.7 + i * 2); }); });
  {
    const gt = canvasTex(1024, 1024, (c, w, h) => {
      c.strokeStyle = '#fff'; c.lineWidth = 1.6;
      for (let i = 0; i <= 40; i++) { const p = i * (w / 40); c.globalAlpha = i % 5 ? 0.45 : 1; c.beginPath(); c.moveTo(p, 0); c.lineTo(p, h); c.moveTo(0, p); c.lineTo(w, p); c.stroke(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'destination-in';
      const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(0.5, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    });
    const floor = flat(mesh(new T.PlaneGeometry(560, 560), new T.MeshBasicMaterial({ map: gt.tex, color: col('#7B8DC4'), transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false }), 0, -46, 0, false)); scene.add(floor);
    const pings = [0, 1, 2].map(i => { const r = flat(mesh(new T.RingGeometry(0.985, 1, 96), add(P.accent, 0), 0, -45.8, 0, false)); scene.add(r); return r; });
    anim.push(t => pings.forEach((r, i) => { const k = ((t * 0.16 + i / 3) % 1); r.scale.setScalar(30 + k * 230); r.material.opacity = 0.34 * (1 - k) * Math.min(1, k * 8); }));
    const n = 110, mp = new Float32Array(n * 3), mv = [];
    for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = 30 + rnd() * 110; mp[i * 3] = Math.cos(a) * d; mp[i * 3 + 1] = -40 + rnd() * 90; mp[i * 3 + 2] = Math.sin(a) * d; mv.push(0.6 + rnd() * 1.6); }
    const motes = new T.Points(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(mp, 3)), new T.PointsMaterial({ color: col(P.ice), size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.3, blending: T.AdditiveBlending, depthWrite: false }));
    motes.frustumCulled = false; scene.add(motes);
    anim.push((t, dt) => { const p = motes.geometry.attributes.position; for (let i = 0; i < n; i++) { let y = p.getY(i) + mv[i] * dt; if (y > 50) y = -40; p.setY(i, y); } p.needsUpdate = true; });
  }

  // three little islets, because one island alone looks lonely
  [[-62, -30, 5], [-50, 52, 4], [30, 64, 3.4]].forEach(([x, z, r], i) => {
    const g = new T.Group(); g.position.set(x, -6 - i * 2, z);
    const top = cyl(r, r, 1, 6, std(DECK[i]), 0, 0, 0); g.add(top);
    const b = cone(r, r * 1.8, 6, rock, 0, -0.5 - r * 0.9, 0, false); b.rotation.x = Math.PI; g.add(b);
    const k = mesh(new T.OctahedronGeometry(0.9), lit([C.accent, C.ice, C.accent][i]), 0, 2.2, 0, false); k.scale.y = 1.8; g.add(k);
    const s = sprite([C.accent, C.ice, C.accent][i], 6, 0.3); s.position.y = 2.2; g.add(s);
    scene.add(g); anim.push(t => { g.position.y = -6 - i * 2 + Math.sin(t * 0.5 + i * 2) * 0.8; k.rotation.y = t * 0.6; });
  });

  // ---------- dotted paths between stations ----------
  const links = [['inbox', 'beacon'], ['beacon', 'library'], ['beacon', 'workshop'], ['library', 'workshop'], ['workshop', 'check'], ['check', 'gate'], ['check', 'launch'], ['gate', 'launch'], ['launch', 'dock'], ['dock', 'inbox']];
  const dots = [];
  for (const [a, b] of links) {
    const A = STATIONS[a], B = STATIONS[b], L = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / L, uz = (B.z - A.z) / L;
    for (let d = (a === 'beacon' ? 10 : 8.4); d < L - (b === 'beacon' ? 10 : 8.4); d += 1.7) dots.push([A.x + ux * d, A.z + uz * d]);
  }
  const dg = new T.CylinderGeometry(0.3, 0.3, 0.06, 8);
  const dm = new T.InstancedMesh(dg, lit('#8693B4', { transparent: true, opacity: 0.7 }), dots.length);
  dots.forEach((d, i) => dm.setMatrixAt(i, m4.makeTranslation(d[0], 0.04, d[1]))); scene.add(dm);
  {
    const A = STATIONS.workshop, L = Math.hypot(V.x - A.x, V.z - A.z), ux = (V.x - A.x) / L, uz = (V.z - A.z) / L, vd = [];
    for (let d = 8.4; d < L - 9.5; d += 1.7) vd.push([A.x + ux * d, A.z + uz * d]);
    const vm = new T.InstancedMesh(dg, lit(C.red, { transparent: true, opacity: 0.6 }), vd.length);
    vd.forEach((d, i) => vm.setMatrixAt(i, m4.makeTranslation(d[0], 0.04, d[1]))); scene.add(vm);
  }

  // ---------- shared station parts ----------
  function station(id, padR = 7.2) {
    const s = STATIONS[id], g = new T.Group(); g.position.set(s.x, 0, s.z); scene.add(g);
    const pc = new T.Color(P.deck[2]).lerp(new T.Color(s.color), 0.1).getStyle();
    const pool = flat(mesh(new T.PlaneGeometry(padR * 4.6, padR * 4.6), new T.MeshBasicMaterial({ map: glowTex(), color: col(s.color), transparent: true, opacity: 0.13, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.05, 0, false)); g.add(pool);
    const pg = new T.CylinderGeometry(padR, padR + 0.4, 0.7, 6); pg.rotateY(Math.PI / 6);
    g.add(mesh(pg, std(pc, { roughness: 0.5, metalness: 0.25 }), 0, 0.35, 0));
    const ring = flat(mesh(new T.RingGeometry(padR - 1.5, padR - 1.15, 6), lit(s.color, { transparent: true, opacity: 0.8 }), 0, 0.72, 0, false)); ring.rotation.z = Math.PI / 6; g.add(ring);
    return g;
  }
  const lamp = (x, z, c = P.lamp) => {
    const g = new T.Group(); g.position.set(x, 0, z);
    g.add(cyl(0.09, 0.13, 3.2, 6, M.dark, 0, 1.6, 0), ball(0.36, lit(c), 0, 3.4, 0, false));
    const s = sprite(c, 4.2, 0.4); s.position.y = 3.4; g.add(s); scene.add(g);
  };
  [[-16, 1.5], [-9, -13], [8, -15], [24, -17], [29, 9], [11, 28], [-13, 30], [-30, 10], [16, 8], [-9, 14]].forEach(p => lamp(p[0], p[1]));
  const crate = (x, z, c, s = 1.3, ry = 0.3) => { const m = box(s, s, s, std(c), x, s / 2, z); m.rotation.y = ry; scene.add(m); return m; };
  crate(-38, 9, '#3A4152'); crate(-38.6, 10.6, '#2E3443', 1, 0.8); crate(-37.2, 10.3, '#474F63', 0.9, 0.1); crate(6, 39, '#3A4152', 1.2, 0.5); crate(38, 6, '#2E3443', 1.1, 0.2);
  // edge masts with blinking lights
  [[-38, -20], [3, -43], [38, 18], [-22, 40]].forEach(([x, z], i) => {
    scene.add(cyl(0.12, 0.2, 9, 5, M.metal, x, 4.5, z));
    const b = ball(0.3, lit(C.red), x, 9.2, z, false), s = sprite(C.red, 4, 0.7); s.position.set(x, 9.2, z); scene.add(b, s);
    anim.push(t => { const on = (Math.sin(t * 2.2 + i * 1.7) > 0.55) ? 1 : 0.12; s.material.opacity = on * 0.8; });
  });
  // flag with the mark
  {
    const g = new T.Group(); g.position.set(18, 0, 36); scene.add(g);
    g.add(cyl(0.1, 0.14, 7, 6, M.white, 0, 3.5, 0));
    const f = canvasTex(128, 80, (c, w, h) => {
      c.fillStyle = P.ice; c.fillRect(0, 0, w, h); c.fillStyle = P.void;
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = rad(60 * i - 90); c[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * 25, 43 + Math.sin(a) * 25); } c.closePath(); c.fill();
      c.beginPath(); c.arc(64, 9, 4.5, 0, 6.3); c.fill();
      c.fillStyle = P.ice; c.fillRect(54, 36, 5, 14); c.fillRect(69, 36, 5, 14);
    });
    const fm = mesh(new T.PlaneGeometry(3.4, 2.1, 8, 1), new T.MeshBasicMaterial({ map: f.tex, side: T.DoubleSide }), 1.8, 5.8, 0, false); g.add(fm);
    const base = fm.geometry.attributes.position.array.slice();
    anim.push(t => { const p = fm.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = base[i * 3]; p.setZ(i, Math.sin(x * 2.2 - t * 3) * 0.16 * (x + 1.7)); } p.needsUpdate = true; });
  }

  // ---------- Inbox ----------
  {
    const g = station('inbox'), sky = std(C.sky);
    for (let i = 0; i < 3; i++) { const a = rad(90 + i * 120); g.add(cyl(0.2, 0.26, 9.4, 6, M.metal, Math.cos(a) * 4.7, 5.2, Math.sin(a) * 4.7)); }
    const hoop = torus(4.7, 0.42, 6, 6, M.white, 0, 9.8, 0); hoop.rotation.x = Math.PI / 2; hoop.rotation.z = Math.PI / 6; g.add(hoop);
    const inner = torus(3.3, 0.08, 6, 36, lit(C.ice), 0, 9.8, 0, false); inner.rotation.x = Math.PI / 2; g.add(inner);
    const beam = mesh(new T.CylinderGeometry(3.1, 3.5, 9, 20, 1, true), add(C.sky, 0.07), 0, 5.2, 0, false); g.add(beam);
    g.add(cyl(0.14, 0.14, 2.6, 6, M.dark, 5.4, 2, 3.2)); g.add(box(1.7, 1.15, 1.15, M.white, 5.4, 3.7, 3.2)); g.add(box(0.14, 0.95, 0.55, M.accent, 6.35, 4.2, 3.2));
    anim.push(t => { inner.rotation.z = t * 0.8; inner.position.y = 9.8 + Math.sin(t * 1.4) * 0.25; beam.material.opacity = 0.05 + 0.03 * Math.sin(t * 2); });
    W.top.inbox = 12.2;
    for (let i = 0; i < 6; i++) W.parcelSpots.push(new T.Vector3(STATIONS.inbox.x + ((i % 3) - 1) * 1.5, 1.2, STATIONS.inbox.z - 1.6 + Math.floor(i / 3) * 1.5));
  }

  // ---------- Briefing tower ----------
  {
    const g = station('beacon', 8.8);
    g.add(cyl(4.3, 5.1, 2.3, 6, M.white, 0, 1.85, 0));
    g.add(cyl(1.75, 2.7, 12.5, 6, std(C.white, { roughness: 0.4, metalness: 0.1 }), 0, 9.2, 0));
    const deckRing = torus(3.5, 0.34, 6, 12, lit(C.accent), 0, 14.2, 0, false); deckRing.rotation.x = Math.PI / 2; g.add(deckRing);
    g.add(cyl(2.7, 2.2, 2.7, 6, M.navy, 0, 16.4, 0));
    g.add(cyl(2.74, 2.52, 0.8, 6, lit(C.accent), 0, 16.6, 0, false));
    g.add(cone(3.2, 2.2, 6, M.navy, 0, 18.85, 0));
    g.add(cyl(0.11, 0.11, 5, 5, M.metal, 0, 22.4, 0));
    const bulb = ball(0.7, lit(C.accent), 0, 25.1, 0, false), bg = sprite(C.accent, 15, 0.8); bg.position.y = 25.1; g.add(bulb, bg);
    const beam = mesh(new T.CylinderGeometry(0.35, 1.1, 70, 12, 1, true), add(C.accent, 0.12), 0, 60, 0, false); g.add(beam);
    const glow = new T.PointLight(col(C.accent), 0.55, 60, 1.6); glow.position.set(0, 12, 0); g.add(glow);
    const dish = new T.Group(); dish.position.y = 21.2; g.add(dish);
    const d1 = mesh(new T.SphereGeometry(1.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), std(C.white, { side: T.DoubleSide }), 1.9, 0, 0); d1.rotation.z = -Math.PI / 2 - 0.5; dish.add(d1);
    dish.add(box(1.9, 0.14, 0.14, M.metal, 0.95, 0, 0));
    const h1 = flat(mesh(new T.RingGeometry(5.6, 5.8, 48), add(C.accent, 0.5), 0, 6.5, 0, false)), h2 = flat(mesh(new T.RingGeometry(4.6, 4.74, 48), add(C.accent, 0.35), 0, 10, 0, false)); g.add(h1, h2);
    for (let i = 0; i < 6; i++) { const a = rad(i * 60 + 30), y = 5 + i * 1.25; const w = box(0.5, 0.7, 0.14, lit(C.accent), Math.cos(a) * 2.25, y, Math.sin(a) * 2.25, false); w.rotation.y = -a + Math.PI / 2; g.add(w); }
    anim.push((t, dt, ctx) => {
      dish.rotation.y = t * 0.7; h1.rotation.z = t * 0.3; h2.rotation.z = -t * 0.45;
      const busy = ctx.busy.beacon ? 1 : 0.5; h1.material.opacity = 0.25 + 0.3 * busy; bg.material.opacity = 0.6 + 0.3 * Math.sin(t * 2.4); beam.material.opacity = 0.08 + 0.035 * Math.sin(t * 2.4);
    });
    W.top.beacon = 27.5;
  }

  // ---------- Library ----------
  {
    const g = station('library'), spine = [C.accent, C.ice, C.metal, C.sky, C.lilac, C.blue].map((c, i) => i ? std(c, { roughness: 0.5 }) : glowing(c, 0.45));
    for (let i = 0; i < 5; i++) {
      const a = rad(200 + i * 35), h = 5 + ((i * 7) % 4) * 1.3, x = Math.cos(a) * 4.5, z = Math.sin(a) * 4.5;
      const sh = new T.Group(); sh.position.set(x, 0.7, z); sh.rotation.y = -a + Math.PI / 2 + Math.PI; g.add(sh);
      sh.add(box(2.5, h, 1.3, std('#232836', { roughness: 0.6 }), 0, h / 2, 0));
      for (let r = 0; r < Math.floor(h / 1.35); r++) for (let b = 0; b < 4; b++)
        sh.add(box(0.42, 0.95, 0.2, spine[(i + r * 2 + b) % 6], -0.78 + b * 0.52, 0.75 + r * 1.35, 0.66, false));
    }
    const book = new T.Group(); book.position.set(0, 6.8, 0.6); g.add(book);
    const pg = new T.PlaneGeometry(1.7, 2.2), pm = new T.MeshBasicMaterial({ color: col(C.ice), side: T.DoubleSide });
    const l = mesh(pg, pm, -0.82, 0, 0, false), r = mesh(pg, pm, 0.82, 0, 0, false); l.rotation.y = 0.35; r.rotation.y = -0.35; book.add(l, r);
    const gs = sprite(C.lilac, 9, 0.55); book.add(gs); book.rotation.x = -0.5;
    const pages = [];
    for (let i = 0; i < 4; i++) { const p = mesh(new T.PlaneGeometry(0.7, 0.9), add('#E3E9F8', 0.6), 0, 0, 0, false); g.add(p); pages.push(p); }
    anim.push((t, dt, ctx) => {
      book.position.y = 6.8 + Math.sin(t * 1.3) * 0.3; book.rotation.y = Math.sin(t * 0.5) * 0.4;
      const sp = ctx.busy.library ? 1.6 : 0.5;
      pages.forEach((p, i) => { const a = t * sp + i * 1.57; p.position.set(Math.cos(a) * 2.6, 5.6 + Math.sin(t * 2 + i) * 0.5 + i * 0.3, Math.sin(a) * 2.6 + 0.6); p.rotation.y = -a; });
    });
    W.top.library = 10.2;
  }

  // ---------- Workshop ----------
  {
    const g = station('workshop');
    g.add(box(5.6, 0.45, 2.3, M.white, 0, 2.5, -1));
    [[-2.5, -1.9], [2.5, -1.9], [-2.5, -0.1], [2.5, -0.1]].forEach(p => g.add(box(0.3, 1.6, 0.3, M.dark, p[0], 1.5, p[1])));
    g.add(box(0.5, 6, 0.5, M.dark, -2.7, 3.7, -3.4));
    const gear = (R, c, x, y, teeth) => {
      const gg = new T.Group(); gg.position.set(x, y, -3); g.add(gg);
      const body = cyl(R, R, 0.55, 14, std(c), 0, 0, 0); body.rotation.x = Math.PI / 2; gg.add(body);
      for (let i = 0; i < teeth; i++) { const a = i / teeth * 6.283, tt = box(0.6, 0.6, 0.55, std(c), Math.cos(a) * (R + 0.15), Math.sin(a) * (R + 0.15), 0); tt.rotation.z = a; gg.add(tt); }
      const hub = cyl(R * 0.3, R * 0.3, 0.7, 8, M.dark, 0, 0, 0); hub.rotation.x = Math.PI / 2; gg.add(hub);
      return gg;
    };
    const g1 = gear(1.9, C.white, -2.7, 6.6, 9), g2 = gear(1.15, C.metal, 0.25, 7.55, 6);
    g.add(cyl(0.18, 0.22, 7.4, 6, M.metal, 3.6, 4.4, -3.2));
    const boom = box(4.6, 0.26, 0.26, M.metal, 1.5, 8, -3.2); g.add(boom);
    const hook = new T.Group(); hook.position.set(-0.4, 8, -3.2); g.add(hook);
    hook.add(box(0.06, 1.6, 0.06, M.dark, 0, -0.8, 0, false), box(0.9, 0.9, 0.9, std('#474F63'), 0, -2, 0));
    // the bench screen shows the work being made
    const scr = canvasTex(320, 200);
    const screen = mesh(new T.PlaneGeometry(4.3, 2.7), new T.MeshBasicMaterial({ map: scr.tex, transparent: true, opacity: 0.94, side: T.DoubleSide }), 0, 4.75, -0.9, false);
    screen.rotation.x = -0.16; g.add(screen);
    const sg = sprite(C.accent, 9, 0.22); sg.position.set(0, 4.7, -1); g.add(sg);
    const sparks = new T.Points(new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(36), 3)), new T.PointsMaterial({ color: col('#FFE2B8'), size: 4, sizeAttenuation: false, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
    sparks.position.set(0, 2.9, -0.4); g.add(sparks);
    let last = -1, lastKey = '';
    anim.push((t, dt, ctx) => {
      const on = ctx.busy.workshop, sp = on ? 1.5 : 0.25;
      g1.rotation.z += dt * sp; g2.rotation.z -= dt * sp * (9 / 6);
      hook.position.y = 8 + Math.sin(t * 1.1) * 0.25; hook.rotation.z = Math.sin(t * 0.9) * 0.08;
      sparks.material.opacity = on ? 0.9 : 0;
      if (on) { const p = sparks.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, (Math.sin(t * 9 + i * 2.1) * 0.5 + (i % 4 - 1.5)) * 0.8, Math.abs(Math.sin(t * 7 + i * 1.3)) * 1.3, Math.cos(t * 8 + i) * 0.5); p.needsUpdate = true; }
      const tick = Math.floor(t * 7), key = on ? on.id : '';
      if (tick !== last || key !== lastKey) { last = tick; lastKey = key; drawScreen(scr, on, tick); }
    });
    W.top.workshop = 11.2;
  }
  function drawScreen(scr, task, tick) {
    const c = scr.g; c.clearRect(0, 0, 320, 200);
    c.fillStyle = 'rgba(5,7,15,.94)'; rr(c, 4, 4, 312, 192, 10); c.fill();
    c.strokeStyle = task ? P.accent : 'rgba(234,241,255,.25)'; c.lineWidth = 3; rr(c, 4, 4, 312, 192, 10); c.stroke();
    c.font = '600 17px "JetBrains Mono", monospace'; c.fillStyle = task ? P.accent : 'rgba(234,241,255,.45)';
    c.fillText(task ? task.id + '  IN PROGRESS' : 'BENCH FREE', 20, 34);
    if (!task) { c.fillStyle = 'rgba(234,241,255,.16)'; for (let i = 0; i < 4; i++) rr(c, 20, 56 + i * 30, 180 + (i % 2) * 70, 12, 6), c.fill(); scr.tex.needsUpdate = true; return; }
    c.font = '600 19px "Geist", system-ui, sans-serif'; c.fillStyle = P.ice;
    const title = task.title.length > 27 ? task.title.slice(0, 26) + '...' : task.title; c.fillText(title, 20, 66);
    const n = tick % 28, widths = [250, 210, 268, 150];
    c.fillStyle = 'rgba(234,241,255,.7)';
    for (let i = 0; i < 4; i++) { const w = clamp((n - i * 6) / 6, 0, 1) * widths[i]; if (w > 0) { rr(c, 20, 90 + i * 25, w, 11, 5); c.fill(); } }
    if (tick % 2) { const i = Math.min(3, Math.floor(n / 6)), w = clamp((n - i * 6) / 6, 0, 1) * widths[i]; c.fillStyle = P.accent; c.fillRect(24 + w, 87 + i * 25, 9, 17); }
    scr.tex.needsUpdate = true;
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ---------- Checkpoint ----------
  {
    const g = station('check');
    g.add(box(0.85, 8.2, 0.85, M.white, -3.9, 4.8, 0), box(0.85, 8.2, 0.85, M.white, 3.9, 4.8, 0), box(9.2, 0.95, 1.15, M.white, 0, 9.3, 0));
    const bar = box(6.8, 0.16, 0.16, lit(C.accent), 0, 4, 0, false), sheet = mesh(new T.PlaneGeometry(6.9, 7.4), add(C.accent, 0.05), 0, 5.1, 0, false); g.add(bar, sheet);
    const sign = new T.Group(); sign.position.set(0, 11.4, 0); g.add(sign);
    const disc = cyl(1.55, 1.55, 0.35, 18, M.navy, 0, 0, 0); disc.rotation.x = Math.PI / 2; sign.add(disc);
    const okM = lit(C.ice), noM = lit(C.red);
    const mk = (m, w, x, y, rz, z) => { const b = box(w, 0.3, 0.12, m, x, y, z, false); b.rotation.z = rz; return b; };
    const ok = new T.Group(), no = new T.Group(); sign.add(ok, no);
    for (const z of [0.2, -0.2]) { ok.add(mk(okM, 0.8, -0.42, -0.2, -0.8, z), mk(okM, 1.45, 0.3, 0.08, 0.9, z)); no.add(mk(noM, 1.6, 0, 0, 0.78, z), mk(noM, 1.6, 0, 0, -0.78, z)); }
    no.visible = false; W.checkFlash = 0;
    anim.push((t, dt, ctx) => {
      const on = ctx.busy.check; bar.position.y = on ? 1.6 + (Math.sin(t * 5) * 0.5 + 0.5) * 6.4 : 8.5; sheet.material.opacity = on ? 0.1 : 0.03;
      W.checkFlash = Math.max(0, W.checkFlash - dt); no.visible = W.checkFlash > 0; ok.visible = !no.visible; sign.rotation.y = Math.sin(t * 0.6) * 0.25;
    });
    W.top.check = 13.4;
  }

  // ---------- The Gate ----------
  {
    const g = station('gate'), G = STATIONS.gate, L = STATIONS.launch;
    const ex = new T.Vector3(L.x - G.x, 0, L.z - G.z).normalize(); W.gateDir = ex;
    const inner = new T.Group(); inner.rotation.y = Math.atan2(-ex.z, ex.x); g.add(inner);
    inner.add(cyl(0.5, 0.6, 3.4, 8, M.white, 3.3, 2.4, -4.3), cyl(0.35, 0.45, 2.4, 8, M.white, 3.3, 1.9, 4.3), box(0.9, 0.3, 0.5, M.dark, 3.3, 3.1, 4.3));
    const arm = new T.Group(); arm.position.set(3.3, 3.3, -4.3); inner.add(arm);
    for (let i = 0; i < 8; i++) arm.add(box(0.44, 0.44, 8.5 / 8, i % 2 ? M.navy : M.amber, 0, 0, (i + 0.5) * 8.5 / 8));
    const lampM = lit(C.amber), lampB = ball(0.48, lampM, 3.3, 4.4, -4.3, false), lampS = sprite(C.amber, 9, 0.8); lampS.position.set(3.3, 4.4, -4.3); inner.add(lampB, lampS);
    // the booth where the person sits
    const booth = new T.Group(); booth.position.set(1.2, 0.7, -7.2); inner.add(booth);
    booth.add(box(2.8, 3, 2.6, M.white, 0, 1.5, 0), box(3.4, 0.4, 3.2, M.navy, 0, 3.2, 0), box(1.7, 1.1, 0.1, lit('#FFD27A'), 0, 1.9, 1.32, false), box(0.1, 1.1, 1.5, lit('#FFD27A'), 1.42, 1.9, 0, false));
    booth.add(cyl(0.07, 0.07, 2.6, 5, M.dark, -1.2, 4.7, 0));
    const sign = (c, w, h) => { c.fillStyle = P.amber; c.fillRect(0, 0, w, h); c.fillStyle = P.void; c.font = '700 34px ' + DISPLAY; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('YOU DECIDE', w / 2, h / 2 + 2); };
    const fl = canvasTex(256, 96, sign); W.refresh.push(() => { sign(fl.g, 256, 96); fl.tex.needsUpdate = true; });
    const sm = new T.MeshBasicMaterial({ map: fl.tex });
    const s1 = mesh(new T.PlaneGeometry(3.2, 1.2), sm, 0.5, 5.3, 0.03, false), s2 = mesh(new T.PlaneGeometry(3.2, 1.2), sm, 0.5, 5.3, -0.03, false); s2.rotation.y = Math.PI;
    const signG = new T.Group(); signG.add(s1, s2); booth.add(signG); W.signs = [signG];
    W.gateOpen = 0; let open = 0;
    anim.push((t, dt, ctx) => {
      W.gateOpen = Math.max(0, W.gateOpen - dt); const target = W.gateOpen > 0 ? 1 : 0; open += (target - open) * Math.min(1, dt * 7);
      arm.rotation.x = -open * 1.32;
      const wait = ctx.waiting > 0, c = open > 0.3 ? C.ice : C.amber; lampM.color.copy(col(c)); lampS.material.color.copy(col(c));
      lampS.material.opacity = wait || open > 0.3 ? 0.55 + 0.45 * Math.sin(t * 7) : 0.35; lampS.scale.setScalar(wait ? 11 + Math.sin(t * 7) * 2.5 : 8);
    });
    W.top.gate = 9.2;
  }

  // ---------- Launchpad ----------
  {
    const g = station('launch');
    g.add(cyl(2.1, 2.7, 1.3, 6, M.dark, 0, 1.35, 0));
    const rail = new T.Group(); rail.position.set(0, 1.9, 0); rail.rotation.x = 0.32; g.add(rail);
    rail.add(box(0.5, 12.5, 0.5, M.white, 0, 6.25, 0));
    const hoops = [4, 7.6, 11.2].map((y, i) => { const h = torus(1.55, 0.1, 6, 24, lit(C.ice), 0, y, 0, false); h.rotation.x = Math.PI / 2; rail.add(h); return h; });
    g.add(cyl(0.08, 0.08, 5, 5, M.metal, 4.6, 3.2, -2.4));
    const sock = cone(0.5, 2, 8, glowing(C.accent, 0.4), 5.6, 5.5, -2.4); sock.rotation.z = Math.PI / 2; g.add(sock);
    W.launchDir = new T.Vector3(0, Math.cos(0.32), Math.sin(0.32)); W.launchFrom = new T.Vector3(STATIONS.launch.x, 3, STATIONS.launch.z); W.launchPulse = 0;
    anim.push((t, dt) => { W.launchPulse = Math.max(0, W.launchPulse - dt * 1.4); hoops.forEach((h, i) => h.scale.setScalar(1 + clamp(W.launchPulse - i * 0.12, 0, 1) * 0.5)); sock.rotation.y = Math.sin(t * 1.4) * 0.25; });
    W.top.launch = 15;
  }

  // ---------- Charging Dock ----------
  {
    const g = station('dock', 11); W.dockRings = [];
    for (let i = 0; i < 8; i++) {
      const x = -6.15 + (i % 4) * 4.1, z = i < 4 ? -2.3 : 2.6;
      g.add(cyl(1.7, 1.9, 0.3, 14, M.navy, x, 0.85, z));
      const r = torus(1.42, 0.06, 6, 28, lit(C.blue), x, 1.02, z, false); r.rotation.x = Math.PI / 2; g.add(r); W.dockRings.push(r);
    }
    g.add(box(0.8, 5.4, 0.8, M.dark, 0, 3.4, -6.6));
    const bolt = canvasTex(64, 96, (c) => { c.fillStyle = P.accent; c.beginPath(); c.moveTo(38, 4); c.lineTo(10, 54); c.lineTo(30, 54); c.lineTo(24, 92); c.lineTo(54, 38); c.lineTo(34, 38); c.closePath(); c.fill(); });
    g.add(mesh(new T.PlaneGeometry(1.5, 2.2), new T.MeshBasicMaterial({ map: bolt.tex, transparent: true, side: T.DoubleSide }), 0, 6.2, -6.15, false));
    const s = sprite(C.accent, 6, 0.3); s.position.set(0, 6.2, -6.1); g.add(s);
    W.top.dock = 8.6;
  }

  // ---------- The Vault ----------
  {
    const g = new T.Group(); g.position.set(V.x, 0, V.z); scene.add(g);
    const dome = mesh(new T.SphereGeometry(4.8, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), std('#2B1A20', { roughness: 0.5, metalness: 0.3 }), 0, 0, 0); g.add(dome);
    const to = new T.Vector3(STATIONS.workshop.x - V.x, 0, STATIONS.workshop.z - V.z).normalize(); W.vaultDir = to;
    const door = new T.Group(); door.position.set(to.x * 4.3, 1.9, to.z * 4.3); door.rotation.y = Math.atan2(to.x, to.z); g.add(door);
    const d = cyl(1.75, 1.75, 0.5, 14, M.metal, 0, 0, 0); d.rotation.x = Math.PI / 2; door.add(d);
    const wheel = torus(0.95, 0.13, 6, 14, lit(C.red), 0, 0, 0.32, false); door.add(wheel);
    for (let i = 0; i < 3; i++) { const b = box(1.9, 0.12, 0.12, lit(C.red), 0, 0, 0.32, false); b.rotation.z = i * Math.PI / 3; wheel.add(b); }
    const alarm = ball(0.5, lit(C.red), 0, 5.2, 0, false), as = sprite(C.red, 10, 0.5); as.position.y = 5.2; g.add(alarm, as);
    const lasers = [];
    for (let i = 0; i < 6; i++) {
      const a0 = rad(i * 60), a1 = rad(i * 60 + 60), R = 7.5, x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
      g.add(cyl(0.16, 0.2, 2.6, 6, M.dark, x0, 1.3, z0));
      const mid = new T.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2), gap = mid.clone().normalize().dot(to) > 0.8;
      if (gap) continue;
      for (const y of [1.1, 2]) { const l = box(R, 0.07, 0.07, lit(C.red, { transparent: true, opacity: 0.8 }), mid.x, y, mid.z, false); l.rotation.y = -Math.atan2(z1 - z0, x1 - x0); g.add(l); lasers.push(l); }
    }
    anim.push((t, dt, ctx) => {
      const hot = ctx.incidents > 0; wheel.rotation.z = hot ? t * 3 : Math.sin(t * 0.4) * 0.3;
      as.material.opacity = hot ? 0.5 + 0.5 * Math.sin(t * 10) : 0.3 + 0.1 * Math.sin(t * 1.5); as.scale.setScalar(hot ? 16 : 9);
      lasers.forEach((l, i) => { l.material.opacity = 0.55 + 0.35 * Math.sin(t * (hot ? 14 : 3) + i); });
    });
    W.top.vault = 8.6;
  }

  // ---------- where a bot stands at each station ----------
  const at = (id, dx, dz) => new T.Vector3(STATIONS[id].x + dx, 0, STATIONS[id].z + dz);
  const ringSlots = (id, R, degs) => degs.map(d => at(id, Math.cos(rad(d)) * R, Math.sin(rad(d)) * R));
  const gx = W.gateDir, vd = W.vaultDir, vp = new T.Vector3(-vd.z, 0, vd.x);
  W.slots = {
    inbox: ringSlots('inbox', 4.2, [45, 125, -35, 200]),
    beacon: ringSlots('beacon', 7.6, [70, 15, 125, 175, -35]),
    library: ringSlots('library', 4, [60, 130, -5, 180]),
    workshop: [at('workshop', -2, 2.8), at('workshop', 2.2, 3), at('workshop', -5, 4.4), at('workshop', 5.2, 4.6)],
    check: [at('check', 0, 0.3), at('check', 0, 4.8), at('check', 3.6, 5.2), at('check', -3.6, 5.2)],
    gate: [0, 1, 2, 3, 4].map(k => at('gate', gx.x * (0.2 - 3.8 * k), gx.z * (0.2 - 3.8 * k))),
    launch: [at('launch', 3.4, -1.6), at('launch', -3.4, -1.6), at('launch', 4.2, 2.4), at('launch', -4.2, 2.4)],
    dock: [0, 1, 2, 3, 4, 5, 6, 7].map(i => at('dock', -6.15 + (i % 4) * 4.1, i < 4 ? -2.3 : 2.6)),
    vault: [0, 1, 2].map(k => at('vault', vd.x * 9.4 + vp.x * [0, 3.8, -3.8][k], vd.z * 9.4 + vp.z * [0, 3.8, -3.8][k])),
  };
  W.slot = (id, k) => { const a = W.slots[id]; return a[Math.min(k, a.length - 1)]; };
  W.center = id => at(id, 0, 0);

  W.update = (t, dt, ctx) => { for (const f of anim) f(t, dt, ctx); };
  return W;
}
