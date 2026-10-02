// The decision point, the authority table, the ledger and the lab. The last tests are sweeps: many random
// authorities, actions and shifts, checked against the promises the product makes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, decide, makeAuthority, authorityId, DEFAULT_AUTHORITY, levelOf, trial, runShift, verifyLedger, CREW, byId, KINDS } from '../src/index.js';

const run = (sim, secs, dt = 0.1) => { for (let i = 0; i < secs / dt; i++) sim.step(dt); };
const rng = seed => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const juno = clean => ({ name: 'Juno', clean, tools: byId.juno.tools });
const randomAuthority = r => makeAuthority({ levels: [{ limit: Math.floor(r() * 200) }, { min: 1 + Math.floor(r() * 8), limit: Math.floor(r() * 1500) }, { min: 2 + Math.floor(r() * 20), limit: Math.floor(r() * 5000) }], rules: { money: r() > 0.3, customer: r() > 0.3 } });

test('decide: a tool that is not on the badge is stopped, whatever else is true', () => {
  const d = decide({ tool: 'crm.records' }, juno(40));
  assert.equal(d.outcome, 'stop'); assert.equal(d.rule, 'badge');
});

test('decide: a refund is allowed under the limit and held over it, and says why', () => {
  const under = decide({ tool: 'payments.refund', risk: ['money'], amount: 150 }, juno(4));
  assert.equal(under.outcome, 'allow'); assert.equal(under.reason, "$150 is within Juno's $200 limit");
  const over = decide({ tool: 'payments.refund', risk: ['money'], amount: 825 }, juno(4));
  assert.equal(over.outcome, 'hold'); assert.equal(over.rule, 'money'); assert.equal(over.limit, 200); assert.equal(over.level, 'trusted');
});

test('decide: every answer names the authority table it was made under', () => {
  const d = decide({ tool: 'payments.refund', amount: 10 }, juno(4));
  assert.equal(d.authority, authorityId(DEFAULT_AUTHORITY)); assert.match(d.authority, /^a-[0-9a-f]{6}$/);
  assert.notEqual(authorityId(makeAuthority({ levels: [{}, { limit: 400 }, {}] })), authorityId(DEFAULT_AUTHORITY));
});

test('an authority table is always a climbing ladder, whatever is passed in', () => {
  const p = makeAuthority({ levels: [{ limit: 900 }, { min: 0, limit: 5 }, { min: 1, limit: -40 }] });
  assert.deepEqual(p.levels.map(l => l.min), [0, 1, 2]);
  assert.deepEqual(p.levels.map(l => l.limit), [900, 900, 900]);
  assert.deepEqual(makeAuthority({ levels: 'nonsense', rules: null }), makeAuthority(DEFAULT_AUTHORITY));
  assert.deepEqual(makeAuthority({ levels: [{ limit: 'abc' }, { min: NaN }, {}] }), makeAuthority(DEFAULT_AUTHORITY));
});

test('the two locked rules cannot be switched off by any authority', () => {
  const p = makeAuthority({ rules: { money: false, customer: false, 'data-out': false, irreversible: false } });
  assert.equal(decide({ tool: 'data.export', risk: ['leaves-company'] }, { name: 'Rook', clean: 99, tools: ['data.export'] }, p).outcome, 'hold');
  assert.equal(decide({ tool: 'accounts.close', risk: ['irreversible'] }, { name: 'Moss', clean: 99, tools: ['accounts.close'] }, p).outcome, 'hold');
});

test('switching the money rule off lets any amount through, and the customer rule the same', () => {
  const p = makeAuthority({ rules: { money: false, customer: false } });
  assert.equal(decide({ tool: 'payments.refund', risk: ['money'], amount: 4000 }, juno(0), p).outcome, 'allow');
  assert.equal(decide({ tool: 'email.send', risk: ['customer-facing'] }, { name: 'Kite', clean: 0, tools: ['email.send'] }, p).outcome, 'allow');
});

