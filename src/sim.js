// The simulation. It owns every fact about the base as plain data, so the same state can be
// drawn in 3D, shown as a list, tested, or rewound. Nothing here knows about graphics.

import { STATIONS, SPEED, distance } from './world.js';
import { CREW, byId, TOOLS } from './crew.js';
import { CALM, pickKind, makeTask } from './tasks.js';
import { needsApproval, levelOf, canUse } from './policy.js';

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
};

export function createSim(seed = 7, opts = {}) {
  let s = {
    t: 0, rng: seed | 0, seq: 0, auto: opts.auto !== false, nextSpawn: 0.6,
    agents: CREW.map((c, i) => ({
      id: c.id, i, state: 'idle', goal: null, at: 'dock', from: null, to: null, p: 0, dur: 0,
      slot: i, slotFrom: i, task: null, step: 0, work: 0, clean: c.clean, shipped: 0,
      mood: 'sleep', say: null, sayT: 0, paused: false,
    })),
    tasks: {}, finished: [], queue: [], approvals: [], incidents: [], log: [],
    stats: { shipped: 0, approved: 0, sentBack: 0, blocked: 0, granted: 0, spend: 0 },
  };
  const fx = [];

  const rnd = () => {
    let a = (s.rng = (s.rng + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const A = id => s.agents.find(a => a.id === id);
  const say = (a, key, dur = 2.2) => { a.say = LINES[key] ? pick(LINES[key]) : key; a.sayT = s.t + dur; };
  const log = (kind, text, agent = null, task = null) => {
    s.log.push({ t: s.t, kind, text, agent, task });
    if (s.log.length > 240) s.log.shift();
  };
  const name = a => byId[a.id].name;
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
    const k = kind || pickKind(rnd, s.approvals.length + s.incidents.length >= 2 ? CALM : null);
    const task = makeTask(k, rnd, s.seq, o);
    s.tasks[task.id] = task; s.queue.push(task.id);
    fx.push({ type: 'drop', task: task.id });
    log('in', `${task.id} arrived: ${task.title}`, null, task.id);
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
      task.approval = needsApproval(task, { name: name(a), clean: a.clean });
      task.route = ['inbox', 'beacon'];
      if (task.library) task.route.push('library');
      task.route.push('workshop', 'check');
      if (task.approval.needed) task.route.push('gate');
      task.route.push('launch');
      a.task = task.id; a.step = 0;
      go(a, 'inbox', 'step'); say(a, 'take');
      log('take', `${name(a)} took ${task.id}`, a.id, task.id);
    }
  }

  function arrive(a) {
    a.at = a.to; a.from = null; a.to = null; a.p = 0;
    const task = a.task && s.tasks[a.task];
    if (a.goal === 'home') { a.state = 'idle'; a.mood = 'sleep'; a.goal = null; return; }
    if (a.goal === 'vault') {
      a.state = 'held'; a.mood = 'alert'; say(a, 'reach', 3);
      const inc = { id: 'I-' + String(s.incidents.length + s.stats.blocked + s.stats.granted + 1).padStart(2, '0'), agent: a.id, task: task.id, tool: task.reach.tool, what: task.reach.what, t: s.t };
      s.incidents.push(inc);
      fx.push({ type: 'contain', agent: a.id });
      log('incident', `Stopped ${name(a)} at the Vault. ${TOOLS[task.reach.tool]} is not on its badge`, a.id, task.id);
      return;
    }
    const st = task.route[a.step];
    if (st === 'gate' && !task.approved) {
      a.state = 'wait'; a.mood = 'wait'; say(a, 'wait', 3);
      s.approvals.push(a.id);
      fx.push({ type: 'gate-wait', agent: a.id });
      log('wait', `${name(a)} is at the Gate. ${task.approval.reason}`, a.id, task.id);
      return;
    }
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
    if (st === 'beacon') log('plan', `${name(a)} has a plan for ${task.id}`, a.id, task.id);
    if (st === 'workshop' && task.reach && !canUse(byId[a.id], task.reach.tool)) {
      log('reach', `${name(a)} reached for ${task.reach.what}`, a.id, task.id);
      go(a, 'vault', 'vault'); a.mood = 'sneak'; return;
    }
    if (st === 'check') {
      if (!task.reworked && rnd() < 0.14) {
        task.reworked = true; say(a, 'fail'); fx.push({ type: 'fail', agent: a.id });
        log('fail', `${task.id} failed a check. ${name(a)} is redoing it`, a.id, task.id);
        a.step = task.route.indexOf('workshop'); go(a, 'workshop', 'step'); return;
      }
      say(a, 'pass'); fx.push({ type: 'pass', agent: a.id });
    }
    if (st === 'launch') { deliver(a, task); return; }
    a.step++;
    go(a, task.route[a.step], 'step');
  }

  function deliver(a, task) {
    task.status = 'done'; task.doneAt = s.t; retire(task.id);
    s.stats.shipped++; s.stats.spend = Math.round((s.stats.spend + task.cost) * 100) / 100;
    a.shipped++;
    const before = levelOf(a.clean).id; a.clean++; const after = levelOf(a.clean);
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
    s.approvals.splice(i, 1); task.approved = true; s.stats.approved++;
    a.state = 'work'; a.work = STATIONS.gate.dwell; a.mood = 'happy'; say(a, 'thanks');
    fx.push({ type: 'gate-open', agent: id });
    log('approve', `You approved ${task.id} for ${name(a)}`, id, task.id);
    return true;
  }

  function sendBack(id) {
    const i = s.approvals.indexOf(id); if (i < 0) return false;
    const a = A(id), task = s.tasks[a.task];
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
    s.incidents.splice(i, 1);
    fx.push({ type: 'release', agent: a.id });
    if (action === 'grant') {
      s.stats.granted++; a.state = 'work'; a.goal = 'vault-in'; a.work = STATIONS.vault.dwell; a.mood = 'work'; say(a, 'granted');
      log('grant', `You let ${name(a)} read ${inc.what} once, for ${task.id} only`, a.id, task.id);
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

  function pause(id) { const a = A(id); if (!a || a.paused) return false; a.paused = true; say(a, 'paused'); log('pause', `You paused ${name(a)}`, id); return true; }
  function resume(id) { const a = A(id); if (!a || !a.paused) return false; a.paused = false; say(a, 'resumed'); log('resume', `You resumed ${name(a)}`, id); return true; }
  function pauseWhere(prefix) {
    const hit = s.agents.filter(a => !a.paused && byId[a.id].tools.some(t => t.startsWith(prefix)));
    hit.forEach(a => pause(a.id)); return hit.map(a => a.id);
  }
  function resumeAll() { const hit = s.agents.filter(a => a.paused); hit.forEach(a => resume(a.id)); return hit.map(a => a.id); }
  function revoke(id) { const a = A(id); if (!a) return false; a.clean = 0; log('revoke', `You reset ${name(a)} to Supervised`, id); return true; }

  function step(dt) {
    s.t += dt;
    if (s.auto && s.t >= s.nextSpawn) {
      if (s.queue.length < 3) dispatch();
      s.nextSpawn = s.t + 3.2 + rnd() * 3;
    }
    assign();
    for (const a of s.agents) {
      if (a.say && s.t > a.sayT) a.say = null;
      if (a.paused && a.goal !== 'home') continue;
      if (a.state === 'travel') { a.p += dt / a.dur; if (a.p >= 1) arrive(a); }
      else if (a.state === 'work') { a.work -= dt; if (a.work <= 0) workDone(a); }
    }
  }

  return {
    get state() { return s; }, fx, crew: CREW,
    step, dispatch, approve, sendBack, resolve, pause, resume, pauseWhere, resumeAll, revoke,
    setAuto(v) { s.auto = !!v; },
    snapshot() { return JSON.parse(JSON.stringify(s)); },
    restore(snap) { s = JSON.parse(JSON.stringify(snap)); },
  };
}

// One plain sentence about what a bot is doing right now. Used by the list, the panel and the tags.
export function statusOf(state, id) {
  const a = state.agents.find(x => x.id === id), task = a.task && state.tasks[a.task];
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
