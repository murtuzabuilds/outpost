// Short-lived effects: sparks, rings on the ground, and parcels leaving the Launchpad.
import { T, col, mesh, lit, sprite, clamp } from './gfx.js';
import { makeParcel } from './bots.js';

export function makeFx(scene, reduce) {
  const parts = [], rings = [], shots = [];
  for (let i = 0; i < 90; i++) { const s = sprite('#ffffff', 1, 0); s.visible = false; scene.add(s); parts.push({ s, life: 0, max: 1, v: new T.Vector3(), g: 0, size: 1 }); }
  for (let i = 0; i < 10; i++) { const m = mesh(new T.RingGeometry(0.86, 1, 40), lit('#ffffff', { transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }), 0, 0, 0, false); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); rings.push({ m, life: 0, max: 1, r0: 1, r1: 4 }); }

  function spark(pos, c, v, life, size, g = 0) {
    const p = parts.find(x => x.life <= 0); if (!p) return;
    p.s.position.copy(pos); p.s.material.color.copy(col(c)); p.v.copy(v); p.life = p.max = life; p.size = size; p.g = g; p.s.visible = true;
  }
  function burst(pos, c, n = 14, speed = 6, life = 0.8, size = 1.6, g = 6) {
    if (reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, e = Math.random() * 1.2 - 0.2, s = speed * (0.5 + Math.random() * 0.7); spark(pos, c, new T.Vector3(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 2, Math.sin(a) * Math.cos(e) * s), life * (0.6 + Math.random() * 0.6), size, g); }
  }
  function ring(pos, c, r0 = 1, r1 = 5, life = 0.7, y = 0.82) {
    const r = rings.find(x => x.life <= 0); if (!r) return;
    r.m.position.set(pos.x, y, pos.z); r.m.material.color.copy(col(c)); r.life = r.max = life; r.r0 = r0; r.r1 = r1; r.m.visible = true;
  }
  function shoot(from, dir, c) {
    const p = makeParcel(); p.userData.tint(c); p.position.copy(from); scene.add(p);
    shots.push({ p, dir: dir.clone(), v: 6, life: 1.5, c });
  }
  function update(dt) {
    for (const p of parts) if (p.life > 0) {
      p.life -= dt; p.v.y -= p.g * dt; p.s.position.addScaledVector(p.v, dt);
      const k = clamp(p.life / p.max); p.s.material.opacity = k; p.s.scale.setScalar(p.size * (0.4 + k * 0.8));
      if (p.life <= 0) p.s.visible = false;
    }
    for (const r of rings) if (r.life > 0) {
      r.life -= dt; const k = 1 - clamp(r.life / r.max); r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))); r.m.material.opacity = (1 - k) * 0.9;
      if (r.life <= 0) r.m.visible = false;
    }
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]; s.life -= dt; s.v += 70 * dt; s.p.position.addScaledVector(s.dir, s.v * dt); s.p.rotation.y += dt * 9; s.p.rotation.x += dt * 5;
      if (Math.random() < 0.8) spark(s.p.position, s.c, new T.Vector3((Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2), 0.5, 2.2, 0);
      if (s.life <= 0) { burst(s.p.position, s.c, 26, 13, 1.1, 2.4, 9); burst(s.p.position, '#EAF1FF', 10, 8, 0.9, 1.6, 9); scene.remove(s.p); shots.splice(i, 1); }
    }
  }
  return { spark, burst, ring, shoot, update };
}
