// The panels that sit on top of the scene. Each function returns HTML for one panel from the
// same state the 3D view draws, so the list and the world can never disagree.
import { CREW, byId, TOOLS, STATIONS, LEVELS, levelOf, nextLevel, statusOf } from '../src/index.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// A workplace can rename the crew's jobs, reword the panels and set the clock.
let META = {}, WORDS = { does: {}, vault: ['Full customer records', 'Underwriting models'], rules: null }, CLOCK0 = 9 * 3600;
export const setTheme = (meta, words) => { META = meta || {}; WORDS = { ...WORDS, ...(words || {}) }; };
export const setClock = seconds => { CLOCK0 = seconds; };
const who = id => META[id] ? { ...byId[id], ...META[id] } : byId[id];
export const clock = t => { const s = Math.floor(CLOCK0 + t); return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':'); };
const av = c => `<i class="av" style="--c:${c}"></i>`;
const pips = clean => { const n = LEVELS.indexOf(levelOf(clean)) + 1; return `<span class="lv" title="${levelOf(clean).name}">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
const flag = (v, a) => v.approvals.includes(a.id) ? 'need' : v.incidents.some(i => i.agent === a.id) ? 'held' : a.paused ? 'paused' : '';

export function stats(v, sim) {
  const working = v.agents.filter(a => a.task).length, need = v.approvals.length + v.incidents.length;
  return (sim ? `<div class="st simc"><span>Simulated crew</span></div>` : '') + `<div class="st"><b>${working}</b><span>working</span></div><div class="st ship"><b>${v.stats.shipped}</b><span>shipped</span></div>` +
    `<div class="st need ${need ? 'on' : ''}" data-act="need" ${need ? 'role="button" tabindex="0"' : ''}><b>${need}</b><span>need you</span></div>` +
    `<div class="st spend"><b>$${v.stats.spend.toFixed(2)}</b><span>spent</span></div>`;
}

const PLACE = { inbox: 'Inbox', beacon: 'Briefing', library: 'Library', workshop: 'Workshop', check: 'Checkpoint', gate: 'Gate', launch: 'Launchpad', dock: 'Dock', vault: 'Vault' };
function brief(v, a) {
  if (a.paused) return 'Paused';
  if (a.state === 'held') return 'Stopped at the Vault';
  if (a.state === 'wait') return 'Needs your yes';
  if (a.state === 'idle') return 'Charging';
  if (a.state === 'travel') return a.goal === 'home' ? 'Heading home' : a.goal === 'vault' ? 'Drifting to the Vault' : 'To the ' + PLACE[a.to];
  return statusOf(v, a.id);
}

export function crew(v, sel) {
  return `<h2>Crew<span>${CREW.length} bots</span></h2>` + v.agents.map(a => {
    const c = byId[a.id];
    return `<button type="button" class="cw ${flag(v, a)} ${sel && sel.type === 'bot' && sel.id === a.id ? 'sel' : ''}" data-bot="${a.id}" style="--c:${c.color}">${av(c.color)}<span class="n"><b>${c.name}</b><em>${esc(brief(v, a))}</em></span>${pips(a.clean)}</button>`;
  }).join('');
}

const NAMES = { inbox: 'Inbox', beacon: 'Briefing', library: 'Library', workshop: 'Workshop', check: 'Checkpoint', gate: 'Gate', launch: 'Launchpad' };

function botPanel(v, id, past) {
  const a = v.agents.find(x => x.id === id), c = who(id), task = a.task && v.tasks[a.task], lv = levelOf(a.clean), nx = nextLevel(a.clean), li = LEVELS.indexOf(lv);
  const route = task && task.route ? `<ol class="route">${task.route.map((s, i) => `<li class="${i < a.step ? 'done' : i === a.step ? 'cur' : ''} ${s === 'gate' ? 'g' : ''}">${NAMES[s]}</li>`).join('')}</ol>` : '';
  const limit = lv.limit ? `Moves up to $${lv.limit} without asking.` : 'Asks before moving any money or messaging a customer.';
  return `<div class="in-h" style="--c:${c.color}">${av(c.color)}<div><b>${c.name}</b><span>${esc(c.job)}. Owned by ${esc(c.owner)}${c.team ? ', ' + esc(c.team) : ''}</span></div><button type="button" class="x" data-act="close" aria-label="Close">&times;</button></div>
  <p class="quirk">${esc(c.quirk)}</p>
  <div class="now"><small>Right now</small><b>${esc(statusOf(v, id))}</b>${task ? `<span class="task"><code>${task.id}</code> ${esc(task.title)}</span>` : `<span class="task">No task. ${a.shipped} shipped so far.</span>`}</div>
  ${route}
  <div class="lvl" style="--c:${c.color}"><small>Trust, earned by clean runs</small><div class="lvbar">${LEVELS.map((l, i) => `<i class="${i <= li ? 'on' : ''}"></i>`).join('')}</div><b>${lv.name}</b><span>${limit} ${nx ? `${nx.runs} more clean run${nx.runs > 1 ? 's' : ''} to ${nx.level.name}.` : 'Top level.'}</span></div>
  <div class="badge"><small>Badge: what it may touch</small><ul>${c.tools.map(t => `<li>${esc(TOOLS[t])}</li>`).join('')}</ul></div>
  <div class="acts">${past ? '' : `<button type="button" class="btn sm ${a.paused ? 'pri' : ''}" data-act="${a.paused ? 'resume' : 'pause'}" data-id="${id}">${a.paused ? 'Resume' : 'Pause'}</button>${a.clean > 0 ? `<button type="button" class="btn sm ghost" data-act="revoke" data-id="${id}">Reset trust</button>` : ''}`}</div>`;
}

const RULES = ['Data leaving the company: always.', 'Anything that cannot be undone: always.', 'Money over the bot\'s limit: $0, $200 or $500 by trust level.', 'Customer messages: only while a bot is Supervised.'];

function stationPanel(v, id) {
  const s = STATIONS[id];
  const here = v.agents.filter(a => (a.state !== 'travel' && a.at === id));
  let extra = '';
  if (id === 'inbox') extra = `<div><small>Waiting for a bot</small><div class="q">${v.queue.length ? v.queue.map(t => `<div><code>${t}</code>${esc(v.tasks[t].title)}</div>`).join('') : '<div>Nothing waiting.</div>'}</div></div>`;
  if (id === 'gate') extra = `<div><small>When a person has to say yes</small><ul class="rules">${(WORDS.rules || RULES).map(r => `<li>${r}</li>`).join('')}</ul></div><p>${v.stats.approved} approved, ${v.stats.sentBack} sent back.</p>`;
  if (id === 'vault') extra = `<div><small>Inside</small><ul class="rules">${WORDS.vault.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><p>Nobody on the crew holds a key. ${v.stats.blocked} kept out, ${v.stats.granted} let in once.</p>`;
  if (id === 'check') extra = `<p>Work that fails goes back to the Workshop and is checked again.</p>`;
  if (id === 'launch') extra = `<p>${v.stats.shipped} shipped today, costing $${v.stats.spend.toFixed(2)} in model use.</p>`;
  return `<div class="in-h" style="--c:${s.color}"><i class="dot"></i><div><b>${s.name}</b><span>Station</span></div><button type="button" class="x" data-act="close" aria-label="Close">&times;</button></div>
  <p>${esc(WORDS.does[id] || s.does)}</p>${extra}
  <div><small>Here now</small><div class="who">${here.length ? here.map(a => `<button type="button" data-bot="${a.id}" style="--c:${byId[a.id].color}">${byId[a.id].name}</button>`).join('') : '<p>Nobody.</p>'}</div></div>`;
}

export function inspect(v, sel, past) {
  if (!sel) return '';
  return sel.type === 'bot' ? botPanel(v, sel.id, past) : stationPanel(v, sel.id);
}

export function alerts(v, past, ago, max = 2) {
  if (past) return `<div class="al"><i class="av" style="--c:#FFC857"></i><div class="t"><b>You are looking at ${ago} seconds ago</b><span>Drag the timeline to move through it. Nothing changes while you look.</span></div><div class="b"><button type="button" class="btn pri" data-act="live">Back to live</button></div></div>`;
  const cards = [];
  for (const inc of v.incidents) {
    const c = byId[inc.agent];
    cards.push(`<div class="al inc">${av(c.color)}<div class="t"><b>${c.name} was stopped at the Vault</b><span>It reached for ${esc(inc.what)} to finish <code>${inc.task}</code>.</span><em>${esc(inc.label || TOOLS[inc.tool])} is not on its badge</em></div><div class="b"><button type="button" class="btn pri" data-res="${inc.id}:deny">Keep it out</button><button type="button" class="btn ghost" data-res="${inc.id}:grant">Allow once</button><button type="button" class="btn ghost" data-res="${inc.id}:pause">Pause ${c.name}</button></div></div>`);
  }
  for (const id of v.approvals) {
    const a = v.agents.find(x => x.id === id), c = byId[id], t = v.tasks[a.task];
    cards.push(`<div class="al">${av(c.color)}<div class="t"><b>${c.name} needs a yes</b><span><code>${t.id}</code> ${esc(t.title)}</span><em>${esc(t.approval.reason)}</em></div><div class="b"><button type="button" class="btn pri" data-approve="${id}">Approve</button><button type="button" class="btn ghost" data-back="${id}">Send back</button><button type="button" class="btn ghost" data-bot="${id}">Show me</button></div></div>`);
  }
  const more = cards.length - max;
  return cards.slice(0, max).join('') + (more > 0 ? `<div class="more">${more} more waiting</div>` : '');
}

export function radio(v) {
  return v.log.slice(-4).map(l => `<p class="k-${l.kind}"><time>${clock(l.t)}</time>${esc(l.text)}</p>`).join('');
}

export function list(v, past) {
  const rows = v.agents.map(a => {
    const c = who(a.id), lv = levelOf(a.clean), task = a.task && v.tasks[a.task], need = v.approvals.includes(a.id), inc = v.incidents.find(x => x.agent === a.id);
    return `<div class="tr ${flag(v, a)}"><span class="nm">${av(c.color)}${c.name}</span><span>${esc(c.job)}</span><span class="do">${esc(statusOf(v, a.id))}${task ? `<em>${esc(task.title)}</em>` : ''}</span><span>${lv.name}</span><span class="num">$${lv.limit}</span><span class="num">${a.shipped}</span><span class="ac">${past ? '' : need ? `<button type="button" class="btn sm pri" data-approve="${a.id}">Approve</button><button type="button" class="btn sm ghost" data-back="${a.id}">Send back</button>` : inc ? `<button type="button" class="btn sm pri" data-res="${inc.id}:deny">Keep it out</button><button type="button" class="btn sm ghost" data-res="${inc.id}:grant">Allow once</button>` : `<button type="button" class="btn sm ${a.paused ? 'pri' : 'ghost'}" data-act="${a.paused ? 'resume' : 'pause'}" data-id="${a.id}">${a.paused ? 'Resume' : 'Pause'}</button>`}<button type="button" class="btn sm ghost" data-bot="${a.id}">Find</button></span></div>`;
  }).join('');
  return `<div class="list-h"><div><b>Roll call</b><span>The same crew and the same buttons, as a plain list.</span></div><button type="button" class="x" data-act="closelist" aria-label="Close">&times;</button></div>
  <div class="scroll"><div class="tbl"><div class="tr h"><span>Bot</span><span>Job</span><span>Doing now</span><span>Trust</span><span>Limit</span><span>Shipped</span><span></span></div>${rows}</div></div>`;
}

export function marks(v, t0, t1) {
  return v.log.filter(l => l.t >= t0 && l.t <= t1 && (l.kind === 'wait' || l.kind === 'incident' || l.kind === 'ship'))
    .map(l => `<i class="k-${l.kind}" style="left:${(((l.t - t0) / Math.max(1, t1 - t0)) * 100).toFixed(1)}%"></i>`).join('');
}