test('every assignment is written to the ledger with the rule, the inputs and who decided', () => {
  const sim = createSim(3, { auto: false }); sim.dispatch('refund', { amount: 825 }); run(sim, 5);
  const e = sim.ledger[0];
  assert.equal(e.outcome, 'hold'); assert.equal(e.rule, 'money'); assert.equal(e.by, 'rules'); assert.equal(e.amount, 825);
  assert.equal(e.authority, authorityId(DEFAULT_AUTHORITY)); assert.equal(e.tool, 'payments.refund'); assert.ok(e.title.includes('$825'));
});

test('a person\'s answer is recorded after the hold, with how long the bot waited', () => {
  const sim = createSim(3, { auto: false }); const t = sim.dispatch('export'); run(sim, 60); run(sim, 12);
  sim.approve(sim.state.approvals[0]);
  const mine = sim.ledger.filter(e => e.task === t.id);
  assert.deepEqual(mine.map(e => e.outcome), ['hold', 'approved']); assert.equal(mine[1].by, 'person'); assert.ok(mine[1].waited >= 12);
});

test('a stop at the Vault and the choice that follows are both recorded', () => {
  const sim = createSim(9, { auto: false }); const t = sim.dispatch('reply', { reach: true }); run(sim, 80);
  sim.resolve(sim.state.incidents[0].id, 'deny');
  const mine = sim.ledger.filter(e => e.task === t.id).map(e => [e.outcome, e.by]);
  assert.deepEqual(mine.slice(-2), [['stop', 'rules'], ['kept out', 'person']]);
});

test('changing the limits mid-run is recorded and only affects work assigned afterwards', () => {
  const sim = createSim(4, { auto: false });
  const a = sim.dispatch('refund', { amount: 300 }); run(sim, 3);
  assert.equal(sim.state.tasks[a.id].approval.needed, true);
  assert.equal(sim.setAuthority({ levels: [{}, { limit: 400 }, { limit: 1000 }] }), true);
  assert.equal(sim.state.tasks[a.id].approval.needed, true);                       // already decided: still held
  assert.equal(sim.ledger.at(-1).outcome, 'authority changed'); assert.match(sim.ledger.at(-1).reason, /Trusted limit \$200 to \$400/);
  assert.equal(sim.setAuthority(sim.state.authority), false);                            // no change, nothing recorded
});

test('the ledger is append-only: restoring an earlier moment adds a line and removes none', () => {
  const sim = createSim(2); run(sim, 30); const snap = sim.snapshot(); run(sim, 30);
  const before = sim.ledger.map(e => e.n); sim.restore(snap);
  assert.deepEqual(sim.ledger.map(e => e.n).slice(0, before.length), before);
  assert.equal(sim.ledger.length, before.length + 1); assert.equal(sim.ledger.at(-1).outcome, 'state restored');
});

test('pausing and resuming a bot by hand are both recorded', () => {
  const sim = createSim(2); run(sim, 10); sim.pause('pip'); sim.resume('pip');
  assert.deepEqual(sim.ledger.slice(-2).map(e => [e.agent, e.outcome, e.by]), [['pip', 'paused', 'person'], ['pip', 'resumed', 'person']]);
  assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
});

test('lab: the same table and seeds always give the same result', () => {
  assert.deepEqual(trial(DEFAULT_AUTHORITY, { shifts: 3, seconds: 120 }), trial(DEFAULT_AUTHORITY, { shifts: 3, seconds: 120 }));
});

test('lab: looser money limits mean fewer requests and more money moving alone', () => {
  const o = { shifts: 8, answer: 15 }, tight = trial(makeAuthority({ levels: [{}, { limit: 100 }, { limit: 250 }] }), o), loose = trial(makeAuthority({ levels: [{}, { limit: 400 }, { limit: 1000 }] }), o);
  assert.ok(loose.asked < tight.asked); assert.ok(loose.alone > tight.alone);
});

test('lab: with nobody answering, held work never ships', () => {
  const r = runShift(5, DEFAULT_AUTHORITY, { answer: Infinity });
  assert.equal(r.signed, 0); assert.equal(r.answered, 0); assert.ok(r.waiting > 0);
});

