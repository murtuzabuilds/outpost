// The Autonomy lab: try a different authority table on replayed work before it touches the crew.
//
// A trial runs a number of simulated shifts headlessly. Two tables tested with the same seeds get the
// same crew and the same starting work, so the difference between them is the table. The question it
// answers is an operations one: how much can this crew do alone, and how much of a person does it need?
// Everything here is synthetic; it shows how a set of rules behaves, not how a real company would perform.
import { createSim } from './sim.js';
import { makeAuthority, authorityId } from './authority.js';

// One shift. `answer` is how many seconds a person takes to respond to a bot at the Gate or the Vault
// (0 = at once, Infinity = nobody is there). The stand-in person approves requests and keeps bots out
// of the Vault.
export function runShift(seed, authority, opts = {}) {
  const seconds = opts.seconds || 600, answer = opts.answer ?? 0, sim = createSim(seed, { authority, kinds: opts.kinds });
  for (let i = 0; i < seconds * 10; i++) {
    sim.step(0.1);
    const s = sim.state;
    if (answer === Infinity) continue;
    for (const id of s.approvals.slice()) { const a = s.agents.find(x => x.id === id); if (s.t - a.waitFrom >= answer) sim.approve(id); }
    for (const inc of s.incidents.slice()) if (s.t - inc.t >= answer) sim.resolve(inc.id, 'deny');
  }
  const s = sim.state, st = s.stats;
  let lost = st.waited;
  for (const id of s.approvals) lost += s.t - s.agents.find(a => a.id === id).waitFrom;
  for (const inc of s.incidents) lost += s.t - inc.t;
  return {
    lost,
    shipped: st.shipped, asked: st.asked, stops: sim.ledger.filter(e => e.outcome === 'stop').length,
    alone: st.alone, signed: st.signed, waited: st.waited, answered: st.answered,
    promotions: s.log.filter(l => l.kind === 'level').length, waiting: s.approvals.length + s.incidents.length,
  };
}

const KEYS = ['lost', 'shipped', 'asked', 'stops', 'alone', 'signed', 'waited', 'answered', 'promotions', 'waiting'];

// Averages over `shifts` shifts, seeds 1..shifts. `share` is the part of shipped work that needed a person.
export function summarize(rows) {
  const n = rows.length, sum = Object.fromEntries(KEYS.map(k => [k, rows.reduce((t, r) => t + r[k], 0)]));
  return {
    shifts: n, shipped: sum.shipped / n, asked: sum.asked / n, stops: sum.stops / n, alone: sum.alone / n, signed: sum.signed / n,
    promotions: sum.promotions / n, waiting: sum.waiting / n, lost: sum.lost / n,
    share: sum.shipped ? sum.asked / sum.shipped : 0, wait: sum.answered ? sum.waited / sum.answered : 0,
  };
}

export function trial(authority, opts = {}) {
  const p = makeAuthority(authority), shifts = opts.shifts || 20, rows = [];
  for (let seed = 1; seed <= shifts; seed++) rows.push(runShift(seed, p, opts));
  return { authority: authorityId(p), ...summarize(rows) };
}

// The same trial for the browser: it yields between shifts so the page stays responsive, and
// reports progress from 0 to 1.
export async function trialAsync(authority, opts = {}, onProgress) {
  const p = makeAuthority(authority), shifts = opts.shifts || 20, rows = [];
  for (let seed = 1; seed <= shifts; seed++) {
    rows.push(runShift(seed, p, opts));
    if (seed % 4 && seed !== shifts) continue;                 // hand the page back every four shifts
    if (onProgress) onProgress(seed / shifts);
    await new Promise(r => setTimeout(r, 0));
  }
  return { authority: authorityId(p), ...summarize(rows) };
}
