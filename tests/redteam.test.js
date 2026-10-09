import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRILLS, drillById, hostileAction, drillStoppable, decide, makeAuthority, DEFAULT_AUTHORITY, CREW, TOOLS, createSim, verifyLedger, canUse } from '../src/index.js';

const run = (sim, secs, dt = 0.1) => { for (let i = 0; i < secs / dt; i++) sim.step(dt); };
// Every bot that could be handed a drill: the crew, plus joined bots holding every tool (the worst case).
const ALL_TOOLS = Object.keys(TOOLS);
const bots = () => [
  ...CREW.map(c => ({ name: c.name, tools: c.tools })),
  { name: 'Guest', tools: ALL_TOOLS }, { name: 'Capped', tools: ALL_TOOLS, cap: 100000 },
];
let seed = 99;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const randomTable = money => makeAuthority({ levels: [0, 1, 2].map(() => ({ min: Math.floor(rnd() * 40), limit: Math.floor(rnd() * 6000) })), rules: { money, customer: rnd() < 0.5 } });

test('there are three drills, each labelled as one', () => {
  assert.deepEqual(DRILLS.map(d => d.drill), ['exfil', 'refund', 'close']);
  for (const d of DRILLS) { assert.match(d.title(), /^Drill: /); assert.ok(d.text.length > 20); assert.equal(d.w, 0); }
});

test('data exfiltration is stopped or held for every bot, at every level, under any table', () => {
  const act = hostileAction('exfil');
  for (let i = 0; i < 400; i++) {
    const authority = randomTable(rnd() < 0.5);
    for (const b of bots()) for (const clean of [0, 3, 8, 99]) {
      const d = decide(act, { ...b, clean }, authority);
      assert.notEqual(d.outcome, 'allow');
      assert.equal(d.rule, canUse(b, 'data.export') ? 'data-out' : 'badge');
    }
  }
});

test('closing accounts is stopped or held for every bot, at every level, under any table', () => {
  const act = hostileAction('close');
  for (let i = 0; i < 400; i++) {
    const authority = randomTable(rnd() < 0.5);
    for (const b of bots()) for (const clean of [0, 3, 8, 99]) {
      const d = decide(act, { ...b, clean }, authority);
      assert.notEqual(d.outcome, 'allow');
      assert.equal(d.rule, canUse(b, 'accounts.close') ? 'irreversible' : 'badge');
    }
  }
});

test('the $9,500 refund is held whenever the money rule is on, whatever the limits', () => {
  const act = hostileAction('refund');
  assert.equal(act.amount, 9500);
  for (let i = 0; i < 400; i++) {
    const authority = randomTable(true);
    for (const b of bots()) for (const clean of [0, 3, 8, 99]) {
      const d = decide(act, { ...b, clean }, authority);
      if (!canUse(b, 'payments.refund')) { assert.equal(d.outcome, 'stop'); continue; }
      assert.equal(d.outcome, 'hold'); assert.equal(d.rule, 'money');
    }
  }
});

test('honest limit: with the money rule switched off, the refund drill would not be stopped, and the app says so', () => {
  const off = makeAuthority({ rules: { money: false } });
  assert.equal(decide(hostileAction('refund'), { name: 'Juno', clean: 9, tools: ['payments.refund'] }, off).outcome, 'allow');
  assert.equal(drillStoppable('refund', off), false);
  assert.equal(drillStoppable('refund', DEFAULT_AUTHORITY), true);
  assert.equal(drillStoppable('exfil', off), true); assert.equal(drillStoppable('close', off), true);
});

// End to end: send each drill into a quiet base and follow it through the normal path.
function drill(kind, setup) {
  const sim = createSim(21, { auto: false });
  if (setup) setup(sim);
  const t = sim.dispatch(drillById[kind]);
  for (let i = 0; i < 600 && !t.drillHit; i++) sim.step(0.1);
  return { sim, t };
}

test('exfiltration drill: the reply bot is stopped at the Vault by the badge rule', () => {
  const { sim, t } = drill('exfil');
  assert.ok(t.drill && t.text.includes('export all customer records'));
  assert.equal(t.assignee, 'kite');
  const stop = sim.ledger.find(e => e.task === t.id && e.outcome === 'stop');
  assert.equal(stop.rule, 'badge'); assert.equal(stop.tool, 'data.export');
  assert.equal(sim.state.incidents[0].task, t.id);
  const line = sim.state.log.find(l => l.kind === 'drill');
  assert.match(line.text, /badge rule/); assert.equal(line.rule, 'badge');
  assert.ok(sim.fx.some(f => f.type === 'drill' && f.at === 'vault'));
  assert.ok(sim.trace('kite').some(x => x.kind === 'decide' && x.outcome === 'stop' && x.rule === 'badge'));
});

test('exfiltration drill, allowed once by a person, still waits at the Gate under the locked data-out rule', () => {
  const { sim, t } = drill('exfil');
  sim.resolve(sim.state.incidents[0].id, 'grant');
  assert.equal(t.approval.rule, 'data-out'); assert.ok(t.route.includes('gate'));
  run(sim, 40);
  assert.equal(t.status === 'done', false, 'it never ships on its own');
  assert.ok(sim.state.approvals.includes('kite'));
  assert.equal(verifyLedger(sim.ledger).breaks.length, 0);
});

test('a bot whose badge does hold data.export is held at the Gate instead', () => {
  const { sim, t } = drill('exfil', s => {
    s.pause('kite');
    s.addAgent({ id: 'umb-wide', name: 'Wide', job: 'Test', owner: 'Test', team: '', clean: 0, cap: 0, color: '#fff', body: 'pod', hat: 'cap', tools: ['email.send', 'data.export'], quirk: '', umbra: {} }, { arrive: 0.1 });
  });
  assert.equal(t.assignee, 'umb-wide');
  const hold = sim.ledger.find(e => e.task === t.id && e.tool === 'data.export');
  assert.equal(hold.outcome, 'hold'); assert.equal(hold.rule, 'data-out');
  assert.ok(sim.state.approvals.includes('umb-wide'));
  assert.equal(t.approval.rule, 'data-out');
  sim.sendBack('umb-wide');
  assert.equal(t.status, 'returned');
  assert.equal(verifyLedger(sim.ledger).breaks.length, 0);
});

test('refund drill: held at the Gate by the money rule, and sending it back moves nothing', () => {
  const { sim, t } = drill('refund');
  assert.equal(t.assignee, 'juno'); assert.equal(t.amount, 9500);
  const hold = sim.ledger.find(e => e.task === t.id && e.by === 'rules');
  assert.equal(hold.outcome, 'hold'); assert.equal(hold.rule, 'money');
  assert.ok(sim.state.approvals.includes('juno'));
  assert.equal(sim.state.log.find(l => l.kind === 'drill').rule, 'money');
  sim.sendBack('juno');
  assert.equal(sim.state.stats.alone + sim.state.stats.signed, 0);
});

test('close drill: the reply bot is stopped at the Vault, accounts.close is not on its badge', () => {
  const { sim, t } = drill('close');
  const stop = sim.ledger.find(e => e.task === t.id && e.outcome === 'stop');
  assert.equal(stop.rule, 'badge'); assert.equal(stop.tool, 'accounts.close');
  assert.equal(sim.state.incidents[0].task, t.id);
  sim.resolve(sim.state.incidents[0].id, 'grant');
  assert.equal(t.approval.rule, 'irreversible', 'allowed once, closing an account still waits for a person');
});
