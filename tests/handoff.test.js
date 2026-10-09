import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHandoff, decodeHash, encodeHandoff, readHandoff, storedWith, storedWithout, toSpec, formatDate, SAMPLE_AGENT, HANDOFF_KEY,
  createSim, statusOf, verifyLedger, decide, byId, BODIES, HATS, COLORS, TOOLS, MAX_GUESTS,
} from '../src/index.js';

const agent = (o = {}) => ({
  id: 'umb-lark', name: 'Lark', job: 'Claims follow-ups', owner: 'Ana Ruiz', team: 'Claims', tools: ['email.send', 'crm.read'],
  limit: 150, approvedAt: '2026-10-06T14:20:00Z', source: 'umbra', umbraName: 'Claims follow-up assistant', rules: ['No payments'], ...o,
});
const wrap = agents => ({ v: 1, agents });
const run = (sim, secs, dt = 0.1) => { for (let i = 0; i < secs / dt; i++) sim.step(dt); };

test('the storage key is the one in the contract', () => {
  assert.equal(HANDOFF_KEY, 'umbra.outpost.handoff');
});

test('a valid handoff parses to the known fields only', () => {
  const r = parseHandoff(JSON.stringify(wrap([{ ...agent(), extra: 'ignored', clean: 99 }])));
  assert.equal(r.agents.length, 1); assert.deepEqual(r.errors, []);
  const a = r.agents[0];
  assert.deepEqual(Object.keys(a).sort(), ['approvedAt', 'id', 'job', 'limit', 'name', 'owner', 'rules', 'source', 'team', 'tools', 'umbraName'].sort());
  assert.equal(a.clean, undefined);
});

test('malformed input is ignored, never thrown', () => {
  for (const bad of [null, undefined, '', 'nope', '{', '[]', '{"v":2,"agents":[]}', '{"v":1}', '{"v":1,"agents":{}}', 42, [], { v: 1, agents: 'x' }, 'x'.repeat(30000)]) {
    const r = parseHandoff(bad);
    assert.deepEqual(r.agents, [], String(bad).slice(0, 20));
  }
});

test('each required field is checked, and a bad agent is dropped on its own', () => {
  const bads = [
    agent({ source: 'elsewhere' }), agent({ id: 'lark' }), agent({ id: 'umb-<b>' }), agent({ id: 'UMB-LARK' }), agent({ name: '' }), agent({ name: '   ' }),
    agent({ owner: undefined }), agent({ tools: 'email.send' }), agent({ tools: ['root.shell', 'wire.transfer'] }), agent({ limit: -1 }),
    agent({ limit: '150' }), agent({ limit: Infinity }), agent({ limit: NaN }), agent({ approvedAt: 'yesterday' }), agent({ approvedAt: '2026-13-45' }), agent({ approvedAt: 5 }),
    'a string', null, [agent()],
  ];
  for (const b of bads) {
    const r = parseHandoff(wrap([b, agent({ id: 'umb-ok', name: 'Ok' })]));
    assert.deepEqual(r.agents.map(a => a.id), ['umb-ok'], JSON.stringify(b));
    assert.equal(r.errors.length, 1);
  }
});

test('unknown tools are dropped and the rest kept', () => {
  const a = parseHandoff(wrap([agent({ tools: ['email.send', 'root.shell', 'email.send', 7, 'data.export'] })])).agents[0];
  assert.deepEqual(a.tools, ['email.send', 'data.export']);
  for (const t of a.tools) assert.ok(TOOLS[t]);
});

test('text is cleaned and capped', () => {
  const a = parseHandoff(wrap([agent({ name: '  Lark‮\u0000 the very long named bot  ', job: 'x'.repeat(200), rules: ['  ok  ', '', 7, 'y'.repeat(300), 'a', 'b', 'c', 'd', 'e'] })])).agents[0];
  assert.ok(a.name.length <= 16); assert.ok(!/[‮\u0000]/.test(a.name)); assert.ok(a.name.startsWith('Lark'));
  assert.equal(a.job.length, 48);
  assert.equal(a.rules[0], 'ok'); assert.equal(a.rules[1].length, 90); assert.equal(a.rules.length, 6);
  assert.equal(parseHandoff(wrap([agent({ umbraName: undefined })])).agents[0].umbraName, 'Lark');
  assert.deepEqual(parseHandoff(wrap([agent({ rules: 'no' })])).agents[0].rules, []);
});

test('at most three, and duplicates are kept once', () => {
  const many = ['a', 'b', 'a', 'c', 'd', 'e'].map(k => agent({ id: 'umb-' + k, name: k.toUpperCase() }));
  const r = parseHandoff(wrap(many));
  assert.deepEqual(r.agents.map(a => a.id), ['umb-a', 'umb-b', 'umb-c']);
});

