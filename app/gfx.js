// Small helpers over three.js so the scene code reads like a list of parts.
export const T = window.THREE;

export const col = h => new T.Color(h).convertSRGBToLinear();
export const std = (h, o = {}) => new T.MeshStandardMaterial({ color: col(h), roughness: 0.78, metalness: 0.04, flatShading: true, ...o });
export const lit = (h, o = {}) => new T.MeshBasicMaterial({ color: col(h), ...o });
export const add = (h, opacity = 0.5, o = {}) => new T.MeshBasicMaterial({ color: col(h), transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, ...o });

export function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = shadow; return m;
}
export const box = (w, h, d, mat, x, y, z, sh) => mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, sh);
export const cyl = (rt, rb, h, seg, mat, x, y, z, sh) => mesh(new T.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, sh);
export const ball = (r, mat, x, y, z, sh, ws = 10, hs = 8) => mesh(new T.SphereGeometry(r, ws, hs), mat, x, y, z, sh);
export const cone = (r, h, seg, mat, x, y, z, sh) => mesh(new T.ConeGeometry(r, h, seg), mat, x, y, z, sh);
export const torus = (r, tube, rs, ts, mat, x, y, z, sh) => mesh(new T.TorusGeometry(r, tube, rs, ts), mat, x, y, z, sh);
export const flat = m => { m.rotation.x = -Math.PI / 2; return m; };

let _glow;
export function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  _glow = new T.CanvasTexture(c); return _glow;
}
export function sprite(hex, size, opacity = 1) {
  const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color: col(hex), transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false }));
  s.scale.set(size, size, 1); return s;
}
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (draw) draw(g, w, h);
  const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
  return { tex: t, g, c };
}
export function seeded(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = t => t * t * (3 - 2 * t);
export const damp = (dt, k) => 1 - Math.exp(-dt * k);
