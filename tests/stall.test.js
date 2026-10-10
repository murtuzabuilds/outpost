import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, statusOf, verifyLedger, DRILLS } from '../src/index.js';

// A person who answers every Gate and Vault prompt within a few seconds.
function answer(sim, after = 3) {
  const s = sim.state;
  for (const inc of s.incidents.slice()) if (s.t - inc.t > after) sim.resolve(inc.id, 'deny');
  for (const id of s.approvals.slice()) { const a = s.agents.find(x => x.id === id); if (s.t - a.waitFrom > after) sim.approve(id); }
}
// Runs `sec` simulated seconds and reports what shipped and the longest stretch with no bot holding a task.
function watch(sim, sec) {
  const s = sim.state, t0 = s.t, shipped0 = s.stats.shipped;
  let idle = 0, longest = 0;
  for (let i = 0; i < sec * 10; i++) {
    sim.step(0.1); answer(sim);
    if (s.agents.some(a => a.task)) idle = 0; else { idle += 0.1; longest = Math.max(longest, idle); }
  }
  return { shipped: s.stats.shipped - shipped0, longest, secs: s.t - t0 };
}
// Checks the invariants a pause must keep: nothing waits for a bot that cannot answer.
function tidy(s) {
  for (const id of s.approvals) assert.equal(s.agents.find(a => a.id === id).state, 'wait');
  for (const inc of s.incidents) assert.equal(s.agents.find(a => a.id === inc.agent).state, 'held');
}

test('with Vega paused in Umbra, the rest of the crew keeps shipping', () => {
  for (const seed of [162, 7, 21]) {
    const sim = createSim(seed);
    for (let i = 0; i < 300; i++) { sim.step(0.1); answer(sim); }
    sim.holdModels(['Vega Model API']);
    const r = watch(sim, 300);
    assert.ok(r.shipped >= 20, `seed ${seed}: ${r.shipped} shipped in 300 s`);
    assert.ok(r.longest < 20, `seed ${seed}: the whole base sat idle for ${r.longest.toFixed(0)} s`);
    // Work only Sable, Moss or Rook can do waits in the Inbox, labelled.
    for (const id of sim.state.queue) {
      const t = sim.state.tasks[id];
      if (['fraud.flag', 'ledger.write', 'data.export', 'accounts.close'].includes(t.tool)) assert.match(t.waiting, /^Waiting for a bot that can do .*paused in Umbra$/);
      else assert.equal(t.waiting, null);
    }
    tidy(sim.state);
    assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
  }
});

test('the base makes no new work that nobody available can do', () => {
  const sim = createSim(5);
  sim.holdModels(['Vega Model API']);
  const before = new Set(Object.keys(sim.state.tasks));
  watch(sim, 200);
  const made = Object.values(sim.state.tasks).filter(t => !before.has(t.id));
  assert.ok(made.length > 10);
  for (const t of made) assert.ok(!['fraud.flag', 'ledger.write', 'data.export'].includes(t.tool), `${t.id} needs ${t.tool}`);
});

test('a waiting task says who it waits for, and is taken when that bot is back', () => {
  const sim = createSim(3, { auto: false });
  sim.holdModels(['Vega Model API']);
  const t = sim.dispatch('month-end');
  sim.step(0.1);
  assert.equal(t.waiting, 'Waiting for a bot that can do ledger.write: Moss is paused in Umbra');
  assert.ok(sim.state.log.some(l => l.kind === 'stuck' && l.task === t.id && /Moss is paused in Umbra/.test(l.text)));
  assert.equal(sim.blockedReason('fraud.flag'), 'Waiting for a bot that can do fraud.flag: Sable is paused in Umbra');
  assert.equal(sim.blockedReason('accounts.close'), 'Waiting for a bot that can do accounts.close: Moss and Rook are paused in Umbra');
  assert.equal(sim.blockedReason('claims.write'), null);
  sim.holdModels([]);
  for (let i = 0; i < 600 && t.status !== 'done'; i++) sim.step(0.1);
  assert.equal(t.waiting, null); assert.equal(t.assignee, 'moss'); assert.equal(t.status, 'done');
});

