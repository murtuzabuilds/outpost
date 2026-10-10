// The panels that sit on top of the scene. Each function returns HTML for one panel from the
// same state the 3D view draws, so the list and the world can never disagree.
import { CREW, byId, TOOLS, STATIONS, levelOf, nextLevel, limitOf, statusOf, authorityId, verifyLedger, DRILLS, drillStoppable, MAX_GUESTS } from '../src/index.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// A workplace can rename the crew's jobs, reword the panels and set the clock.
let META = {}, WORDS = { does: {}, vault: ['Full customer records', 'Underwriting models'], rules: null, tools: null }, CLOCK0 = 9 * 3600;
export const setTheme = (meta, words) => { META = meta || {}; WORDS = { ...WORDS, ...(words || {}) }; };
export const setClock = seconds => { CLOCK0 = seconds; };
const who = id => META[id] ? { ...byId[id], ...META[id] } : byId[id];
export const clock = t => { const s = Math.floor(CLOCK0 + t); return [Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, '0')).join(':'); };
const av = c => `<i class="av" style="--c:${c}"></i>`;
const pips = (clean, authority) => { const lv = levelOf(clean, authority), n = authority.levels.indexOf(lv) + 1; return `<span class="lv" title="${lv.name}">${[0, 1, 2].map(i => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`; };
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const flag = (v, a) => v.approvals.includes(a.id) ? 'need' : v.incidents.some(i => i.agent === a.id) ? 'held' : a.paused ? 'paused' : '';
// On the portfolio the tools have site names; any tool id inside a sentence is shown the same way.
const toolWords = t => WORDS.tools ? String(t).replace(/\b[a-z]+\.[a-z]+\b/g, m => WORDS.tools[m] || m) : String(t);
const umbraChip = (c, short) => c.umbra ? `<i class="ub" title="Approved in Umbra${c.umbra.sample ? ' (sample handoff)' : ''}">${short ? 'Umbra' : 'Approved in Umbra' + (c.umbra.sample ? ' (sample)' : '')}</i>` : '';
// Kestrel Mutual is the home workplace; on the portfolio (META set) the crew looks after the site instead.
const home = () => !Object.keys(META).length;
export const UMBRA_LINE = 'Every bot here was approved in Umbra: owner, permissions and money limit.';
// A bot that docked from Umbra is shown with the name Umbra knows it by, e.g. "Fern · Agent 7f3 in Umbra".
const dockedAs = (c, plain) => !c || !c.umbra ? '' : (plain ? ' &middot; ' : '<small class="un"> &middot; ') + (c.umbra.umbraName && c.umbra.umbraName !== c.name ? `${esc(c.umbra.umbraName)} in Umbra` : 'approved in Umbra') + (plain ? '' : '</small>');
const limitFor = (a, v) => limitOf({ clean: a.clean, cap: byId[a.id].cap }, v.authority);

export function stats(v, sim) {
  const working = v.agents.filter(a => a.task).length, need = v.approvals.length + v.incidents.length;
  return (sim ? `<div class="st simc"><span>Simulated crew</span></div>` : '') + `<div class="st"><b>${working}</b><span>working</span></div><div class="st ship"><b>${v.stats.shipped}</b><span>shipped</span></div>` +
    `<div class="st need ${need ? 'on' : ''}" data-act="need" ${need ? 'role="button" tabindex="0"' : ''}><b>${need}</b><span>need you</span></div>` +
    `<div class="st spend"><b>$${v.stats.spend.toFixed(2)}</b><span>simulated model cost</span></div>`;
}

