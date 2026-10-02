// Runs 20 simulated ten-minute shifts and reports how often a person was needed.
// Everything here is synthetic: the tasks, the bots and the company are made up.
import { createSim } from '../src/index.js';

const SHIFTS = 20, SECONDS = 600;
let shipped = 0, needed = 0, stops = 0, levels = 0;
for (let seed = 1; seed <= SHIFTS; seed++) {
  const sim = createSim(seed), seen = new Set();
  for (let i = 0; i < SECONDS * 10; i++) {
    sim.step(0.1);
    const s = sim.state;
    for (const id of s.approvals) { const a = s.agents.find(x => x.id === id); if (!seen.has(a.task)) { seen.add(a.task); needed++; } }
    if (s.approvals.length) sim.approve(s.approvals[0]);                                   // a person who answers at once
    if (s.incidents.length) { stops++; sim.resolve(s.incidents[0].id, 'deny'); }
  }
  shipped += sim.state.stats.shipped; levels += sim.state.log.filter(l => l.kind === 'level').length;
}
let alone = 0, waiting = 0;
for (let seed = 1; seed <= SHIFTS; seed++) {
  const sim = createSim(seed);
  for (let i = 0; i < SECONDS * 10; i++) sim.step(0.1);                                    // nobody answers
  alone += sim.state.stats.shipped; waiting += sim.state.approvals.length + sim.state.incidents.length;
}
const per = n => (n / SHIFTS).toFixed(1);
console.table({
  'Someone answering at once': { 'Shipped per shift': per(shipped), 'Needed a person': per(needed), 'Share': (needed / shipped * 100).toFixed(0) + '%', 'Stopped at the Vault': per(stops), 'Promotions': per(levels) },
  'Nobody answering':          { 'Shipped per shift': per(alone), 'Needed a person': per(waiting) + ' still waiting', 'Share': '', 'Stopped at the Vault': '', 'Promotions': '' },
});
