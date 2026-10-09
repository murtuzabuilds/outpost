import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, traceOf, authorityId } from '../src/index.js';

const run = (sim, secs, dt = 0.1) => { for (let i = 0; i < secs / dt; i++) sim.step(dt); };

test('a trace is built from real records, in order, and every decision names its rule and table', () => {
  const sim = createSim(7);
  for (let i = 0; i < 1200; i++) { sim.step(0.1); for (const id of sim.state.approvals.slice()) sim.approve(id); for (const inc of sim.state.incidents.slice()) sim.resolve(inc.id, 'deny'); }
  const id = sim.state.agents.find(a => a.shipped > 0).id, tr = sim.trace(id, sim.state, 400);
  assert.ok(tr.length > 5);
  for (let i = 1; i < tr.length; i++) assert.ok(tr[i].o > tr[i - 1].o, 'strictly in the order things happened');
  const kinds = new Set(tr.map(x => x.kind));
  for (const k of ['take', 'plan', 'reach', 'tool', 'decide', 'pass', 'ship']) assert.ok(kinds.has(k), k);
  for (const d of tr.filter(x => x.kind === 'decide')) {
    assert.ok(['allow', 'hold', 'stop'].includes(d.outcome));
    assert.match(d.authority, /^a-[0-9a-f]{6}$/); assert.equal(d.authority, authorityId(sim.state.authority));
    assert.ok(d.rule);
  }
  // every decision in the trace is a ledger line for this bot, and none in the window is missing
  const first = tr[0].o, fromLedger = sim.ledger.filter(e => e.agent === id && e.by === 'rules' && e.o >= first);
  assert.deepEqual(tr.filter(x => x.kind === 'decide').map(x => x.o), fromLedger.map(e => e.o));
  const plan = tr.find(x => x.kind === 'plan');
  assert.match(plan.text, /^Planned the route for T-\d+: Inbox > Briefing/);
  assert.equal(tr.filter(x => x.kind === 'tool').every(x => /^At the Workshop, using [a-z]+\.[a-z]+$/.test(x.text)), true);
});

test('a person\'s answer appears once, from the ledger, with the rule it answered', () => {
  const sim = createSim(4, { auto: false });
  sim.dispatch('export'); run(sim, 30);
  const id = sim.state.approvals[0]; assert.ok(id);
  sim.approve(id); run(sim, 1);
  const tr = sim.trace(id);
  const said = tr.filter(x => x.kind === 'person');
  assert.equal(said.length, 1); assert.equal(said[0].outcome, 'approved'); assert.equal(said[0].rule, 'data-out');
  assert.ok(tr.some(x => x.kind === 'wait' && x.rule === 'data-out'));
  assert.ok(tr.some(x => x.kind === 'decide' && x.outcome === 'hold' && x.rule === 'data-out'));
});

test('a rewound view only shows what had happened by then', () => {
  const sim = createSim(7);
  run(sim, 20); const snap = sim.snapshot(); run(sim, 30);
  const id = 'pip', past = sim.trace(id, snap, 999), now = sim.trace(id, sim.state, 999);
  assert.ok(now.length > past.length);
  for (const x of past) assert.ok(x.t <= snap.t + 0.05);
  assert.deepEqual(traceOf(snap, [], [], 'nobody'), []);
});

test('the limit keeps the newest lines', () => {
  const sim = createSim(7); run(sim, 60);
  const all = sim.trace('pip', sim.state, 999), few = sim.trace('pip', sim.state, 5);
  assert.deepEqual(few, all.slice(-5));
});
