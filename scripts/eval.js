// Runs the experiments the case study quotes. Everything here is synthetic: the tasks, the bots and
// the company are made up. Twenty simulated ten-minute shifts per row, same seeds for every row.
import { trial, DEFAULT_AUTHORITY, makeAuthority } from '../src/index.js';

const f1 = n => n.toFixed(1), usd = n => '$' + Math.round(n).toLocaleString('en-US'), pct = n => Math.round(n * 100) + '%';
const row = r => ({ 'Shipped per shift': f1(r.shipped), 'Asked a person': f1(r.asked), 'Share': pct(r.share), 'Crew min lost waiting': f1(r.lost / 60), 'Stopped at the Vault': f1(r.stops), 'Moved alone': usd(r.alone), 'Moved with a yes': usd(r.signed) });

console.log('\n1. How fast does a person have to answer? (default limits)');
const delays = [[0, 'At once'], [15, 'Within 15 seconds'], [60, 'Within a minute'], [180, 'Within three minutes'], [Infinity, 'Nobody answering']];
console.table(Object.fromEntries(delays.map(([d, label]) => { const r = trial(DEFAULT_AUTHORITY, { answer: d }); return [label, { ...row(r), 'Left waiting': f1(r.waiting) }]; })));

console.log('2. What does loosening or tightening the money limits buy? (a person answers within 15 seconds)');
const P = (t, a, extra = {}) => makeAuthority({ levels: [{ limit: 0 }, { limit: t }, { limit: a }], ...extra });
const authorities = [['Tight: $0 / $100 / $250', P(100, 250)], ['Default: $0 / $200 / $500', DEFAULT_AUTHORITY], ['Loose: $0 / $400 / $1,000', P(400, 1000)], ['No money rule at all', P(200, 500, { rules: { money: false } })]];
console.table(Object.fromEntries(authorities.map(([label, p]) => [label, row(trial(p, { answer: 15 }))])));

console.log('3. How quickly should trust be earned? (a person answers within 15 seconds)');
const L = (t, a) => makeAuthority({ levels: [{}, { min: t }, { min: a }] });
const ladders = [['Slow: Trusted at 6, Autonomous at 16', L(6, 16)], ['Default: 3 and 8', DEFAULT_AUTHORITY], ['Fast: 1 and 3', L(1, 3)]];
console.table(Object.fromEntries(ladders.map(([label, p]) => { const r = trial(p, { answer: 15 }); return [label, { ...row(r), 'Promotions': f1(r.promotions) }]; })));