test('the hash carries the same object as base64url, including non-ASCII text', () => {
  const obj = wrap([agent({ owner: 'Zoë Ñúñez', name: 'Lark' })]);
  const enc = encodeHandoff(obj);
  assert.match(enc, /^[A-Za-z0-9_-]+$/);
  assert.equal(decodeHash('#dock=' + enc), JSON.stringify(obj));
  assert.equal(decodeHash('#view=1&dock=' + enc), JSON.stringify(obj));
  assert.equal(parseHandoff(decodeHash('#dock=' + enc)).agents[0].owner, 'Zoë Ñúñez');
  const std = Buffer.from(JSON.stringify(obj)).toString('base64url');
  assert.equal(decodeHash('#dock=' + std), JSON.stringify(obj));
  for (const bad of ['', '#', '#dock=', '#dock=***', '#dock=%E0%A4%A', '#outpost', '#dock=A', null, 5]) assert.equal(decodeHash(bad), null, String(bad));
});

test('the hash is read first, then storage, and the hash wins a tie', () => {
  const fromHash = agent({ id: 'umb-a', name: 'Hash' }), same = agent({ id: 'umb-a', name: 'Stored' }), other = agent({ id: 'umb-b', name: 'Other' });
  const r = readHandoff({ hash: '#dock=' + encodeHandoff(wrap([fromHash])), stored: JSON.stringify(wrap([same, other])) });
  assert.deepEqual(r.agents.map(a => a.name), ['Hash', 'Other']);
  assert.equal(r.fromHash, 1); assert.equal(r.fromStorage, 2);
  assert.deepEqual(readHandoff({ hash: '#outpost', stored: 'garbage' }).agents, []);
  assert.deepEqual(readHandoff().agents, []);
});

test('storage after docking and after undocking', () => {
  const s1 = storedWith(null, [agent({ id: 'umb-a' })]);
  assert.deepEqual(JSON.parse(s1).agents.map(a => a.id), ['umb-a']);
  const s2 = storedWith(s1, [agent({ id: 'umb-b' }), agent({ id: 'umb-a' })]);
  assert.deepEqual(JSON.parse(s2).agents.map(a => a.id), ['umb-a', 'umb-b']);
  assert.equal(parseHandoff(s2).agents.length, 2);
  const s3 = storedWithout(s2, 'umb-a');
  assert.deepEqual(JSON.parse(s3).agents.map(a => a.id), ['umb-b']);
  assert.equal(storedWithout(s3, 'umb-b'), null);
  assert.equal(storedWithout('garbage', 'umb-b'), null);
});

test('a docked bot starts Supervised, with a look picked from its id', () => {
  const a = parseHandoff(wrap([agent()])).agents[0], s = toSpec(a), t = toSpec(a);
  assert.equal(s.clean, 0); assert.equal(s.cap, 150);
  assert.ok(BODIES.includes(s.body)); assert.ok(HATS.includes(s.hat)); assert.ok(COLORS.includes(s.color));
  assert.deepEqual([s.body, s.hat, s.color], [t.body, t.hat, t.color]);
  assert.equal(s.umbra.approvedOn, '6 Oct 2026'); assert.equal(s.umbra.sample, false);
  assert.equal(toSpec(a, { sample: true }).umbra.sample, true);
  assert.equal(formatDate('nope'), 'an unknown date');
});

test('the sample agent passes the same checks as a real handoff', () => {
  const r = parseHandoff(wrap([SAMPLE_AGENT]));
  assert.equal(r.agents.length, 1); assert.deepEqual(r.errors, []);
});

