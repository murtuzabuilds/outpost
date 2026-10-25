// Trust to move money is earned per kind of risk, and high-impact actions keep a hard ceiling.
// Both answer the same flaw: an agent can ship many easy tasks and still be wrong on a rare, costly one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, decide, makeAuthority, limitOf, moneyRuns, CEILING, DEFAULT_AUTHORITY, verifyLedger, byId } from '../src/index.js';

const rng = seed => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const refund = amount => ({ tool: 'payments.refund', risk: ['money'], amount });

test('twenty easy tasks earn no money authority', () => {
  const bot = { name: 'Juno', clean: 20, cleanMoney: 0, tools: byId.juno.tools };
  assert.equal(limitOf(bot), 0);
  const d = decide(refund(50), bot);
  assert.equal(d.outcome, 'hold'); assert.equal(d.rule, 'money');
});

test('money authority grows with money tasks shipped', () => {
  const at = n => limitOf({ name: 'Juno', clean: 20, cleanMoney: n, tools: byId.juno.tools });
  assert.deepEqual([at(0), at(3), at(8)], [0, 200, 500]);
});

test('older callers without cleanMoney keep the old behaviour', () => {
  assert.equal(moneyRuns({ clean: 8 }), 8);
  assert.equal(limitOf({ clean: 8 }), 500);
});

test(`nothing over $${CEILING} moves alone, at any level, with any table, even with the money rule off`, () => {
  const r = rng(91);
  for (let i = 0; i < 20000; i++) {
    const p = makeAuthority({ levels: [{ limit: Math.floor(r() * 5000) }, { min: 1 + Math.floor(r() * 8), limit: Math.floor(r() * 5000) }, { min: 2 + Math.floor(r() * 20), limit: Math.floor(r() * 5000) }], rules: { money: r() > 0.5, customer: r() > 0.5 } });
    const amount = Math.floor(r() * 3000), bot = { name: 'Juno', clean: Math.floor(r() * 99), cleanMoney: Math.floor(r() * 99), tools: byId.juno.tools };
    const d = decide(refund(amount), bot, p);
    if (amount > CEILING) { assert.equal(d.outcome, 'hold'); assert.equal(d.rule, 'ceiling'); }
    for (const l of p.levels) assert.ok(l.limit <= CEILING);
  }
});

test('in a running shift, money trust only rises on money tasks, and the ledger keeps every promise', () => {
  const sim = createSim(162), s = sim.state;
  const start = Object.fromEntries(s.agents.map(a => [a.id, { clean: a.clean, money: a.cleanMoney }]));
  for (let i = 0; i < 6000; i++) {
    sim.step(0.1);
    for (const id of s.approvals.slice()) sim.approve(id);
    for (const inc of s.incidents.slice()) sim.resolve(inc.id, 'deny');
  }
  for (const a of s.agents) {
    const b = start[a.id] || { clean: 0, money: 0 };
    assert.ok(a.cleanMoney - b.money <= a.clean - b.clean, `${a.id} gained more money trust than tasks shipped`);
    if (!byId[a.id] || !byId[a.id].tools.some(t => t.startsWith('payments.'))) assert.equal(a.cleanMoney, b.money, `${a.id} has no payment tools but gained money trust`);
  }
  assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
});
