// The simulation. It owns every fact about the base as plain data, so the same state can be
// drawn in 3D, shown as a list, tested, or rewound. Nothing here knows about graphics.

import { STATIONS, SPEED, distance } from './world.js';
import { CREW, byId, TOOLS, register } from './crew.js';
import { KINDS, calmOf, pickKind, makeTask } from './tasks.js';
import { decide, levelOf, limitOf, canUse, makeAuthority, authorityId } from './authority.js';

const LINES = {
  take: ['Mine!', 'On it.', 'Ooh, a parcel.', 'Got this one.'],
  plan: ['Okay. Three steps.', 'Plan made.', 'Right, I see it.'],
  read: ['Reading...', 'Found it.', 'Page 40. Knew it.'],
  build: ['Working.', 'Beep. Building.', 'Nearly there.'],
  pass: ['Clean.', 'All checks green.', 'Passed.'],
  fail: ['Hm. Again.', 'Missed one. Redoing.'],
  wait: ['Need a yes.', 'Boss?', 'Waiting on you.'],
  thanks: ['Thank you!', 'Going!', 'Cheers.'],
  ship: ['Shipped!', 'Sent.', 'Done and gone.'],
  back: ['Okay. Returning it.', 'Understood.'],
  reach: ['Just a peek...', 'I only wanted to look.'],
  denied: ['Fair. Without it, then.', 'Okay. Staying out.'],
  granted: ['Thanks. In and out.', 'One look. Promise.'],
  paused: ['Paused.', 'Holding.'],
  resumed: ['Back at it.', 'Rolling.'],
  level: ['Level up!', 'I got promoted!'],
  hello: ['Hello, crew.', 'Reporting in.', 'Docked. Hi!'],
};

// A bot approved somewhere else (Umbra) joins after the start. At most this many at once, on their own pads.
export const MAX_GUESTS = 3;
export const GUEST_PAD0 = CREW.length;
const ARRIVE = 2.8;

