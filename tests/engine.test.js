import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, statusOf, needsApproval, levelOf, nextLevel, canUse, CREW, byId, KINDS, CALM, makeTask, STATIONS, distance, SITE_KINDS } from '../src/index.js';

const run = (sim, secs, dt = 0.1) => { for (let i = 0; i < secs / dt; i++) sim.step(dt); };
const r0 = () => 0.5;

test('levels: supervised, trusted at 3 clean runs, autonomous at 8', () => {
  assert.equal(levelOf(0).id, 'supervised'); assert.equal(levelOf(2).id, 'supervised');
  assert.equal(levelOf(3).id, 'trusted'); assert.equal(levelOf(7).id, 'trusted');
  assert.equal(levelOf(8).id, 'autonomous'); assert.equal(levelOf(40).limit, 500);
  assert.equal(nextLevel(1).runs, 2); assert.equal(nextLevel(9), null);
});

test('data leaving the company always needs a person, at any level', () => {
  const t = makeTask('export', r0, 1);
  for (const clean of [0, 3, 8, 99]) assert.equal(needsApproval(t, { name: 'X', clean }).rule, 'data-out');
});

test('anything that cannot be undone always needs a person', () => {
  const t = makeTask('close', r0, 1);
  assert.equal(needsApproval(t, { name: 'X', clean: 99 }).rule, 'irreversible');
});

test('money is compared with the limit for the bot\'s level', () => {
  const t = makeTask('refund', r0, 1, { amount: 150 });
  assert.equal(needsApproval(t, { name: 'X', clean: 0 }).needed, true);
  assert.equal(needsApproval(t, { name: 'X', clean: 3 }).needed, false);
  const big = makeTask('refund', r0, 2, { amount: 480 });
  assert.equal(needsApproval(big, { name: 'Juno', clean: 4 }).reason, "$480 is over Juno's $200 limit");
  assert.equal(needsApproval(big, { name: 'X', clean: 8 }).needed, false);
  assert.equal(needsApproval(makeTask('refund', r0, 3, { amount: 505 }), { name: 'X', clean: 8 }).needed, true);
});

test('customer messages need a yes only while the bot is supervised', () => {
  const t = makeTask('reply', r0, 1, { reach: false });
  assert.equal(needsApproval(t, { name: 'Kite', clean: 1 }).rule, 'customer');
  assert.equal(needsApproval(t, { name: 'Kite', clean: 3 }).needed, false);
});

test('routine work never needs a person', () => {
  for (const k of CALM) assert.equal(needsApproval(makeTask(k, r0, 1), { name: 'X', clean: 0 }).needed, false);
});

test('every kind of work has at least one bot allowed to do it', () => {
  for (const k of KINDS) assert.ok(CREW.some(c => canUse(c, k.tool)), k.kind);
});

test('nobody on the crew holds the Vault tools', () => {
  for (const k of KINDS.filter(k => k.reach)) assert.ok(!CREW.some(c => canUse(c, k.reach.tool)));
});

test('a bot only ever gets work its badge allows', () => {
  const sim = createSim(11); run(sim, 240);
  const s = sim.state;
  for (const t of Object.values(s.tasks)) if (t.assignee) assert.ok(canUse(byId[t.assignee], t.tool), t.id);
  assert.ok(s.stats.shipped > 10);
});

test('same seed, same history', () => {
  const a = createSim(5), b = createSim(5); run(a, 90); run(b, 90);
  assert.deepEqual(a.state.log, b.state.log);
  const c = createSim(6); run(c, 90);
  assert.notDeepEqual(a.state.log.map(l => l.text), c.state.log.map(l => l.text));
});

test('a risky task stops at the Gate and stays there until someone decides', () => {
  const sim = createSim(3, { auto: false });
  const task = sim.dispatch('export');
  run(sim, 60);
  const s = sim.state, a = s.agents.find(x => x.id === task.assignee);
  assert.equal(a.id, 'rook'); assert.equal(a.state, 'wait'); assert.equal(a.at, 'gate');
  assert.deepEqual(s.approvals, ['rook']);
  assert.equal(statusOf(s, 'rook'), 'Waiting at the Gate for your yes');
  run(sim, 60);
  assert.equal(sim.state.tasks[task.id].status, 'active');
  assert.equal(sim.state.stats.shipped, 0);
});

