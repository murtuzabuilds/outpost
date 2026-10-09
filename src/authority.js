// Authority: what a bot may do alone, and the one function that reads it.
//
// Companies already keep a delegation of authority for people: who may sign off what, and up to how
// much. This is the same instrument for a crew of agents. It is plain data: a trust ladder (how many
// clean runs earn each level, and how much money a bot at that level may move alone) and which of the
// optional sign-off rules are switched on. `decide` takes an action a bot wants to take and answers
// allow, hold or stop, with the rule that fired.
// Nothing here is decided by a model, and nothing here knows about the simulation or the screen.
// It looks only at the kind of action, the amount and who is asking. It never reads what is inside the work.

export const DEFAULT_AUTHORITY = Object.freeze({
  levels: Object.freeze([
    Object.freeze({ id: 'supervised', name: 'Supervised', min: 0, limit: 0,   note: 'New or reset. Asks before anything that reaches a customer or moves money.' }),
    Object.freeze({ id: 'trusted',    name: 'Trusted',    min: 3, limit: 200, note: 'Can message customers and move up to $200 alone.' }),
    Object.freeze({ id: 'autonomous', name: 'Autonomous', min: 8, limit: 500, note: 'Can move up to $500 alone. Still stops for data leaving and anything that cannot be undone.' }),
  ]),
  // Two rules can be switched. The other two (data leaving, anything that cannot be undone) are
  // locked on: no authority table can turn them off.
  rules: Object.freeze({ money: true, customer: true }),
});
export const LEVELS = DEFAULT_AUTHORITY.levels;
export const LOCKED = ['data-out', 'irreversible'];

const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

// Builds a valid authority table from a partial one. Limits and thresholds are clamped so the ladder always
// climbs: a higher level never needs fewer clean runs or carries a lower limit than the one below.
export function makeAuthority(p = {}) {
  p = p || {};
  const base = DEFAULT_AUTHORITY.levels, inL = Array.isArray(p.levels) ? p.levels : [], out = [];
  for (let i = 0; i < base.length; i++) {
    const b = base[i], x = inL.find(l => l && l.id === b.id) || inL[i] || {};
    const min = i === 0 ? 0 : Math.max(out[i - 1].min + 1, int(x.min, 1, 99, b.min));
    const limit = Math.max(i === 0 ? 0 : out[i - 1].limit, int(x.limit, 0, 5000, b.limit));
    out.push({ id: b.id, name: b.name, min, limit });
  }
  const r = p.rules || {};
  return { levels: out, rules: { money: r.money !== false, customer: r.customer !== false } };
}

// A short, stable id for an authority table, so every recorded decision can say which rules it was made under.
export function authorityId(authority) {
  const p = makeAuthority(authority), s = p.levels.map(l => `${l.min}:${l.limit}`).join('|') + `|${+p.rules.money}${+p.rules.customer}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return 'a-' + (h >>> 0).toString(16).padStart(8, '0').slice(0, 6);
}

export function levelOf(clean, authority = DEFAULT_AUTHORITY) {
  let out = authority.levels[0];
  for (const l of authority.levels) if (clean >= l.min) out = l;
  return out;
}

export function nextLevel(clean, authority = DEFAULT_AUTHORITY) {
  const i = authority.levels.indexOf(levelOf(clean, authority));
  const n = authority.levels[i + 1];
  return n ? { level: n, runs: n.min - clean } : null;
}

// The money a bot may move alone: its level's limit, or less if the bot arrived with a lower ceiling
// (`agent.cap`, set where the bot was approved). A cap can only lower the limit, never raise it.
export function limitOf(agent, authority = DEFAULT_AUTHORITY) {
  const l = levelOf(agent.clean, authority).limit, cap = Number(agent.cap);
  return agent.cap != null && Number.isFinite(cap) && cap >= 0 ? Math.min(l, cap) : l;
}

// Rules are checked in this order, and the first one that applies is the reason shown to the person.
export function needsApproval(task, agent, authority = DEFAULT_AUTHORITY) {
  const level = { ...levelOf(agent.clean, authority), limit: limitOf(agent, authority) }, risk = task.risk || [];
  if (risk.includes('leaves-company'))
    return { needed: true, rule: 'data-out', reason: 'This sends data outside the company' };
  if (risk.includes('irreversible'))
    return { needed: true, rule: 'irreversible', reason: 'This cannot be undone' };
  if (authority.rules.money && task.amount != null && task.amount > level.limit)
    return { needed: true, rule: 'money', reason: `$${task.amount} is over ${agent.name}'s $${level.limit} limit` };
  if (authority.rules.customer && risk.includes('customer-facing') && level.id === 'supervised')
    return { needed: true, rule: 'customer', reason: `${agent.name} is still supervised for customer messages` };
  return { needed: false, rule: null, reason: null };
}

export function canUse(agent, tool) {
  return agent.tools.includes(tool);
}

// The decision point. Give it what a bot is about to do and who the bot is; it returns
//   stop   the tool is not on the bot's badge, so the action must not run
//   hold   a rule says a person has to say yes first
//   allow  the bot may go ahead alone
// `action` is { tool, risk?: string[], amount?: number }. `agent` is { name, clean, tools, cap? }.
// This is the only place a decision is made: the simulation, the tests and the Autonomy lab all call it,
// and it is the function a real agent runtime would call before running a tool.
export function decide(action, agent, authority = DEFAULT_AUTHORITY) {
  const level = { ...levelOf(agent.clean, authority), limit: limitOf(agent, authority) }, base = { level: level.id, limit: level.limit, authority: authorityId(authority) };
  if (!canUse(agent, action.tool))
    return { outcome: 'stop', rule: 'badge', reason: `${action.tool} is not on ${agent.name}'s badge`, ...base };
  const a = needsApproval(action, agent, authority);
  if (a.needed) return { outcome: 'hold', rule: a.rule, reason: a.reason, ...base };
  const risk = action.risk || [];
  const reason = action.amount != null && authority.rules.money ? `$${action.amount} is within ${agent.name}'s $${level.limit} limit`
    : risk.includes('customer-facing') && authority.rules.customer ? `${agent.name} is ${level.name} for customer messages`
    : 'Routine work. No rule applies';
  return { outcome: 'allow', rule: null, reason, ...base };
}
