// Outpost has to tell the same story as Umbra and the portfolio site. These tests pin the shared facts:
// the crew Umbra approved, the handoff of Agent 7f3 (Fern), the station glosses and the words the UI uses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CREW, KINDS, STATIONS, SAMPLE_AGENT, parseHandoff, toSpec, createSim, statusOf, verifyLedger,
} from '../src/index.js';

const run = (sim, secs, dt = 0.1) => { for (let i = 0; i < secs / dt; i++) sim.step(dt); };
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// The table every surface shares (bot, job, owner, team).
const CANON = [
  ['Pip', 'Claims intake', 'Rosa Chen', 'Claims'],
  ['Sable', 'Fraud screening', 'Dev Okoye', 'Claims'],
  ['Juno', 'Refunds and billing', 'Priya Patel', 'Finance'],
  ['Kite', 'Customer replies', 'Hana Lopez', 'Customer Care'],
  ['Bolt', 'Broker assist', 'Wren Hayes', 'Underwriting'],
  ['Moss', 'Month-end close', 'Omar Ito', 'Finance'],
  ['Dot', 'Scheduling', 'Mateo Diaz', 'Claims'],
  ['Rook', 'Records and reports', 'Lena Fischer', 'Data Science'],
];

// What Umbra sends when a person approves Agent 7f3: a Marketing agent with the two default permissions.
const FERN = {
  id: 'umb-unknown-7f3', name: 'Fern', job: 'Drafts emails to customers', owner: 'Hana Lopez', team: 'Marketing',
  tools: ['email.send', 'crm.read'], limit: 0, approvedAt: '2026-10-08T09:00:00Z', source: 'umbra', umbraName: 'Agent 7f3',
  rules: ['Customer emails only'],
};

test('the crew is exactly the eight agents Umbra approved, with the same jobs, owners and teams', () => {
  assert.deepEqual(CREW.map(c => [c.name, c.job, c.owner, c.team]), CANON);
});

test('a docked bot with email.send and crm.read is given customer email work and stops at the Gate for a yes', () => {
  const sim = createSim(21, { auto: false });
  const spec = toSpec(parseHandoff({ v: 1, agents: [FERN] }).agents[0]);
  assert.equal(spec.name, 'Fern'); assert.equal(spec.umbra.umbraName, 'Agent 7f3');
  sim.addAgent(spec, { arrive: 0.1 });
  run(sim, 0.5);
  // Kite is the only other bot that can send customer email. With Kite paused, the customer reply can only go to Fern.
  sim.pause('kite');
  const t = sim.dispatch('reply', { reach: false });
  run(sim, 0.2);
  assert.equal(t.assignee, FERN.id, 'the docked bot takes the customer email task');
  assert.equal(t.approval.needed, true); assert.equal(t.approval.rule, 'customer');
  assert.ok(t.route.includes('gate'));
  let i = 0; while (!sim.state.approvals.includes(FERN.id) && i++ < 600) sim.step(0.1);
  assert.ok(sim.state.approvals.includes(FERN.id), 'Fern waits at the Gate');
  assert.equal(statusOf(sim.state, FERN.id), 'Waiting at the Gate for your yes');
  assert.ok(!sim.ledger.some(e => e.task === t.id && e.outcome === 'allow'), 'nothing allowed it alone');
  sim.approve(FERN.id);
  i = 0; while (t.status !== 'done' && i++ < 600) sim.step(0.1);
  assert.equal(t.status, 'done', 'after a person says yes, it ships');
  assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
});

test('the docked bot also gets work on a normal running base', () => {
  const sim = createSim(162);
  sim.addAgent(toSpec(parseHandoff({ v: 1, agents: [FERN] }).agents[0]), { arrive: 0.1 });
  sim.pause('kite');
  run(sim, 240);
  const took = sim.ledger.filter(e => e.agent === FERN.id && e.by === 'rules' && e.tool === 'email.send');
  assert.ok(took.length > 0, 'Fern took customer email tasks');
  assert.ok(took.every(e => e.outcome === 'hold' || e.level !== 'supervised'), 'while Supervised, its customer messages are held');
});

test('the sample agent is labelled, owned by someone on the crew table, and its tools get work', () => {
  const [a] = parseHandoff({ v: 1, agents: [SAMPLE_AGENT] }).agents;
  assert.ok(a, 'it passes the handoff checks');
  assert.ok(CANON.some(r => r[2] === a.owner && r[3] === a.team), 'its owner and team exist in Umbra');
  assert.match(a.umbraName, /sample/i);
  // crm.read is read access that goes with the work; the other tools on its badge are what tasks ask for.
  for (const tool of a.tools.filter(t => t !== 'crm.read')) assert.ok(KINDS.some(k => k.tool === tool), `${tool} is used by some kind of work`);
  const sim = createSim(162); sim.addAgent(toSpec(a, { sample: true }), { arrive: 0.1 }); run(sim, 240);
  assert.ok(sim.ledger.some(e => e.agent === a.id && e.by === 'rules'), 'once docked, it takes tasks');
  assert.equal(toSpec(a, { sample: true }).umbra.sample, true);
});

test('every station a visitor sees has a short gloss, and the seven named in the canon match it', () => {
  const want = { gate: 'waits for your yes', vault: 'off-limits data', beacon: 'plans the work', library: 'reads references', workshop: 'does the work', check: 'checks it', launch: 'ships it' };
  for (const [id, g] of Object.entries(want)) assert.equal(STATIONS[id].gloss, g, id);
  for (const s of Object.values(STATIONS)) assert.ok(s.gloss && s.gloss.length <= 24, s.id);
});

test('the UI uses the shared words', () => {
  const ui = ['app/markup.html', 'app/hud.js', 'app/ask.js', 'app/main.js'].map(read).join('\n');
  assert.ok(ui.includes("The control room for the person who runs a company's AI agents."));
  assert.ok(ui.includes('Kestrel Mutual crew'));
  assert.ok(ui.includes('simulated model cost'));
  assert.ok(ui.includes('No model makes the allow, hold or stop decision.'));
  assert.ok(ui.includes('Trust grows with each task shipped'));
  assert.ok(ui.includes('Every bot here was approved in Umbra: owner, permissions and money limit.'));
  for (const u of ['https://murtuzabuilds.github.io/umbra/', 'https://murtuzabuilds.github.io/', 'case-study.html']) assert.ok(ui.includes(u), u);
  const words = ui + ['src/sim.js', 'src/world.js', 'src/redteam.js', 'src/handoff.js'].map(read).join('\n');
  const strings = words.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');     // code comments may use the engine's own terms
  for (const bad of [/needs a yes/i, /sign-off/i, /signature/i, /clean runs?\b/i, />\s*LIVE\s*</]) assert.ok(!bad.test(strings), `found ${bad}`);
});

test('nothing written for people uses an em dash or an en dash', () => {
  for (const f of ['README.md', 'case-study.html', 'app/markup.html', 'app/hud.js', 'app/ask.js', 'app/main.js', 'src/sim.js', 'src/world.js', 'src/handoff.js', 'src/redteam.js', 'src/site.js', 'src/crew.js']) {
    assert.ok(!/[\u2013\u2014]|\\u201[34]|&[mn]dash;/.test(read(f)), f);
  }
});