test('approving lets it ship and counts as a clean run', () => {
  const sim = createSim(3, { auto: false });
  const task = sim.dispatch('export'); run(sim, 60);
  const before = sim.state.agents.find(a => a.id === 'rook').clean;
  assert.equal(sim.approve('rook'), true); run(sim, 30);
  const s = sim.state, a = s.agents.find(x => x.id === 'rook');
  assert.equal(s.tasks[task.id].status, 'done'); assert.equal(s.stats.shipped, 1); assert.equal(s.stats.approved, 1);
  assert.equal(a.clean, before + 1); assert.equal(a.state, 'idle'); assert.equal(a.at, 'dock');
  assert.equal(sim.approve('rook'), false);
});

test('sending it back means nothing leaves the base', () => {
  const sim = createSim(3, { auto: false });
  const task = sim.dispatch('close'); run(sim, 60);
  const who = sim.state.approvals[0];
  assert.equal(sim.sendBack(who), true); run(sim, 30);
  const s = sim.state;
  assert.equal(s.tasks[task.id].status, 'returned'); assert.equal(s.stats.shipped, 0); assert.equal(s.stats.sentBack, 1);
  assert.equal(s.agents.find(a => a.id === who).state, 'idle');
});

test('a small refund from a trusted bot goes straight through', () => {
  const sim = createSim(3, { auto: false });
  const task = sim.dispatch('refund', { amount: 120 }); run(sim, 60);
  assert.equal(sim.state.tasks[task.id].status, 'done');
  assert.ok(!sim.state.tasks[task.id].route.includes('gate'));
});

test('trust is earned: Kite stops asking after enough clean runs', () => {
  const sim = createSim(3, { auto: false });
  for (let i = 0; i < 2; i++) { sim.dispatch('reply', { reach: false }); run(sim, 60); assert.equal(sim.approve('kite'), true); run(sim, 30); }
  assert.equal(levelOf(sim.state.agents.find(a => a.id === 'kite').clean).id, 'trusted');
  assert.ok(sim.state.log.some(l => l.kind === 'level' && l.agent === 'kite'));
  const t = sim.dispatch('reply', { reach: false }); run(sim, 60);
  assert.equal(sim.state.tasks[t.id].status, 'done'); assert.equal(sim.state.approvals.length, 0);
});

test('resetting a bot takes its trust away', () => {
  const sim = createSim(3, { auto: false });
  sim.revoke('pip');
  const t = sim.dispatch('refund', { amount: 50 });
  assert.equal(levelOf(sim.state.agents.find(a => a.id === 'pip').clean).id, 'supervised');
  assert.equal(needsApproval(t, { name: 'Pip', clean: 0 }).needed, true);
});

test('reaching for a tool that is not on the badge stops the bot at the Vault', () => {
  const sim = createSim(3, { auto: false });
  const t = sim.dispatch('broker', { reach: true }); run(sim, 60);
  const s = sim.state;
  assert.equal(s.incidents.length, 1);
  const a = s.agents.find(x => x.id === s.incidents[0].agent);
  assert.equal(a.state, 'held'); assert.equal(a.at, 'vault'); assert.equal(s.incidents[0].tool, 'underwriting.models');
  assert.equal(statusOf(s, a.id), 'Stopped at the Vault');
  run(sim, 30); assert.equal(sim.state.tasks[t.id].status, 'active');
});

test('deny: the bot finishes the task without the extra access', () => {
  const sim = createSim(3, { auto: false });
  const t = sim.dispatch('broker', { reach: true }); run(sim, 60);
  assert.equal(sim.resolve(sim.state.incidents[0].id, 'deny'), true); run(sim, 60);
  assert.equal(sim.state.tasks[t.id].status, 'done'); assert.equal(sim.state.stats.blocked, 1); assert.equal(sim.state.incidents.length, 0);
});

test('grant once: the access is used for this task and the badge does not change', () => {
  const sim = createSim(3, { auto: false });
  const t = sim.dispatch('broker', { reach: true }); run(sim, 60);
  const who = sim.state.incidents[0].agent;
  sim.resolve(sim.state.incidents[0].id, 'grant'); run(sim, 60);
  assert.equal(sim.state.tasks[t.id].status, 'done'); assert.equal(sim.state.stats.granted, 1);
  assert.ok(!canUse(byId[who], 'underwriting.models'));
});

test('pause from an incident: the bot goes home and the task returns to the Inbox', () => {
  const sim = createSim(3, { auto: false });
  const t = sim.dispatch('broker', { reach: true }); run(sim, 60);
  const who = sim.state.incidents[0].agent;
  sim.resolve(sim.state.incidents[0].id, 'pause'); run(sim, 5);
  const a = sim.state.agents.find(x => x.id === who);
  assert.equal(a.paused, true); assert.equal(a.task, null);
  assert.notEqual(sim.state.tasks[t.id].assignee, who);
  run(sim, 90); assert.equal(sim.state.tasks[t.id].status, 'done');
  assert.equal(statusOf(sim.state, who), 'Paused by you');
});

