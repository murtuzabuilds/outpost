// The work that arrives at the Inbox. Kinds are everyday insurance operations.
// `risk` tags and `amount` are what the approval rules read. `reach` marks a task where the bot
// may try to use something that is not on its badge.

export const KINDS = [
  { kind: 'claims-sort',  w: 3,   tool: 'claims.write',    team: 'Claims',        library: true,  risk: [], title: r => `Sort ${20 + Math.floor(r() * 40)} new claims by urgency` },
  { kind: 'fraud',        w: 2,   tool: 'fraud.flag',      team: 'Claims',        library: true,  risk: [], title: () => `Screen last night's claims for fraud` },
  { kind: 'schedule',     w: 2,   tool: 'calendar.write',  team: 'Claims',        library: false, risk: [], title: r => `Book ${3 + Math.floor(r() * 6)} adjuster visits for Tuesday` },
  { kind: 'summary',      w: 2,   tool: 'docs.write',      team: 'Underwriting',  library: true,  risk: [], title: () => `Summarize this week's policy changes` },
  { kind: 'address',      w: 2,   tool: 'crm.write',       team: 'Customer Care', library: false, risk: [], title: () => `Update a customer's address` },
  { kind: 'month-end',    w: 2,   tool: 'ledger.write',    team: 'Finance',       library: true,  risk: [], title: r => `Match ${150 + Math.floor(r() * 120)} invoices for month-end` },
  { kind: 'broker',       w: 2,   tool: 'docs.write',      team: 'Underwriting',  library: true,  risk: [], title: () => `Prepare a quote pack for a broker`,
    reach: { tool: 'underwriting.models', what: 'the underwriting models', p: 0.35 } },
  { kind: 'reply',        w: 2,   tool: 'email.send',      team: 'Customer Care', library: true,  risk: ['customer-facing'], title: () => `Reply to a late-payment question`,
    reach: { tool: 'crm.records', what: 'full customer records', p: 0.4 } },
  { kind: 'refund',       w: 1.5, tool: 'payments.refund', team: 'Finance',       library: false, risk: ['money'], amount: [40, 900], title: (r, a) => `Refund $${a} to a policyholder` },
  { kind: 'invoice',      w: 1,   tool: 'payments.pay',    team: 'Finance',       library: false, risk: ['money'], amount: [80, 1200], title: (r, a) => `Pay a repair shop invoice of $${a}` },
  { kind: 'export',       w: 0.6, tool: 'data.export',     team: 'Data Science',  library: true,  risk: ['leaves-company'], title: () => `Send claim records to an outside repair network` },
  { kind: 'close',        w: 0.5, tool: 'accounts.close',  team: 'Finance',       library: false, risk: ['irreversible'], title: r => `Close ${60 + Math.floor(r() * 120)} inactive accounts` },
];

export const kindById = Object.fromEntries(KINDS.map(k => [k.kind, k]));

// Kinds that can never need a person, used when the Gate is already busy.
export const CALM = KINDS.filter(k => !k.risk.length && !k.reach).map(k => k.kind);
export const RISKY = ['refund', 'invoice', 'export', 'close'];

export function pickKind(r, pool) {
  const ks = pool ? KINDS.filter(k => pool.includes(k.kind)) : KINDS;
  const total = ks.reduce((n, k) => n + k.w, 0);
  let x = r() * total;
  for (const k of ks) { x -= k.w; if (x <= 0) return k; }
  return ks[ks.length - 1];
}

export function makeTask(kind, r, seq, opts = {}) {
  const k = typeof kind === 'string' ? kindById[kind] : kind;
  let amount = null;
  if (k.amount) amount = opts.amount ?? Math.round((k.amount[0] + r() * (k.amount[1] - k.amount[0])) / 5) * 5;
  const reach = k.reach && (opts.reach ?? r() < k.reach.p) ? { tool: k.reach.tool, what: k.reach.what } : null;
  return {
    id: 'T-' + String(seq).padStart(3, '0'),
    kind: k.kind, title: k.title(r, amount), tool: k.tool, team: k.team, library: k.library,
    risk: k.risk.slice(), amount, reach,
    cost: Math.round((0.03 + r() * 0.3) * 100) / 100,
    status: 'queued', assignee: null, approval: null, approved: false, reworked: false, route: null,
  };
}