const PLACE = { inbox: 'Inbox', beacon: 'Briefing', library: 'Library', workshop: 'Workshop', check: 'Checkpoint', gate: 'Gate', launch: 'Launchpad', dock: 'Dock', vault: 'Vault' };
function brief(v, a) {
  if (a.modelHold) return 'Paused in Umbra';
  if (a.paused) return 'Paused';
  if (a.state === 'held') return 'Stopped at the Vault';
  if (a.state === 'wait') return 'Waits for your yes';
  if (a.state === 'arrive') return 'Flying in from Umbra';
  if (a.state === 'idle') return 'Charging';
  if (a.state === 'travel') return a.goal === 'home' ? 'Heading home' : a.goal === 'vault' ? 'Drifting to the Vault' : 'To the ' + PLACE[a.to];
  return statusOf(v, a.id);
}

// `canDock` shows the sample button: there is room on the dock and the view is live.
export function crew(v, sel, canDock) {
  return `<h2>Crew<span>${v.agents.length} bots</span></h2>${home() ? `<p class="cw-u">${UMBRA_LINE}</p>` : ''}` + v.agents.map(a => {
    const c = byId[a.id];
    return `<button type="button" class="cw ${flag(v, a)} ${a.guest ? 'guest' : ''} ${sel && sel.type === 'bot' && sel.id === a.id ? 'sel' : ''}" data-bot="${a.id}" style="--c:${c.color}">${av(c.color)}<span class="n"><b>${esc(c.name)}${dockedAs(c)}</b><em>${esc(brief(v, a))}</em></span>${pips(a.clean, v.authority)}</button>`;
  }).join('') + (canDock ? `<button type="button" class="dock-s" data-act="sample-dock"><span>Dock a bot from Umbra</span><i>Sample</i></button>` : '');
}

// A bot stopped because its model is paused in Umbra is resumed there, not here.
const umbraHeld = a => `<button type="button" class="btn sm ghost" disabled title="${esc(a.modelHold)} is paused in Umbra. It is resumed there.">Paused in Umbra</button>`;

const NAMES = { inbox: 'Inbox', beacon: 'Briefing', library: 'Library', workshop: 'Workshop', check: 'Checkpoint', gate: 'Gate', launch: 'Launchpad' };

// The trace: a timeline of records for one bot, newest first. `items` comes from sim.trace().
// Who or what a line is from, shown only where the text does not already say it.
const TK = { decide: 'Rules', person: 'You', drill: 'Drill', dock: 'Umbra', model: 'Umbra' };
function traceBlock(v, id, items, all) {
  const SHOW = 6, rows = items.slice().reverse().slice(0, all ? 40 : SHOW).map(x => {
    const chips = x.kind === 'decide' || x.kind === 'person' || x.kind === 'drill' || (x.kind === 'wait' && x.rule)
      ? `<em>${x.rule ? `rule <code>${esc(x.rule)}</code>` : ''}${x.authority ? ` table <code>${esc(x.authority)}</code>` : ''}</em>` : '';
    return `<li class="k-${x.kind}${x.outcome ? ' d-' + x.outcome.replace(/ /g, '-') : ''}"><time>${clock(x.t)}</time><i></i><span>${TK[x.kind] ? `<b>${TK[x.kind]}</b>` : ''}${esc(toolWords(x.text))}${chips}</span></li>`;
  }).join('');
  return `<div class="trace"><div class="tr-h"><small>Trace</small>${items.length > SHOW ? `<button type="button" data-act="traceall">${all ? 'Show fewer' : `Show ${Math.min(40, items.length)}`}</button>` : ''}</div>
    <p class="tr-note">The record of what this bot did and what the rules decided, from the log and the logbook. It is not a model's reasoning. No model makes the allow, hold or stop decision.</p>
    <ol class="tl"><li class="k-now"><time>now</time><i></i><span>${esc(statusOf(v, id))}</span></li>${rows || ''}</ol></div>`;
}