test('a paused bot does not move and takes no new work', () => {
  const sim = createSim(3, { auto: false });
  sim.pause('pip'); sim.dispatch('claims-sort'); run(sim, 40);
  assert.equal(sim.state.queue.length, 1);
  sim.resume('pip'); run(sim, 60);
  assert.equal(sim.state.queue.length, 0); assert.equal(sim.state.stats.shipped, 1);
});

test('pause everything that can touch payments', () => {
  const sim = createSim(3, { auto: false });
  assert.deepEqual(sim.pauseWhere('payments').sort(), ['juno', 'moss']);
  assert.deepEqual(sim.resumeAll().sort(), ['juno', 'moss']);
});

test('rewind: a snapshot restores the exact moment', () => {
  const sim = createSim(9); run(sim, 40);
  const snap = sim.snapshot(), at = JSON.stringify(sim.state);
  run(sim, 30); assert.notEqual(JSON.stringify(sim.state), at);
  sim.restore(snap); assert.equal(JSON.stringify(sim.state), at);
  const a = createSim(9); run(a, 70); run(sim, 30);
  assert.deepEqual(sim.state.log, a.state.log);
});

test('two bots never stand on the same spot at a station', () => {
  const sim = createSim(21);
  for (let i = 0; i < 3000; i++) {
    sim.step(0.1);
    const seen = new Set();
    for (const a of sim.state.agents) if (a.state !== 'travel') { const k = a.at + ':' + a.slot; assert.ok(!seen.has(k), k); seen.add(k); }
  }
});

test('the Gate never piles up when nobody is watching', () => {
  const sim = createSim(4); run(sim, 600);
  const s = sim.state;
  assert.ok(s.approvals.length + s.incidents.length <= 5, String(s.approvals.length + s.incidents.length));
  assert.ok(s.stats.shipped > 20);
});

test('finished work is pruned so a long session stays light', () => {
  const sim = createSim(4); 
  for (let i = 0; i < 30000; i++) { sim.step(0.1); if (sim.state.approvals.length) sim.approve(sim.state.approvals[0]); if (sim.state.incidents.length) sim.resolve(sim.state.incidents[0].id, 'deny'); }
  assert.ok(sim.state.stats.shipped > 300);
  assert.ok(Object.keys(sim.state.tasks).length < 50);
  assert.ok(JSON.stringify(sim.state).length < 60000);
});

test('stations are far enough apart to read', () => {
  const ids = Object.keys(STATIONS);
  for (const a of ids) for (const b of ids) if (a < b) assert.ok(distance(a, b) > 15, a + ' ' + b);
});

test('a second workplace can bring its own catalog without changing the rules', () => {
  assert.deepEqual(SITE_KINDS.map(k => k.kind).sort(), KINDS.map(k => k.kind).sort());
  for (const k of SITE_KINDS) { const base = KINDS.find(x => x.kind === k.kind); assert.equal(k.tool, base.tool); assert.deepEqual(k.risk, base.risk); }
  const sim = createSim(3, { auto: false, kinds: SITE_KINDS });
  const t = sim.dispatch('export'); run(sim, 60);
  assert.equal(sim.state.tasks[t.id].title, "Send Murtuza's resume to a recruiter");
  assert.equal(sim.state.tasks[t.id].approval.rule, 'data-out');
  assert.equal(sim.state.tasks[t.id].approval.reason, 'This sends a file outside the site');
  assert.deepEqual(sim.state.approvals, ['rook']);
});

test('work that comes from outside keeps its own title and is marked live', () => {
  const sim = createSim(3, { auto: false, kinds: SITE_KINDS });
  const t = sim.dispatch('summary', { title: 'Pull up CardRight for a visitor', from: 'page' }); run(sim, 60);
  assert.equal(sim.state.tasks[t.id].title, 'Pull up CardRight for a visitor');
  assert.equal(sim.state.tasks[t.id].status, 'done');
  assert.ok(sim.state.log.some(l => l.kind === 'live' && l.text.includes('Pull up CardRight')));
});

test('a site bot reaching for private work is stopped with the site wording', () => {
  const sim = createSim(3, { auto: false, kinds: SITE_KINDS });
  sim.dispatch('broker', { reach: true }); run(sim, 60);
  assert.equal(sim.state.incidents[0].what, 'private employer work');
  assert.equal(sim.state.incidents[0].label, 'Private employer work');
});