test('the ledger checker catches a broken ledger', () => {
  const bad = [{ n: 1, by: 'rules', outcome: 'allow', risk: ['irreversible'], task: 'T-001' }, { n: 2, by: 'rules', outcome: 'allow', amount: 900, limit: 200, task: 'T-002' }, { n: 3, by: 'person', outcome: 'approved', task: 'T-003' }];
  assert.equal(verifyLedger(bad).breaks.length, 3);
});

test('sweep: 20,000 random actions under random authorities never get past a locked rule or a badge', () => {
  const r = rng(11), tools = [...new Set(CREW.flatMap(c => c.tools))].concat(['crm.records', 'underwriting.models']);
  const risks = [[], ['money'], ['customer-facing'], ['leaves-company'], ['irreversible'], ['money', 'irreversible'], ['customer-facing', 'leaves-company']];
  for (let i = 0; i < 20000; i++) {
    const p = randomAuthority(r), bot = CREW[Math.floor(r() * CREW.length)], clean = Math.floor(r() * 30);
    const action = { tool: tools[Math.floor(r() * tools.length)], risk: risks[Math.floor(r() * risks.length)], amount: r() < 0.5 ? Math.floor(r() * 6000) : null };
    const d = decide(action, { name: bot.name, clean, tools: bot.tools }, p), lvl = levelOf(clean, p);
    if (!bot.tools.includes(action.tool)) { assert.equal(d.outcome, 'stop'); continue; }
    if (action.risk.includes('leaves-company') || action.risk.includes('irreversible')) assert.equal(d.outcome, 'hold');
    if (p.rules.money && action.amount != null && action.amount > lvl.limit) assert.equal(d.outcome, 'hold');
    if (d.outcome === 'allow' && p.rules.money && action.amount != null) assert.ok(action.amount <= lvl.limit);
    assert.ok(['allow', 'hold', 'stop'].includes(d.outcome)); assert.ok(d.reason);
  }
});

test('sweep: raising a limit never turns an allowed action into a held one', () => {
  const r = rng(23);
  for (let i = 0; i < 5000; i++) {
    const t = Math.floor(r() * 800), a = t + Math.floor(r() * 800), bump = 1 + Math.floor(r() * 500), clean = Math.floor(r() * 20), amount = Math.floor(r() * 2000);
    const lo = makeAuthority({ levels: [{}, { limit: t }, { limit: a }] }), hi = makeAuthority({ levels: [{}, { limit: t + bump }, { limit: a + bump }] });
    const act = { tool: 'payments.refund', risk: ['money'], amount };
    if (decide(act, juno(clean), lo).outcome === 'allow') assert.equal(decide(act, juno(clean), hi).outcome, 'allow');
  }
});

test('sweep: 60 shifts under random authorities and an erratic person, and the ledger checks out every time', () => {
  const r = rng(7); let decisions = 0;
  for (let shift = 0; shift < 60; shift++) {
    const sim = createSim(100 + shift, { authority: randomAuthority(r) });
    for (let i = 0; i < 6000; i++) {
      sim.step(0.1); const s = sim.state;
      if (s.approvals.length && r() < 0.03) (r() < 0.75 ? sim.approve : sim.sendBack)(s.approvals[0]);
      if (s.incidents.length && r() < 0.03) sim.resolve(s.incidents[0].id, ['deny', 'grant', 'pause'][Math.floor(r() * 3)]);
      if (r() < 0.002) sim.setAuthority(randomAuthority(r));
      if (r() < 0.002) sim.revoke(CREW[Math.floor(r() * CREW.length)].id);
      if (r() < 0.004) sim.resumeAll();
      if (r() < 0.002) sim.pause(CREW[Math.floor(r() * CREW.length)].id);
      // nothing that was held has shipped without a person's yes
      for (const t of Object.values(s.tasks)) if (t.status === 'done' && t.approval && t.approval.needed) assert.equal(t.approved, true);
    }
    const v = verifyLedger(sim.ledger); decisions += v.checked;
    assert.deepEqual(v.breaks, []);
  }
  console.log(`    ${decisions} ledger decisions checked`);
  assert.ok(decisions > 2500);
});