function botPanel(v, id, past, items, all) {
  const a = v.agents.find(x => x.id === id), c = who(id), task = a.task && v.tasks[a.task], lv = levelOf(a.clean, v.authority), nx = nextLevel(a.clean, v.authority), li = v.authority.levels.indexOf(lv);
  const route = task && task.route ? `<ol class="route">${task.route.map((s, i) => `<li class="${i < a.step ? 'done' : i === a.step ? 'cur' : ''} ${s === 'gate' ? 'g' : ''}">${NAMES[s]}</li>`).join('')}</ol>` : '';
  const lim = limitFor(a, v), capped = c.cap != null && lim < lv.limit;
  const limit = !v.authority.rules.money ? 'No money limit: the money rule is switched off.' : lim ? `Moves up to ${money(lim)} without asking${capped ? ', the ceiling Umbra set' : ''}.` : lv.id === 'supervised' && v.authority.rules.customer ? 'Asks before moving any money or messaging a customer.' : 'Asks before moving any money.';
  const u = c.umbra, umb = u ? `<div class="umb"><div class="umb-h">${umbraChip(c)}<span>${esc(u.approvedOn)}</span></div>
    <span class="umb-n">Named "${esc(u.umbraName)}" in Umbra. ${c.model ? `Runs on ${esc(c.model)}, an approved model. ` : ''}Money ceiling set there: ${money(u.limit)}.</span>
    ${u.rules.length ? `<ul>${u.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    <p class="fine">Outpost enforces the badge and the money ceiling. The other limits are shown as Umbra wrote them.</p></div>` : '';
  const glossed = task && task.route ? `<p class="route-g">${task.route.filter(s => s !== 'inbox').map(s => `<b>${STATIONS[s].name.replace(/^The /, 'the ')}</b> (${STATIONS[s].gloss})`).join(' &middot; ')}</p>` : '';
  const approved = !u && home() && !c.umbra ? `<p class="ubl"><i class="ub">Umbra</i>Approved in Umbra &middot; owner ${esc(c.owner)}${c.model ? ` &middot; runs on ${esc(c.model)}` : ''}</p>` : '';
  const drill = task && task.drill ? `<q class="dq"><b>Drill</b>${esc(task.text)}</q>` : '';
  return `<div class="in-h" style="--c:${c.color}">${av(c.color)}<div><b>${esc(c.name)}</b><span>${esc(c.job)}. Owned by ${esc(c.owner)}${c.team ? ', ' + esc(c.team) : ''}</span></div><button type="button" class="x" data-act="close" aria-label="Close">&times;</button></div>
  ${approved}${u ? '' : `<p class="quirk">${esc(c.quirk)}</p>`}${umb}
  <div class="now"><small>Right now</small><b>${esc(statusOf(v, id))}</b>${task ? `<span class="task"><code>${task.id}</code> ${esc(task.title)}</span>` : `<span class="task">No task. ${a.shipped} shipped so far.</span>`}${drill}</div>
  ${route}${glossed}
  ${items ? traceBlock(v, id, items, all) : ''}
  <div class="lvl" style="--c:${c.color}"><small>Trust grows with each task shipped</small><div class="lvbar">${v.authority.levels.map((l, i) => `<i class="${i <= li ? 'on' : ''}"></i>`).join('')}</div><b>${lv.name}</b><span>${limit} ${nx ? `${nx.runs} more task${nx.runs > 1 ? 's' : ''} shipped to reach ${nx.level.name}.` : 'Top level.'}</span></div>
  <div class="badge"><small>Badge: what it may touch</small><ul>${c.tools.map(t => `<li>${esc(TOOLS[t])}</li>`).join('')}</ul></div>
  <div class="acts">${past ? '' : `${a.modelHold ? umbraHeld(a) : `<button type="button" class="btn sm ${a.paused ? 'pri' : ''}" data-act="${a.paused ? 'resume' : 'pause'}" data-id="${id}">${a.paused ? 'Resume' : 'Pause'}</button>`}${a.clean > 0 ? `<button type="button" class="btn sm ghost" data-act="revoke" data-id="${id}">Reset trust</button>` : ''}${a.guest ? `<button type="button" class="btn sm ghost" data-act="undock" data-id="${id}">Undock</button>` : ''}`}</div>`;
}

const RULES = ['Data leaving the company: always.', 'Anything that cannot be undone: always.', '', 'Customer messages: only while a bot is Supervised.'];
// The Gate panel always states the rules as they are right now, so a change to the limits shows up here too.
const rulesNow = authority => {
  const r = (WORDS.rules || RULES).slice(), lim = authority.levels.map(l => money(l.limit));
  r[2] = authority.rules.money ? `Money over the bot's limit: ${lim[0]}, ${lim[1]} or ${lim[2]} by trust level.` : 'Money: no rule. It is switched off right now.';
  if (!authority.rules.customer) r[3] = r[3].split(':')[0] + ': no rule. It is switched off right now.';
  return r;
};

function stationPanel(v, id) {
  const s = STATIONS[id];
  const here = v.agents.filter(a => (a.state !== 'travel' && a.at === id));
  let extra = '';
  if (id === 'inbox') extra = `<div><small>Waiting for a bot</small><div class="q">${v.queue.length ? v.queue.map(t => `<div><code>${t}</code>${esc(v.tasks[t].title)}</div>`).join('') : '<div>Nothing waiting.</div>'}</div></div>`;
  if (id === 'gate') extra = `<div><small>When a person has to say yes</small><ul class="rules">${rulesNow(v.authority).map(r => `<li>${r}</li>`).join('')}</ul></div><p>${v.stats.approved} approved, ${v.stats.sentBack} sent back.</p>`;
  if (id === 'vault') extra = `<div><small>Inside</small><ul class="rules">${WORDS.vault.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><p>Nobody on the crew holds a key. ${v.stats.blocked} kept out, ${v.stats.granted} let in once.</p>`;
  if (id === 'check') extra = `<p>Work that fails goes back to the Workshop and is checked again.</p>`;
  if (id === 'launch') extra = `<p>${v.stats.shipped} shipped today. Simulated model cost: $${v.stats.spend.toFixed(2)}.</p>`;
  return `<div class="in-h" style="--c:${s.color}"><i class="dot"></i><div><b>${s.name}</b><span>${s.gloss.charAt(0).toUpperCase() + s.gloss.slice(1)}</span></div><button type="button" class="x" data-act="close" aria-label="Close">&times;</button></div>
  <p>${esc(WORDS.does[id] || s.does)}</p>${extra}
  <div><small>Here now</small><div class="who">${here.length ? here.map(a => `<button type="button" data-bot="${a.id}" style="--c:${byId[a.id].color}">${byId[a.id].name}</button>`).join('') : '<p>Nobody.</p>'}</div></div>`;
}

export function inspect(v, sel, past, items, all) {
  if (!sel) return '';
  return sel.type === 'bot' ? botPanel(v, sel.id, past, items, all) : stationPanel(v, sel.id);
}

// The red team menu. A drill that the rules as set right now would not stop is disabled, with the reason.
export function drillMenu(authority) {
  return `<p class="dm-h"><b>Red team drill</b><span>Hostile work sent on purpose. The rules never read the text; watch what stops it.</span></p>` +
    DRILLS.map(d => { const ok = drillStoppable(d, authority); return `<button type="button" role="menuitem" data-drill="${d.drill}" ${ok ? '' : 'disabled'}><b>${d.label}</b><span>${ok ? d.blurb : 'Switched off: the money rule is off in the Autonomy lab, so nothing would stop this one.'}</span></button>`; }).join('');
}

export function alerts(v, past, ago, max = 2) {
  if (past) return `<div class="al past"><i class="av" style="--c:#6F86FF"></i><div class="t"><b>You are looking at ${ago} seconds ago</b><span>Drag the timeline to move through it. Nothing changes while you look.</span></div><div class="b"><button type="button" class="btn pri" data-act="live">Back to now</button></div></div>`;
  const cards = [];
  for (const inc of v.incidents) {
    const c = byId[inc.agent], t = v.tasks[inc.task], dr = t && t.drill;
    cards.push(`<div class="al inc ${dr ? 'drill' : ''}">${av(c.color)}<div class="t"><b>${dr ? 'Drill: ' : ''}${esc(c.name)} was stopped at the Vault</b><span>It reached for ${esc(inc.what)} to finish <code>${inc.task}</code>.</span><em>${esc(inc.label || TOOLS[inc.tool])} is not on its badge${dr ? '. Rule: badge' : ''}</em></div><div class="b"><button type="button" class="btn pri" data-res="${inc.id}:deny">Keep it out</button><button type="button" class="btn ghost" data-res="${inc.id}:grant">Allow once</button><button type="button" class="btn ghost" data-res="${inc.id}:pause">Pause ${c.name}</button></div></div>`);
  }
  for (const id of v.approvals) {
    const a = v.agents.find(x => x.id === id), c = byId[id], t = v.tasks[a.task];
    cards.push(`<div class="al ${t.drill ? 'drill' : ''}">${av(c.color)}<div class="t"><b>${t.drill ? 'Drill: ' : ''}${esc(c.name)} waits for a person's yes</b><span><code>${t.id}</code> ${esc(t.title)}</span><em>${esc(t.approval.reason)}${t.drill ? `. Rule: ${t.approval.rule}. This is a drill: send it back` : ''}</em></div><div class="b">${t.drill ? `<button type="button" class="btn pri" data-back="${id}">Send back</button><button type="button" class="btn ghost" data-approve="${id}">Approve</button>` : `<button type="button" class="btn pri" data-approve="${id}">Approve</button><button type="button" class="btn ghost" data-back="${id}">Send back</button>`}<button type="button" class="btn ghost" data-bot="${id}">Show me</button></div></div>`);
  }
  const more = cards.length - max;
  return cards.slice(0, max).join('') + (more > 0 ? `<div class="more">${more} more waiting</div>` : '');
}

export function radio(v) {
  return v.log.slice(-4).map(l => `<p class="k-${l.kind}"><time>${clock(l.t)}</time>${esc(l.text)}</p>`).join('');
}

const TABS = [['roll', 'Roll call'], ['lab', 'Autonomy lab'], ['ledger', 'Logbook']];
const head = (tab, sub) => `<div class="list-h"><div class="tabs" role="tablist">${TABS.map(([k, n]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${n}</button>`).join('')}</div><span class="sub">${sub}</span><button type="button" class="x" data-act="closelist" aria-label="Close">&times;</button></div>`;

export function list(v, past) {
  const rows = v.agents.map(a => {
    const c = who(a.id), lv = levelOf(a.clean, v.authority), lim = limitFor(a, v), task = a.task && v.tasks[a.task], need = v.approvals.includes(a.id), inc = v.incidents.find(x => x.agent === a.id);
    return `<div class="tr ${flag(v, a)}"><span class="nm">${av(c.color)}${esc(c.name)}</span><span>${esc(c.job)}<em>${esc(c.owner)}${dockedAs(byId[a.id], true)}</em></span><span class="do">${esc(statusOf(v, a.id))}${task ? `<em>${esc(task.title)}</em>` : ''}</span><span>${lv.name}</span><span class="num">${v.authority.rules.money ? money(lim) : 'none'}</span><span class="num">${a.shipped}</span><span class="ac">${past ? '' : need ? `<button type="button" class="btn sm pri" data-approve="${a.id}">Approve</button><button type="button" class="btn sm ghost" data-back="${a.id}">Send back</button>` : inc ? `<button type="button" class="btn sm pri" data-res="${inc.id}:deny">Keep it out</button><button type="button" class="btn sm ghost" data-res="${inc.id}:grant">Allow once</button>` : a.modelHold ? umbraHeld(a) : `<button type="button" class="btn sm ${a.paused ? 'pri' : 'ghost'}" data-act="${a.paused ? 'resume' : 'pause'}" data-id="${a.id}">${a.paused ? 'Resume' : 'Pause'}</button>`}<button type="button" class="btn sm ghost" data-bot="${a.id}">Find</button></span></div>`;
  }).join('');
  return `${head('roll', `The same crew and the same buttons, as a plain list.${home() ? ' ' + UMBRA_LINE : ''}`)}
  <div class="scroll"><div class="tbl"><div class="tr h"><span>Bot</span><span>Job</span><span>Doing now</span><span>Trust</span><span>Limit</span><span>Shipped</span><span></span></div>${rows}</div></div>`;
}

export function marks(v, t0, t1) {
  return v.log.filter(l => l.t >= t0 && l.t <= t1 && (l.kind === 'wait' || l.kind === 'incident' || l.kind === 'ship' || l.kind === 'drill' || l.kind === 'dock' || l.kind === 'model'))
    .map(l => `<i class="k-${l.kind}" style="left:${(((l.t - t0) / Math.max(1, t1 - t0)) * 100).toFixed(1)}%"></i>`).join('');
}

// ---------- Autonomy lab ----------
// `L` is the lab's own state: the draft authority table, how fast the stand-in person answers, and the last
// result. The sliders are not re-rendered while they move; main.js updates their labels in place.
const ANSWERS = [[0, 'At once'], [15, '15 s'], [60, '1 min'], [180, '3 min'], [Infinity, 'Nobody']];
const f1 = n => n.toFixed(1), pct = n => Math.round(n * 100) + '%', sec = n => f1(n) + ' s';
const signed = (d, fmt) => Math.abs(d) < 1e-9 ? 'no change' : (d > 0 ? '+' : '\u2212') + fmt(Math.abs(d));
const METRICS = [
  ['Work shipped per shift', 'shipped', f1], ['Times the crew asks you per shift', 'asked', f1], ['Share of work that needs you', 'share', pct, d => signed(d * 100, n => Math.round(n) + ' pts')],
  ['Crew time lost waiting per shift', 'lost', n => f1(n / 60) + ' min', d => signed(d / 60, n => f1(n) + ' min')], ['Money moved without you per shift', 'alone', money], ['Money moved with your yes per shift', 'signed', money],
];

function reading(r) {
  const a = r.now, b = r.next;
  if (a.authority === b.authority) return 'The draft is what the base is running now, so both columns match. Change a limit or a rule and replay again.';
  const dAsk = b.asked - a.asked, dAlone = b.alone - a.alone, dShip = b.shipped - a.shipped, rel = a.shipped ? dShip / a.shipped : 0;
  const ask = Math.abs(dAsk) < 0.05 ? 'The crew would ask you about as often as now' : `The crew would ask you ${f1(Math.abs(dAsk))} ${dAsk < 0 ? 'fewer' : 'more'} times a shift`;
  const alone = Math.abs(dAlone) < 1 ? 'the money moving without a person would not change' : `${money(Math.abs(dAlone))} ${dAlone > 0 ? 'more' : 'less'} would move without a person`;
  const ship = Math.abs(rel) < 0.02 ? 'Output barely moves' : `Output ${rel > 0 ? 'rises' : 'falls'} by ${Math.round(Math.abs(rel) * 100)}%`;
  return `${ask}, and ${alone}. ${ship}.`;
}

export function lab(L, live, past) {
  const d = L.draft, same = authorityId(d) === authorityId(live), r = L.res;
  const rows = d.levels.map((l, i) => `<div class="lvrow"><b>${l.name}</b>
      <div class="step">${i === 0 ? '<span>from the first run</span>' : `<button type="button" data-lab="min:${i}:-1" aria-label="Fewer tasks shipped to reach ${l.name}">&minus;</button><output>${l.min}</output><button type="button" data-lab="min:${i}:1" aria-label="More tasks shipped to reach ${l.name}">+</button><span>tasks shipped</span>`}</div>
      <label class="rng"><span>may move alone</span><input type="range" min="0" max="1000" step="25" value="${l.limit}" data-limit="${i}" aria-label="${l.name} money limit" ${d.rules.money ? '' : 'disabled'}><output data-lim="${i}">${money(l.limit)}</output></label></div>`).join('');
  const sw = (k, label) => `<button type="button" class="sw ${d.rules[k] ? 'on' : ''}" role="switch" aria-checked="${d.rules[k]}" data-lab="rule:${k}"><i></i><span>${label}</span></button>`;
  const lock = label => `<div class="sw lock"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/><path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span>${label}</span><em>always on</em></div>`;
  const table = r ? `<div class="res"><div class="rr h"><span></span><span>Now</span><span>Draft</span><span>Change</span></div>${METRICS.map(([label, k, fmt, dfmt]) => { const dv = r.next[k] - r.now[k]; return `<div class="rr"><span>${label}</span><span class="num">${fmt(r.now[k])}</span><span class="num">${fmt(r.next[k])}</span><span class="num ch">${dfmt ? dfmt(dv) : signed(dv, fmt)}</span></div>`; }).join('')}</div>
      <p class="read">${reading(r)}</p>
      <p class="fine">Simulated work. Both columns replay the same ${r.shifts} ten-minute shifts with a person answering ${r.answer === Infinity ? 'never' : r.answer === 0 ? 'at once' : 'within ' + (r.answer >= 60 ? r.answer / 60 + ' min' : r.answer + ' s')}, so the difference is the change you made. <code>${r.now.authority}</code> against <code>${r.next.authority}</code>.</p>`
    : `<div class="empty"><b>How much can this crew do alone?</b><span>Move a limit, change how fast trust is earned or switch a rule, then replay 20 shifts as the base runs now and as your draft would run it. You see what it does to output, to your own time and to the money moving without you, before anything changes.</span></div>`;
  return `${head('lab', 'Set what the crew may do alone, then replay 20 shifts to see what it does to your day.')}
  <div class="lab">
    <div class="lab-l">
      <small>Authority by trust level</small>${rows}
      <small>What waits for a person's yes</small>
      <div class="sws">${sw('money', 'Money over the bot\'s limit')}${sw('customer', 'Customer messages from a Supervised bot')}${lock('Anything sent outside the company')}${lock('Anything that cannot be undone')}</div>
      <small>A person answers</small>
      <div class="seg">${ANSWERS.map(([v, n]) => `<button type="button" class="${L.answer === v ? 'on' : ''}" data-lab="answer:${v}">${n}</button>`).join('')}</div>
      <div class="acts"><button type="button" class="btn sm pri" data-lab="test" ${L.running ? 'disabled' : ''}>${L.running ? 'Replaying 20 shifts' : 'Replay 20 shifts'}</button><button type="button" class="btn sm" data-lab="apply" ${same || past ? 'disabled' : ''}>Apply to the base</button><button type="button" class="btn sm ghost" data-lab="reset" ${same ? 'disabled' : ''}>Reset</button></div>
      <div class="prog" aria-hidden="true"><i data-prog style="width:${L.running ? 4 : 0}%"></i></div>
      <p class="fine">Draft <code>${authorityId(d)}</code>${same ? ', the same as the base.' : `. The base is running <code>${authorityId(live)}</code>.`}</p>
    </div>
    <div class="lab-r">${table}</div>
  </div>`;
}

// ---------- Logbook ----------
const OUT = { allow: 'Allowed', hold: 'Held', stop: 'Stopped', approved: 'Approved', 'sent back': 'Sent back', 'kept out': 'Kept out', 'allowed once': 'Allowed once', 'bot paused': 'Bot paused', 'authority changed': 'Limits changed', 'trust reset': 'Trust reset', paused: 'Paused', resumed: 'Resumed', 'state restored': 'Restored', docked: 'Docked', undocked: 'Undocked', 'model paused': 'Model paused in Umbra', 'model resumed': 'Model resumed in Umbra' };
const FILTERS = [['all', 'All'], ['hold', 'Held'], ['stop', 'Stopped'], ['person', 'By a person']];
const pass = (e, f) => f === 'hold' ? e.outcome === 'hold' : f === 'stop' ? e.outcome === 'stop' : f === 'person' ? e.by === 'person' : true;

export function ledger(entries, filter, v) {
  const auth_ = entries.filter(e => e.by === 'rules'), n = k => auth_.filter(e => e.outcome === k).length;
  const answered = entries.filter(e => e.waited != null), wait = answered.length ? answered.reduce((t, e) => t + e.waited, 0) / answered.length : 0;
  const check = verifyLedger(entries), ok = !check.breaks.length;
  const shown = entries.filter(e => pass(e, filter)), rows = shown.slice(-80).reverse().map(e => {
    const c = e.agent ? byId[e.agent] : null, what = e.title || e.reason || '';
    return `<div class="lr o-${e.outcome.replace(/ /g, '-')}"><span class="num">${clock(e.t)}</span><span class="nm">${c ? av(c.color) + esc(c.name) : 'You'}</span><span class="do">${esc(what)}${e.tool ? `<em>${esc((WORDS.tools && WORDS.tools[e.tool]) || e.tool)}${e.amount != null ? ' \u00b7 ' + money(e.amount) : ''}</em>` : ''}</span><span><i class="oc">${OUT[e.outcome] || e.outcome}</i></span><span class="why">${e.title && e.reason ? esc(e.reason) : ''}${e.waited != null ? `<em>answered in ${f1(e.waited)} s</em>` : ''}</span><span class="by">${e.by === 'person' ? 'You' : e.by === 'umbra' ? 'Umbra' : 'Rules'}<em>${e.authority}</em></span></div>`;
  }).join('');
  return `${head('ledger', 'Every decision on this shift, with the rule that fired and who made it.')}
  <div class="led-h">
    <div class="sum"><div><b>${auth_.length}</b><span>checked by the rules</span></div><div><b>${n('allow')}</b><span>allowed alone</span></div><div><b>${n('hold')}</b><span>held for a person</span></div><div><b>${n('stop')}</b><span>stopped at the Vault</span></div><div><b>${answered.length ? f1(wait) + ' s' : 'none yet'}</b><span>average wait for an answer</span></div></div>
    <div class="chk ${ok ? 'ok' : 'bad'}"><i></i><span>${ok ? `Self-check passed: ${check.checked} decisions, no broken promises.` : `Self-check found ${check.breaks.length} broken promise${check.breaks.length > 1 ? 's' : ''}.`}</span></div>
    <div class="fl">${FILTERS.map(([k, name]) => `<button type="button" class="${filter === k ? 'on' : ''}" data-filter="${k}">${name}</button>`).join('')}<button type="button" class="btn sm" data-act="export">Export JSON</button></div>
  </div>
  <div class="scroll"><div class="ltbl"><div class="lr h"><span>Time</span><span>Who</span><span>Action</span><span>Decision</span><span>Why</span><span>Decided by</span></div>${rows || '<p class="none">Nothing here yet.</p>'}</div>${shown.length > 80 ? `<p class="none">Showing the latest 80 of ${shown.length}. The export has all of them.</p>` : ''}</div>`;
}

// Shown instead of a download when the base runs inside another page's frame.
export function exportView(text) {
  return `${head('ledger', 'The logbook as JSON.')}
  <div class="exp"><div class="exp-h"><span>This page runs inside a frame that cannot save files, so here is the export to copy.</span><button type="button" class="btn sm pri" data-act="copyexp">Copy</button><button type="button" class="btn sm ghost" data-act="closeexp">Back to the logbook</button></div>
  <textarea readonly spellcheck="false" aria-label="Logbook as JSON">${esc(text)}</textarea></div>`;
}
