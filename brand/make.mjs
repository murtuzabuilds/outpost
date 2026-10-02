// Generates the Outpost mark and wordmark as SVG strings (single source for every place they appear).
import fs from 'node:fs';
const f = n => +n.toFixed(2);
const hex = (cx, cy, R) => Array.from({length:6},(_,i)=>{const a=Math.PI/180*(60*i-90);return [f(cx+R*Math.cos(a)),f(cy+R*Math.sin(a))];});
const poly = p => 'M'+p.map(q=>q.join(' ')).join('L')+'Z';
// The filled mark, for small sizes such as the favicon.
export function mark(ion='#6F86FF', dark='#05060A'){ // 64 box
  const h = hex(32,38.5,21.5);
  return { vb:'0 0 64 64', body:`<circle cx="32" cy="6.6" r="4.1" fill="${ion}"/><path d="${poly(h)}" fill="${ion}" stroke="${ion}" stroke-width="3" stroke-linejoin="round"/><g class="eyes" fill="${dark}"><rect x="23.2" y="32.4" width="5.2" height="12.2" rx="2.6"/><rect x="35.6" y="32.4" width="5.2" height="12.2" rx="2.6"/></g>` };
}
export function wordmark(acc='#6F86FF', ink='#EEF2FA', w=3.4){
  const H=40, i=w/2, gap=15, ch=8; let x=0; const S=[], st=d=>S.push(d);
  const W0=f(20*Math.sqrt(3)), Rp=f((W0/2-i)/Math.cos(Math.PI/6));
  // O as the mark: a hexagon with two eyes, under a beacon
  let cx=x+W0/2; const mk=`<circle cx="${f(cx)}" cy="-8.6" r="${f(w*0.82)}" fill="${acc}"/><path d="${poly(hex(cx,20,Rp))}" fill="none" stroke="${acc}" stroke-width="${w}" stroke-linejoin="miter"/><g class="eyes" fill="${acc}"><rect x="${f(cx-5.4-w/2)}" y="15" width="${w}" height="10" rx="${f(w/2)}"/><rect x="${f(cx+5.4-w/2)}" y="15" width="${w}" height="10" rx="${f(w/2)}"/></g>`;
  x+=W0+gap;
  let W=28, a=x+i, b=x+W-i; st(`M${f(a)} 0V${H-i-ch}L${f(a+ch)} ${H-i}H${f(b-ch)}L${f(b)} ${H-i-ch}V0`); x+=W+gap;
  W=28; st(`M${f(x)} ${i}H${f(x+W)}M${f(x+W/2)} ${i}V${H}`); x+=W+gap-1;
  W=26; a=x+i; b=x+W-i; st(`M${f(a)} ${H}V${i}H${f(b-ch)}L${f(b)} ${i+ch}V${f(H*0.6-ch+i-2)}L${f(b-ch)} ${f(H*0.6+i-2)}H${f(a)}`); x+=W+gap;
  cx=x+W0/2; st(poly(hex(cx,20,Rp))); x+=W0+gap;
  W=26; a=x+i; b=x+W-i; const m=H/2, c=7; st(`M${f(x+W)} ${i}H${f(a+c)}L${f(a)} ${i+c}V${m-c}L${f(a+c)} ${m}H${f(b-c)}L${f(b)} ${m+c}V${H-i-c}L${f(b-c)} ${H-i}H${f(x)}`); x+=W+gap-1;
  W=28; st(`M${f(x)} ${i}H${f(x+W)}M${f(x+W/2)} ${i}V${H}`); x+=W;
  return { vb:`0 -13 ${f(x)} 53`, w:f(x), body:mk+`<path d="${S.join('')}" fill="none" stroke="${ink}" stroke-width="${w}" stroke-linejoin="miter" stroke-miterlimit="6"/>` };
}
export function markLine(acc='#6F86FF', w=3.2){ const R=f((21-w/2)); return { vb:'0 0 64 64', body:`<circle cx="32" cy="6.4" r="${f(w*0.95)}" fill="${acc}"/><path d="${poly(hex(32,39,R))}" fill="none" stroke="${acc}" stroke-width="${w}"/><g class="eyes" fill="${acc}"><rect x="${f(26-w/2)}" y="33.4" width="${w}" height="11.2" rx="${f(w/2)}"/><rect x="${f(38-w/2)}" y="33.4" width="${w}" height="11.2" rx="${f(w/2)}"/></g>` }; }
if (process.argv[1] && process.argv[1].endsWith('make.mjs')) {
  // node brand/make.mjs  → rewrites the SVG files in this folder
  const svg = (o, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${o.vb}" ${extra}>${o.body}</svg>\n`;
  const here = new URL('.', import.meta.url).pathname;
  fs.writeFileSync(here + 'outpost-wordmark.svg', svg(wordmark('#6F86FF', '#EEF2FA'), 'role="img" aria-label="Outpost"'));
  fs.writeFileSync(here + 'outpost-wordmark-dark.svg', svg(wordmark('#3455FA', '#0E0E10'), 'role="img" aria-label="Outpost"'));
  fs.writeFileSync(here + 'outpost-mark.svg', svg(markLine('#6F86FF'), 'role="img" aria-label="Outpost mark: a hexagon bot under a beacon"'));
}
