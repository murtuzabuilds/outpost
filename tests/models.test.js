import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, statusOf, parseModelPause, verifyLedger, CREW } from '../src/index.js';

const onNova = CREW.filter(c => c.model === 'Nova Model API').map(c => c.id);

test('only a well-formed record from Umbra pauses anything', () => {
  assert.deepEqual(parseModelPause('{"v":1,"paused":[{"id":"nova-api","name":"Nova Model API"}]}'), ['Nova Model API']);
  for (const bad of ['', 'nope', '{"v":2,"paused":[{"name":"x"}]}', '{"v":1}', '{"v":1,"paused":"Nova"}', 'x'.repeat(5000)]) assert.deepEqual(parseModelPause(bad), []);
  assert.deepEqual(parseModelPause({ v: 1, paused: [{ name: ' Nova‮ Model API ' }, { name: 42 }, {}] }), ['Nova Model API']);
});

test('pausing a model stops exactly the bots that run on it, and their work goes back to the Inbox', () => {
  const sim = createSim(162);
  for (let i = 0; i < 400; i++) sim.step(0.1);
  const busy = sim.state.agents.filter(a => onNova.includes(a.id) && a.task).map(a => a.task);
  const r = sim.holdModels(['Nova Model API']);
  assert.deepEqual(r.held.sort(), onNova.slice().sort());
  for (const a of sim.state.agents) {
    assert.equal(!!a.modelHold, onNova.includes(a.id));
    if (onNova.includes(a.id)) { assert.equal(a.task, null); assert.match(statusOf(sim.state, a.id), /Nova Model API is paused in Umbra/); }
  }
  for (const t of busy) assert.ok(sim.state.queue.includes(t), `${t} is back in the Inbox`);
  for (let i = 0; i < 600; i++) sim.step(0.1);
  for (const id of onNova) assert.equal(sim.state.agents.find(a => a.id === id).task, null, 'a held bot takes no new work');
  assert.ok(!sim.resume(onNova[0]), 'a bot held by Umbra cannot be resumed by hand here');
  assert.equal(verifyLedger(sim.ledger).breaks.length, 0);
});

test('resuming the model frees those bots, but a bot paused by hand stays paused', () => {
  const sim = createSim(162);
  sim.pause(onNova[0]);
  sim.holdModels(['Nova Model API']);
  assert.equal(sim.holdModels(['Nova Model API']).held.length, 0, 'applying the same list twice changes nothing');
  const r = sim.holdModels([]);
  assert.deepEqual(r.freed.sort(), onNova.slice().sort());
  assert.equal(sim.state.agents.find(a => a.id === onNova[0]).paused, true);
  for (const id of onNova.slice(1)) assert.equal(sim.state.agents.find(a => a.id === id).paused, false);
  assert.ok(sim.ledger.some(e => e.outcome === 'model paused' && e.by === 'umbra') && sim.ledger.some(e => e.outcome === 'model resumed'));
  assert.ok(sim.trace(onNova[1]).some(x => x.kind === 'model' && /Stopped by Umbra/.test(x.text)));
});
