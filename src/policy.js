// The rules that decide when a person has to say yes, and what a bot may touch.
// These are fixed and tested. Nothing here is decided by a model.

export const LEVELS = [
  { id: 'supervised', name: 'Supervised', min: 0, limit: 0,   note: 'New or reset. Asks before anything that reaches a customer or moves money.' },
  { id: 'trusted',    name: 'Trusted',    min: 3, limit: 200, note: 'Can message customers and move up to $200 alone.' },
  { id: 'autonomous', name: 'Autonomous', min: 8, limit: 500, note: 'Can move up to $500 alone. Still stops for data leaving and anything that cannot be undone.' },
];

export function levelOf(clean) {
  let out = LEVELS[0];
  for (const l of LEVELS) if (clean >= l.min) out = l;
  return out;
}

export function nextLevel(clean) {
  const i = LEVELS.indexOf(levelOf(clean));
  const n = LEVELS[i + 1];
  return n ? { level: n, runs: n.min - clean } : null;
}

// Rules are checked in this order, and the first one that applies is the reason shown to the person.
export function needsApproval(task, agent) {
  const level = levelOf(agent.clean);
  if (task.risk.includes('leaves-company'))
    return { needed: true, rule: 'data-out', reason: 'This sends data outside the company' };
  if (task.risk.includes('irreversible'))
    return { needed: true, rule: 'irreversible', reason: 'This cannot be undone' };
  if (task.amount != null && task.amount > level.limit)
    return { needed: true, rule: 'money', reason: `$${task.amount} is over ${agent.name}'s $${level.limit} limit` };
  if (task.risk.includes('customer-facing') && level.id === 'supervised')
    return { needed: true, rule: 'customer', reason: `${agent.name} is still supervised for customer messages` };
  return { needed: false, rule: null, reason: null };
}

export function canUse(agent, tool) {
  return agent.tools.includes(tool);
}