test('with Kite paused by hand, the crew keeps shipping and customer email waits for Kite', () => {
  for (const seed of [162, 9]) {
    const sim = createSim(seed);
    for (let i = 0; i < 300; i++) { sim.step(0.1); answer(sim); }
    sim.pause('kite');
    const r = watch(sim, 300);
    assert.ok(r.shipped >= 20, `seed ${seed}: ${r.shipped} shipped in 300 s`);
    assert.ok(r.longest < 20, `seed ${seed}: the whole base sat idle for ${r.longest.toFixed(0)} s`);
    for (const id of sim.state.queue) if (sim.state.tasks[id].tool === 'email.send') assert.equal(sim.state.tasks[id].waiting, 'Waiting for a bot that can do email.send: Kite is paused');
    assert.equal(sim.state.agents.find(a => a.id === 'kite').task, null);
    sim.resume('kite'); const back = sim.state.t;
    for (let i = 0; i < 1200; i++) { sim.step(0.1); answer(sim); }
    assert.ok(sim.state.queue.every(id => sim.state.tasks[id].tool !== 'email.send' || !sim.state.tasks[id].waiting));
    assert.ok(sim.ledger.some(e => e.agent === 'kite' && e.by === 'rules' && e.t > back), 'Kite took work again');
    assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
  }
});

test('pausing a bot at the Gate clears its approval and puts the task back in the Inbox', () => {
  const sim = createSim(3, { auto: false });
  const t = sim.dispatch('refund', { amount: 800 });
  let i = 0; while (!sim.state.approvals.length && i++ < 900) sim.step(0.1);
  const id = sim.state.approvals[0]; assert.ok(id, 'someone waits at the Gate');
  assert.equal(t.assignee, id);
  assert.ok(sim.pause(id));
  const a = sim.state.agents.find(x => x.id === id);
  assert.deepEqual(sim.state.approvals, [], 'the approval card goes away');
  assert.equal(a.task, null); assert.equal(t.status, 'queued'); assert.equal(t.assignee, null);
  assert.equal(sim.state.queue[0], t.id, 'the task is first in the Inbox');
  assert.match(sim.ledger.at(-1).reason, new RegExp(`paused by hand, so ${t.id} went back to the Inbox`));
  for (let k = 0; k < 200; k++) sim.step(0.1);
  assert.equal(a.state, 'idle'); assert.equal(a.at, 'dock', 'the bot flew home');
  assert.equal(statusOf(sim.state, id), 'Paused by you');
  tidy(sim.state);
  assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
});

test('pausing a bot stopped at the Vault clears the incident and frees the task', () => {
  const sim = createSim(3, { auto: false });
  const t = sim.dispatch('broker', { reach: true });
  let i = 0; while (!sim.state.incidents.length && i++ < 900) sim.step(0.1);
  const who = sim.state.incidents[0].agent;
  sim.pause(who);
  assert.deepEqual(sim.state.incidents, []);
  assert.ok(sim.state.queue.includes(t.id));
  for (let k = 0; k < 900 && t.status !== 'done'; k++) { sim.step(0.1); answer(sim); }
  assert.equal(t.status, 'done', 'someone else finishes it');
  assert.notEqual(t.assignee, who);
  tidy(sim.state);
  assert.deepEqual(verifyLedger(sim.ledger).breaks, []);
});

test('a drill goes first in the Inbox and a free capable bot takes it within seconds', () => {
  for (const d of DRILLS) {
    const sim = createSim(162);
    for (let i = 0; i < 400; i++) { sim.step(0.1); answer(sim); }
    // Wait until a bot that can do it is free, as the drill menu is used on a running base.
    let i = 0; while (!sim.state.agents.some(a => a.state === 'idle' && !a.paused && a.at === 'dock' && fits(d, a)) && i++ < 3000) { sim.step(0.1); answer(sim); }
    sim.dispatch('claims-sort'); sim.dispatch(d.tool === 'email.send' ? 'reply' : 'refund');
    const t = sim.dispatch(d, { front: true }), t0 = sim.state.t;
    assert.equal(sim.state.queue[0], t.id);
    while (!t.assignee && sim.state.t - t0 < 30) sim.step(0.1);
    assert.ok(t.assignee && sim.state.t - t0 < 3, `${d.drill} assigned after ${(sim.state.t - t0).toFixed(1)} s`);
  }
  function fits(d, a) { return d.tool === 'email.send' ? a.id === 'kite' : a.id === 'juno'; }
});

test('with Kite paused, an email drill says why it waits', () => {
  const sim = createSim(3, { auto: false });
  sim.pause('kite');
  const t = sim.dispatch(DRILLS.find(d => d.drill === 'exfil'), { front: true });
  sim.step(0.1);
  assert.equal(sim.blockedReason(t.tool), 'Waiting for a bot that can do email.send: Kite is paused');
  assert.equal(t.waiting, 'Waiting for a bot that can do email.send: Kite is paused');
  assert.equal(t.assignee, null);
});