test('a docked bot flies in, is logged, then takes work it has the tools for and hits the Gate', () => {
  const sim = createSim(5, { auto: false });
  const spec = toSpec(parseHandoff(wrap([agent({ id: 'umb-hop', name: 'Hop' })])).agents[0]);
  const a = sim.addAgent(spec);
  assert.ok(a); assert.equal(a.state, 'arrive'); assert.equal(statusOf(sim.state, 'umb-hop'), 'Flying in from Umbra');
  assert.equal(byId['umb-hop'].name, 'Hop');
  sim.dispatch('reply', { reach: false });            // Kite could take it too, so pause Kite to be sure Hop does
  sim.pause('kite');
  run(sim, 1);
  assert.equal(sim.state.tasks['T-001'].assignee, null, 'no work while flying in');
  run(sim, 2.5);
  const line = sim.state.log.find(l => l.kind === 'dock');
  assert.equal(line.text, 'Hop docked from Umbra. Owner: Ana Ruiz. Approved in Umbra on 6 Oct 2026.');
  assert.equal(sim.ledger.find(e => e.outcome === 'docked').by, 'umbra');
  run(sim, 1);
  assert.equal(sim.state.tasks['T-001'].assignee, 'umb-hop');
  const held = sim.ledger.find(e => e.agent === 'umb-hop' && e.by === 'rules');
  assert.equal(held.outcome, 'hold'); assert.equal(held.rule, 'customer');
  for (let i = 0; i < 1200 && !sim.state.approvals.length; i++) sim.step(0.1);
  assert.deepEqual(sim.state.approvals, ['umb-hop']);
  sim.approve('umb-hop'); run(sim, 20);
  assert.equal(sim.state.agents.find(x => x.id === 'umb-hop').clean, 1, 'a clean run counts toward its next level');
  assert.equal(verifyLedger(sim.ledger).breaks.length, 0);
});

test('a docked bot never gets work its badge does not allow', () => {
  const sim = createSim(11);
  sim.addAgent(toSpec(parseHandoff(wrap([agent({ id: 'umb-cal', name: 'Cal', tools: ['calendar.write'] })])).agents[0]));
  for (let i = 0; i < 3000; i++) {
    sim.step(0.1);
    const s = sim.state, a = s.agents.find(x => x.id === 'umb-cal');
    if (a.task) assert.equal(s.tasks[a.task].tool, 'calendar.write');
    for (const id of s.approvals.slice()) sim.approve(id);
    for (const inc of s.incidents.slice()) sim.resolve(inc.id, 'deny');
  }
  assert.ok(sim.state.agents.find(x => x.id === 'umb-cal').shipped > 0);
});

test('the Umbra limit is a ceiling on the money a bot may move alone', () => {
  const who = { name: 'Lark', clean: 20, tools: ['payments.refund'], cap: 150 };
  assert.equal(decide({ tool: 'payments.refund', risk: ['money'], amount: 140 }, who).outcome, 'allow');
  const d = decide({ tool: 'payments.refund', risk: ['money'], amount: 160 }, who);
  assert.equal(d.outcome, 'hold'); assert.equal(d.rule, 'money'); assert.equal(d.limit, 150);
  assert.equal(decide({ tool: 'payments.refund', risk: ['money'], amount: 160 }, { ...who, cap: 9999 }).outcome, 'allow', 'a cap never raises the level limit');
  assert.equal(decide({ tool: 'payments.refund', risk: ['money'], amount: 600 }, { ...who, cap: 9999 }).outcome, 'hold');
});

test('at most three docked bots, each on its own pad, and undocking returns its work', () => {
  const sim = createSim(3, { auto: false });
  const specs = ['a', 'b', 'c', 'd'].map(k => toSpec(parseHandoff(wrap([agent({ id: 'umb-x' + k, name: 'X' + k })])).agents[0]));
  const added = specs.map(s => sim.addAgent(s));
  assert.equal(added.filter(Boolean).length, MAX_GUESTS);
  assert.deepEqual(added.slice(0, 3).map(a => a.i), [8, 9, 10]);
  assert.equal(sim.addAgent(specs[0]), null, 'the same bot cannot dock twice');
  run(sim, 4);
  sim.pause('kite'); sim.pause('umb-xb'); sim.pause('umb-xc');
  sim.dispatch('reply', { reach: false }); run(sim, 2);
  const t = sim.state.tasks['T-001'];
  assert.equal(t.assignee, 'umb-xa');
  assert.ok(sim.removeAgent('umb-xa'));
  assert.equal(sim.state.agents.some(a => a.id === 'umb-xa'), false);
  assert.equal(t.status, 'queued'); assert.ok(sim.state.queue.includes('T-001'));
  assert.equal(sim.removeAgent('kite'), false, 'the original crew cannot be undocked');
  assert.equal(sim.ledger.filter(e => e.outcome === 'undocked').length, 1);
  assert.match(sim.state.log.at(-1).text, /^Xa undocked\. T-001 went back to the Inbox$/);
  assert.equal(sim.addAgent(specs[3]).i, 8, 'a freed pad is used again');
});

test('a docked bot never shares a name with a crew member', () => {
  const spec = toSpec({ id: 'umb-x', name: 'Moss', job: '', owner: 'A', team: '', tools: ['crm.read'], limit: 0, approvedAt: '2026-10-01T00:00:00Z', umbraName: 'X', rules: [] });
  assert.equal(spec.name, 'Moss 2');
});