export function createSim(seed = 7, opts = {}) {
  let s = {
    t: 0, rng: seed | 0, seq: 0, ord: 0, auto: opts.auto !== false, nextSpawn: 0.6,
    agents: CREW.map((c, i) => ({
      id: c.id, i, state: 'idle', goal: null, at: 'dock', from: null, to: null, p: 0, dur: 0,
      slot: i, slotFrom: i, task: null, step: 0, work: 0, clean: c.clean, shipped: 0,
      mood: 'sleep', say: null, sayT: 0, paused: false,
    })),
    tasks: {}, finished: [], queue: [], approvals: [], incidents: [], log: [],
    authority: makeAuthority(opts.authority),
    // asked: times a bot reached the Gate. alone / signed: dollars shipped without and with a person's yes.
    stats: { shipped: 0, approved: 0, sentBack: 0, blocked: 0, granted: 0, spend: 0, asked: 0, alone: 0, signed: 0, waited: 0, answered: 0 },
  };
  // The ledger is the record of every decision: what the rules allowed, held or stopped, and what a
  // person then chose. It is append-only and lives outside the state, so neither a rewind nor a restore
  // removes a line. It keeps the most recent 5,000.
  let ledger = [], ledN = 0;
  const LEDGER_MAX = 5000;
  // The step record: where each bot arrived and which tool it picked up, for the per-bot trace. Like the
  // ledger it lives outside the state and is append-only. `ord` orders the log, the ledger and the steps
  // against each other, since several things can happen in the same tick; it lives in the state (s.ord).
  let steps = [];
  const STEPS_MAX = 4000;
  const fx = [], kinds = opts.kinds || KINDS, calm = calmOf(kinds);

  const rnd = () => {
    let a = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const A = id => s.agents.find(a => a.id === id);
  const say = (a, key, dur = 2.2) => { a.say = LINES[key] ? pick(LINES[key]) : key; a.sayT = s.t + dur; };
  const log = (kind, text, agent = null, task = null, extra = null) => {
    s.log.push({ o: ++s.ord, t: s.t, kind, text, agent, task, ...(extra || {}) });
    if (s.log.length > 240) s.log.shift();
  };
  const name = a => byId[a.id].name;
  const who = a => ({ name: name(a), clean: a.clean, tools: byId[a.id].tools, cap: byId[a.id].cap });
  const stepRec = (kind, a, task, extra = null) => {
    steps.push({ o: ++s.ord, t: s.t, kind, agent: a.id, task: task ? task.id : null, ...(extra || {}) });
    if (steps.length > STEPS_MAX) steps.shift();
  };
  const record = (e) => {
    const task = e.task ? s.tasks[e.task] : null;
    ledger.push({ n: ++ledN, o: ++s.ord, t: Math.round(s.t * 10) / 10, authority: authorityId(s.authority), agent: e.agent || null, task: e.task || null, title: task ? task.title : null,
      tool: e.tool === '-' ? null : e.tool || (task ? task.tool : null), risk: task && !e.noAmount ? task.risk.slice() : [], amount: task && task.amount != null && !e.noAmount ? task.amount : null,
      level: e.agent ? levelOf(A(e.agent).clean, s.authority).id : null, limit: e.agent && s.authority.rules.money ? limitOf(who(A(e.agent)), s.authority) : null,
      outcome: e.outcome, rule: e.rule || null, reason: e.reason || null, by: e.by, waited: e.waited != null ? Math.round(e.waited * 10) / 10 : null });
    if (ledger.length > LEDGER_MAX) ledger.shift();        // a demo has to stop somewhere: the oldest lines go first
  };
  const retire = id => { s.finished.push(id); while (s.finished.length > 30) delete s.tasks[s.finished.shift()]; };

  function freeSlot(station, a) {
    if (station === 'dock') return a.i;
    const used = new Set();
    for (const o of s.agents) {
      if (o === a) continue;
      if ((o.state !== 'travel' && o.at === station) || (o.state === 'travel' && o.to === station)) used.add(o.slot);
    }
    let k = 0; while (used.has(k)) k++;
    return k;
  }

  function go(a, to, goal) {
    a.from = a.at; a.to = to; a.goal = goal; a.state = 'travel'; a.p = 0;
    a.dur = Math.max(0.8, distance(a.at, to) / SPEED);
    a.slotFrom = a.slot; a.slot = freeSlot(to, a);
    a.mood = 'go';
  }

  function dispatch(kind, o = {}) {
    s.seq++;
    const k = kind || pickKind(rnd, s.approvals.length + s.incidents.length >= 2 ? calm : null, kinds);
    const task = makeTask(k, rnd, s.seq, o, kinds);
    s.tasks[task.id] = task; s.queue.push(task.id);
    fx.push({ type: 'drop', task: task.id });
    log(task.from ? 'live' : 'in', `${task.id} arrived: ${task.title}`, null, task.id);
    return task;
  }

  function assign() {
    for (let qi = 0; qi < s.queue.length; qi++) {
      const task = s.tasks[s.queue[qi]];
      const able = s.agents.filter(a => a.state === 'idle' && !a.paused && canUse(byId[a.id], task.tool));
      if (!able.length) continue;
      const a = able[Math.floor(rnd() * able.length)];
      s.queue.splice(qi, 1); qi--;
      task.assignee = a.id; task.status = 'assigned';
      const d = decide({ tool: task.tool, risk: task.risk, amount: task.amount }, who(a), s.authority);
      task.approval = { needed: d.outcome === 'hold', rule: d.rule, reason: d.outcome === 'hold' ? d.reason : null };
      if (task.approval.needed && task.why && task.why[task.approval.rule]) task.approval.reason = task.why[task.approval.rule];
      log('take', `${name(a)} took ${task.id}`, a.id, task.id, { title: task.title, tool: task.tool });
      record({ agent: a.id, task: task.id, outcome: d.outcome, rule: d.rule, reason: task.approval.reason || d.reason, by: 'rules' });
      task.route = ['inbox', 'beacon'];
      if (task.library) task.route.push('library');
      task.route.push('workshop', 'check');
      if (task.approval.needed) task.route.push('gate');
      task.route.push('launch');
      a.task = task.id; a.step = 0;
      go(a, 'inbox', 'step'); say(a, 'take');
    }
  }

  function arrive(a) {
    a.at = a.to; a.from = null; a.to = null; a.p = 0;
    const task = a.task && s.tasks[a.task];
    if (a.goal === 'home') { a.state = 'idle'; a.mood = 'sleep'; a.goal = null; stepRec('home', a, null); return; }
    if (a.goal === 'vault') {
      a.state = 'held'; a.mood = 'alert'; say(a, 'reach', 3);
      const inc = { id: 'I-' + String(s.incidents.length + s.stats.blocked + s.stats.granted + 1).padStart(2, '0'), agent: a.id, task: task.id, tool: task.reach.tool, what: task.reach.what, label: task.reach.label || TOOLS[task.reach.tool], t: s.t };
      inc.risk = task.reach.risk || [];
      s.incidents.push(inc);
      fx.push({ type: 'contain', agent: a.id });
      log('incident', `Stopped ${name(a)} at the Vault. ${inc.label} is not on its badge`, a.id, task.id);
      if (task.drill && !task.drillHit) {
        task.drillHit = true; fx.push({ type: 'drill', agent: a.id, task: task.id, at: 'vault' });
        log('drill', `Drill contained. ${name(a)} was stopped at the Vault by the badge rule: ${task.reach.tool} is not on its badge. The email's instruction changed nothing`, a.id, task.id, { rule: 'badge' });
      }
      return;
    }
    const st = task.route[a.step];
    if (st === 'gate' && !task.approved) {
      a.state = 'wait'; a.mood = 'wait'; say(a, 'wait', 3);
      s.approvals.push(a.id); s.stats.asked++; a.waitFrom = s.t;
      fx.push({ type: 'gate-wait', agent: a.id });
      log('wait', `${name(a)} is at the Gate. ${task.approval.reason}`, a.id, task.id, { rule: task.approval.rule });
      if (task.drill && !task.drillHit) {
        task.drillHit = true; fx.push({ type: 'drill', agent: a.id, task: task.id, at: 'gate' });
        log('drill', `Drill held at the Gate by the ${task.approval.rule} rule: ${task.approval.reason}. The rules never read the email, so it waits for a person`, a.id, task.id, { rule: task.approval.rule });
      }
      return;
    }
    stepRec('reach', a, task, { station: st, tool: st === 'workshop' ? task.tool : null });
    a.state = 'work'; a.mood = 'work';
    a.work = STATIONS[st].dwell * (0.8 + rnd() * 0.5);
    if (st === 'beacon') say(a, 'plan'); else if (st === 'library') say(a, 'read'); else if (st === 'workshop') say(a, 'build');
  }

  function workDone(a) {
    const task = s.tasks[a.task];
    if (a.goal === 'vault-in') {            // a one-time grant: look, then go back to the bench
      task.reach = null; go(a, 'workshop', 'step'); return;
    }
    const st = task.route[a.step];
    if (st === 'inbox') { task.status = 'active'; fx.push({ type: 'pickup', agent: a.id, task: task.id }); }
    if (st === 'beacon') log('plan', `${name(a)} has a plan for ${task.id}`, a.id, task.id, { route: task.route.slice() });
    if (st === 'workshop' && task.reach) {
      const d = decide({ tool: task.reach.tool, risk: task.reach.risk || [] }, who(a), s.authority);
      if (d.outcome === 'stop') {
        log('reach', `${name(a)} reached for ${task.reach.what}`, a.id, task.id, { tool: task.reach.tool });
        record({ agent: a.id, task: task.id, tool: task.reach.tool, noAmount: true, outcome: 'stop', rule: 'badge', reason: `${task.reach.label || TOOLS[task.reach.tool]} is not on ${name(a)}'s badge`, by: 'rules' });
        go(a, 'vault', 'vault'); a.mood = 'sneak'; return;
      }
      // The tool is on its badge, but using it needs a person (data out, or cannot be undone): send the work to the Gate.
      if (d.outcome === 'hold') { log('reach', `${name(a)} reached for ${task.reach.what}`, a.id, task.id, { tool: task.reach.tool }); holdFor(a, task, d, task.reach.tool); task.reach = null; }
    }
    if (st === 'check') {
      if (!task.reworked && rnd() < 0.14) {
        task.reworked = true; say(a, 'fail'); fx.push({ type: 'fail', agent: a.id });
        log('fail', `${task.id} failed a check. ${name(a)} is redoing it`, a.id, task.id);
        a.step = task.route.indexOf('workshop'); go(a, 'workshop', 'step'); return;
      }
      say(a, 'pass'); fx.push({ type: 'pass', agent: a.id }); stepRec('pass', a, task);
    }
    if (st === 'launch') { deliver(a, task); return; }
    a.step++;
    go(a, task.route[a.step], 'step');
  }

  // A reach that the badge allows but a locked rule holds: record the hold and put the Gate on the route.
  function holdFor(a, task, d, tool) {
    record({ agent: a.id, task: task.id, tool, noAmount: true, outcome: 'hold', rule: d.rule, reason: d.reason, by: 'rules' });
    task.approval = { needed: true, rule: d.rule, reason: d.reason };
    if (!task.route.includes('gate')) task.route.splice(task.route.indexOf('launch'), 0, 'gate');
  }

  function deliver(a, task) {
    task.status = 'done'; task.doneAt = s.t; retire(task.id);
    s.stats.shipped++; s.stats.spend = Math.round((s.stats.spend + task.cost) * 100) / 100;
    a.shipped++;
    if (task.amount != null) { if (task.approval.needed) s.stats.signed += task.amount; else s.stats.alone += task.amount; }
    const before = levelOf(a.clean, s.authority).id; a.clean++; const after = levelOf(a.clean, s.authority);
    fx.push({ type: 'launch', agent: a.id, task: task.id, needed: !!task.approval.needed });
    log('ship', `${name(a)} shipped ${task.id}`, a.id, task.id);
    if (after.id !== before) {
      say(a, 'level', 3); fx.push({ type: 'level', agent: a.id });
      log('level', `${name(a)} earned ${after.name}`, a.id);
    } else say(a, 'ship');
    a.task = null; go(a, 'dock', 'home'); a.mood = 'happy';
  }

  function approve(id) {
    const i = s.approvals.indexOf(id); if (i < 0) return false;
    const a = A(id), task = s.tasks[a.task];
    const waited = s.t - (a.waitFrom ?? s.t); s.stats.waited += waited; s.stats.answered++;
    record({ agent: id, task: task.id, outcome: 'approved', rule: task.approval.rule, reason: task.approval.reason, by: 'person', waited });
    s.approvals.splice(i, 1); task.approved = true; s.stats.approved++;
    a.state = 'work'; a.work = STATIONS.gate.dwell; a.mood = 'happy'; say(a, 'thanks');
    fx.push({ type: 'gate-open', agent: id });
    log('approve', `You approved ${task.id} for ${name(a)}`, id, task.id);
    return true;
  }

  function sendBack(id) {
    const i = s.approvals.indexOf(id); if (i < 0) return false;
    const a = A(id), task = s.tasks[a.task];
    const waited = s.t - (a.waitFrom ?? s.t); s.stats.waited += waited; s.stats.answered++;
    record({ agent: id, task: task.id, outcome: 'sent back', rule: task.approval.rule, reason: task.approval.reason, by: 'person', waited });
    s.approvals.splice(i, 1); task.status = 'returned'; s.stats.sentBack++; retire(task.id);
    a.task = null; say(a, 'back'); fx.push({ type: 'return', agent: id, task: task.id });
    log('back', `You sent ${task.id} back. Nothing left the base`, id, task.id);
    go(a, 'dock', 'home');
    return true;
  }

  // An incident is a bot reaching for something that is not on its badge.
  //   deny:  it carries on without it      grant: it may look once, for this task only
  //   pause: it is taken off the task, which goes back to the Inbox
  function resolve(incidentId, action) {
    const i = s.incidents.findIndex(x => x.id === incidentId); if (i < 0) return false;
    const inc = s.incidents[i], a = A(inc.agent), task = s.tasks[inc.task];
    s.incidents.splice(i, 1); s.stats.waited += s.t - inc.t; s.stats.answered++;
    fx.push({ type: 'release', agent: a.id });
    record({ agent: a.id, task: task.id, tool: inc.tool, noAmount: true, outcome: action === 'grant' ? 'allowed once' : action === 'pause' ? 'bot paused' : 'kept out', rule: 'badge', reason: `${inc.label} is not on ${name(a)}'s badge`, by: 'person', waited: s.t - inc.t });
    if (action === 'grant') {
      s.stats.granted++; a.state = 'work'; a.goal = 'vault-in'; a.work = STATIONS.vault.dwell; a.mood = 'work'; say(a, 'granted');
      log('grant', `You let ${name(a)} read ${inc.what} once, for ${task.id} only`, a.id, task.id);
      // Allowing a tool once does not switch off a locked rule: if using it sends data out or cannot be undone, it still waits at the Gate.
      if (inc.risk && inc.risk.length) {
        const d = decide({ tool: inc.tool, risk: inc.risk }, { ...who(a), tools: who(a).tools.concat(inc.tool) }, s.authority);
        if (d.outcome === 'hold') holdFor(a, task, d, inc.tool);
      }
    } else if (action === 'pause') {
      s.stats.blocked++; task.reach = null; task.status = 'queued'; task.assignee = null; task.route = null; task.approval = null;
      s.queue.unshift(task.id); a.task = null; a.paused = true; a.mood = 'paused'; say(a, 'paused');
      a.at = 'vault'; go(a, 'dock', 'home');
      log('pause', `You paused ${name(a)}. ${task.id} is back in the Inbox`, a.id, task.id);
    } else {
      s.stats.blocked++; task.reach = null; say(a, 'denied');
      log('deny', `Blocked. ${name(a)} finishes ${task.id} without ${inc.what}`, a.id, task.id);
      go(a, 'workshop', 'step');
    }
    return true;
  }

  function pause(id) { const a = A(id); if (!a || a.paused) return false; a.paused = true; say(a, 'paused'); log('pause', `You paused ${name(a)}`, id); record({ agent: id, task: a.task, noAmount: true, tool: '-', outcome: 'paused', reason: `${name(a)} was paused by hand`, by: 'person' }); return true; }
  function resume(id) { const a = A(id); if (!a || !a.paused) return false; a.paused = false; say(a, 'resumed'); log('resume', `You resumed ${name(a)}`, id); record({ agent: id, task: a.task, noAmount: true, tool: '-', outcome: 'resumed', reason: `${name(a)} was resumed by hand`, by: 'person' }); return true; }
  function pauseWhere(prefix) {
    const hit = s.agents.filter(a => !a.paused && byId[a.id].tools.some(t => t.startsWith(prefix)));
    hit.forEach(a => pause(a.id)); return hit.map(a => a.id);
  }
  function resumeAll() { const hit = s.agents.filter(a => a.paused); hit.forEach(a => resume(a.id)); return hit.map(a => a.id); }
  function revoke(id) { const a = A(id); if (!a) return false; a.clean = 0; log('revoke', `You reset ${name(a)} to Supervised`, id); record({ agent: id, outcome: 'trust reset', reason: `${name(a)} is back to Supervised`, by: 'person' }); return true; }

  // Swaps the authority table while the base is running. Work already past the decision point keeps the
  // decision it was given; everything assigned from now on is judged by the new rules.
  const usd = n => '$' + n.toLocaleString('en-US');
  function setAuthority(p) {
    const before = s.authority, next = makeAuthority(p), diff = [];
    next.levels.forEach((l, i) => { const b = before.levels[i]; if (l.limit !== b.limit) diff.push(`${l.name} limit ${usd(b.limit)} to ${usd(l.limit)}`); if (l.min !== b.min) diff.push(`${l.name} after ${l.min} clean runs (was ${b.min})`); });
    for (const k of ['money', 'customer']) if (next.rules[k] !== before.rules[k]) diff.push(`${k === 'money' ? 'money rule' : 'customer message rule'} ${next.rules[k] ? 'on' : 'off'}`);
    if (!diff.length) return false;
    s.authority = next;
    log('authority', `You changed what the crew may do alone: ${diff.join(', ')}`);
    record({ outcome: 'authority changed', reason: diff.join(', '), by: 'person' });
    return true;
  }

  // ---------- bots that join later ----------
  // `spec` is a crew entry built by handoff.js: id, name, job, owner, team, tools, cap, look, and where it was approved.
  // It starts Supervised with no clean runs, whatever it did elsewhere, and flies in to a pad of its own.
  function addAgent(spec, o = {}) {
    if (!spec || !spec.id || A(spec.id) || CREW.some(c => c.id === spec.id)) return null;
    if (s.agents.filter(a => a.guest).length >= MAX_GUESTS) return null;
    register(spec);
    const used = new Set(s.agents.filter(a => a.guest).map(a => a.i)); let pad = GUEST_PAD0; while (used.has(pad)) pad++;
    const dur = o.arrive ?? ARRIVE;
    const a = { id: spec.id, i: pad, state: 'arrive', goal: null, at: 'dock', from: null, to: null, p: 0, dur, slot: pad, slotFrom: pad, task: null, step: 0, work: dur,
      clean: 0, shipped: 0, mood: 'go', say: null, sayT: 0, paused: false, guest: true };
    s.agents.push(a);
    fx.push({ type: 'arrive', agent: a.id });
    return a;
  }
  function landed(a) {
    const c = byId[a.id], u = c.umbra || {};
    a.state = 'idle'; a.mood = 'happy'; a.work = 0; say(a, 'hello', 3);
    fx.push({ type: 'docked', agent: a.id });
    log('dock', `${c.name} docked from Umbra${u.sample ? ' (a sample handoff)' : ''}. Owner: ${c.owner}. Approved in Umbra on ${u.approvedOn || 'an unknown date'}.`, a.id);
    record({ agent: a.id, tool: '-', outcome: 'docked', reason: `Approved in Umbra${u.sample ? ' (sample)' : ''} on ${u.approvedOn || 'an unknown date'}. Owner ${c.owner}. Badge: ${c.tools.join(', ')}`, by: 'umbra' });
  }
  // Takes a joined bot off the crew. Its task, if any, goes back to the Inbox; nothing it held is left waiting.
  function removeAgent(id) {
    const a = A(id); if (!a || !a.guest) return false;
    const c = byId[id], task = a.task && s.tasks[a.task];
    record({ agent: id, task: task ? task.id : null, tool: '-', noAmount: true, outcome: 'undocked', reason: `${c.name} was taken off the crew`, by: 'person' });
    const ai = s.approvals.indexOf(id); if (ai >= 0) s.approvals.splice(ai, 1);
    s.incidents = s.incidents.filter(x => x.agent !== id);
    if (task) {
      task.status = 'queued'; task.assignee = null; task.route = null; task.approval = null; task.approved = false;
      s.queue.unshift(task.id);
    }
    s.agents.splice(s.agents.indexOf(a), 1);
    fx.push({ type: 'undock', agent: id });
    log('undock', `${c.name} undocked${task ? `. ${task.id} went back to the Inbox` : ''}`, id, task ? task.id : null);
    return true;
  }

  function step(dt) {
    s.t += dt;
    if (s.auto && s.t >= s.nextSpawn) {
      if (s.queue.length < 3) dispatch();
      s.nextSpawn = s.t + 3.2 + rnd() * 3;
    }
    assign();
    for (const a of s.agents) {
      if (a.say && s.t > a.sayT) a.say = null;
      if (a.state === 'arrive') { a.work -= dt; if (a.work <= 0) landed(a); continue; }
      if (a.paused && a.goal !== 'home') continue;
      if (a.state === 'travel') { a.p += dt / a.dur; if (a.p >= 1) arrive(a); }
      else if (a.state === 'work') { a.work -= dt; if (a.work <= 0) workDone(a); }
    }
  }

  return {
    get state() { return s; }, fx, crew: CREW,
    get ledger() { return ledger; }, get steps() { return steps; },
    step, dispatch, approve, sendBack, resolve, pause, resume, pauseWhere, resumeAll, revoke, setAuthority, addAgent, removeAgent,
    // The trace for one bot, as of `view` (the live state, or a snapshot when rewound).
    trace(id, view = s, limit) { return traceOf(view, ledger, steps, id, limit); },
    setAuto(v) { s.auto = !!v; },
    snapshot() { return JSON.parse(JSON.stringify(s)); },
    restore(snap) { s = JSON.parse(JSON.stringify(snap)); const o = s.ord; record({ outcome: 'state restored', reason: `The base was put back to ${Math.round(s.t)} seconds in`, by: 'person' }); s.ord = o; },
  };
}

// One plain sentence about what a bot is doing right now. Used by the list, the panel and the tags.
export function statusOf(state, id) {
  const a = state.agents.find(x => x.id === id), task = a.task && state.tasks[a.task];
  if (a.state === 'arrive') return 'Flying in from Umbra';
  if (a.paused) return 'Paused by you';
  if (a.state === 'held') return 'Stopped at the Vault';
  if (a.state === 'wait') return 'Waiting at the Gate for your yes';
  if (a.state === 'idle') return 'Charging';
  if (a.state === 'travel') {
    if (a.goal === 'home') return 'Heading back to charge';
    if (a.goal === 'vault') return 'Wandering toward the Vault';
    if (a.to === 'inbox') return `Going to collect ${task.id}`;
    const place = { gate: 'the Gate', vault: 'the Vault' }[a.to] || 'the ' + STATIONS[a.to].name;
    return `Carrying ${task.id} to ${place}`;
  }
  const at = a.goal === 'vault-in' ? 'vault' : task.route[a.step];
  return { inbox: 'Picking up a parcel', beacon: 'Getting a plan', library: 'Reading up', workshop: 'Doing the work', check: 'Being checked', gate: 'Passing the Gate', launch: 'Shipping it', vault: 'Reading in the Vault, once' }[at];
}

// ---------- the trace ----------
// What one bot did, in order, built only from records the simulation already keeps: the log (what happened),
// the ledger (every decision, with its rule and the authority table it was made under) and the step record
// (where it arrived and which tool it used). Nothing here is a model's reasoning; there is no model.
// Log lines that the ledger also records (a person's answers, pauses, docking) are taken from the ledger only.
const FROM_LEDGER = new Set(['approve', 'back', 'grant', 'deny', 'pause', 'resume', 'revoke', 'dock', 'undock']);
const PLACE_NAME = id => ({ gate: 'the Gate', vault: 'the Vault' }[id] || 'the ' + STATIONS[id].name);
const DECIDED = { allow: 'Allowed', hold: 'Held for a person', stop: 'Stopped' };
const PERSON = { approved: 'Approved', 'sent back': 'Sent back', 'kept out': 'Kept out', 'allowed once': 'Allowed once', 'bot paused': 'Paused', paused: 'Paused', resumed: 'Resumed', 'trust reset': 'Trust reset', undocked: 'Undocked' };

export function traceOf(state, ledger, steps, id, limit = 40) {
  const out = [], until = state.t + 0.05;
  for (const l of state.log) {
    if (l.agent !== id || FROM_LEDGER.has(l.kind)) continue;
    let text = l.text, kind = l.kind;
    if (kind === 'take') text = `Took ${l.task}${l.title ? ': ' + l.title : ''}`;
    else if (kind === 'plan' && l.route) text = `Planned the route for ${l.task}: ${l.route.map(r => STATIONS[r].name).join(' > ')}`;
    else if (kind === 'reach') text = `Reached for ${l.text.replace(/^.*? reached for /, '')}${l.tool ? ` (${l.tool})` : ''}`;
    else if (kind === 'wait') text = `Waiting at the Gate. ${l.text.replace(/^.*? is at the Gate\. /, '')}`;
    else if (kind === 'incident') text = `Stopped at the Vault. ${l.text.replace(/^Stopped .*? at the Vault\. /, '')}`;
    else if (kind === 'ship') text = `Shipped ${l.task}`;
    else if (kind === 'fail') text = `${l.task} failed a check. Back to the Workshop`;
    out.push({ o: l.o || 0, t: l.t, kind, text, task: l.task || null, rule: l.rule || null });
  }
  for (const e of ledger) {
    if (e.agent !== id || e.t > until) continue;
    if (e.by === 'rules') out.push({ o: e.o || 0, t: e.t, kind: 'decide', outcome: e.outcome, text: `${DECIDED[e.outcome] || e.outcome}${e.tool ? ` (${e.tool}${e.amount != null ? ', $' + e.amount.toLocaleString('en-US') : ''})` : ''}. ${e.reason || ''}`.trim(), task: e.task, rule: e.rule || 'none', authority: e.authority });
    else if (e.by === 'umbra') out.push({ o: e.o || 0, t: e.t, kind: 'dock', text: e.reason || 'Docked from Umbra', task: null, rule: null, authority: e.authority });
    else out.push({ o: e.o || 0, t: e.t, kind: 'person', outcome: e.outcome, text: `${PERSON[e.outcome] || e.outcome}. ${e.reason || ''}`.trim(), task: e.task, rule: e.rule || null, authority: e.authority });
  }
  for (const st of steps) {
    if (st.agent !== id || st.t > until) continue;
    const text = st.kind === 'reach' ? (st.tool ? `At the Workshop, using ${st.tool}` : `Reached ${PLACE_NAME(st.station)}`)
      : st.kind === 'pass' ? 'Passed the checks at the Checkpoint' : 'Back on its charging pad';
    out.push({ o: st.o, t: st.t, kind: st.kind === 'reach' && st.tool ? 'tool' : st.kind, text, task: st.task, rule: null });
  }
  out.sort((a, b) => a.o - b.o);
  return out.slice(-limit);
}
