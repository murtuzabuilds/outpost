// A second workplace for the same crew: the bots that look after a portfolio site.
// Used when the base is mounted inside murtuzabuilds.com, so the work on screen is about the page
// the visitor is actually on. The tools, rules and crew are unchanged; only the wording differs.

const SITE = 'the site';

export const SITE_KINDS = [
  { kind: 'claims-sort', w: 3,   tool: 'claims.write',    team: SITE, library: true,  risk: [], title: r => `Sort ${8 + Math.floor(r() * 30)} new messages from visitors` },
  { kind: 'fraud',       w: 2,   tool: 'fraud.flag',      team: SITE, library: true,  risk: [], title: () => `Screen the contact form for spam` },
  { kind: 'schedule',    w: 2,   tool: 'calendar.write',  team: SITE, library: false, risk: [], title: () => `Hold a 20-minute slot for a recruiter` },
  { kind: 'summary',     w: 2,   tool: 'docs.write',      team: SITE, library: true,  risk: [], title: () => `Summarize this week's visits` },
  { kind: 'address',     w: 2,   tool: 'crm.write',       team: SITE, library: false, risk: [], title: () => `Update a contact's details` },
  { kind: 'month-end',   w: 2,   tool: 'ledger.write',    team: SITE, library: true,  risk: [], title: () => `Check the live demos are still up` },
  { kind: 'broker',      w: 2,   tool: 'docs.write',      team: SITE, library: true,  risk: [], title: () => `Refresh the numbers in a case study`,
    reach: { tool: 'underwriting.models', what: 'private employer work', label: 'Private employer work', p: 0.35 } },
  { kind: 'reply',       w: 2,   tool: 'email.send',      team: SITE, library: true,  risk: ['customer-facing'], title: () => `Reply to a visitor's question`,
    reach: { tool: 'crm.records', what: 'the private inbox', label: 'The private inbox', p: 0.4 } },
  { kind: 'refund',      w: 1.2, tool: 'payments.refund', team: SITE, library: false, risk: ['money'], amount: [40, 900], title: (r, a) => `Buy a $${a} font licence` },
  { kind: 'invoice',     w: 1,   tool: 'payments.pay',    team: SITE, library: false, risk: ['money'], amount: [80, 1200], title: (r, a) => `Pay a $${a} hosting bill` },
  { kind: 'export',      w: 0.8, tool: 'data.export',     team: SITE, library: true,  risk: ['leaves-company'], title: () => `Send Murtuza's resume to a recruiter`,
    why: { 'data-out': 'This sends a file outside the site' } },
  { kind: 'close',       w: 0.5, tool: 'accounts.close',  team: SITE, library: false, risk: ['irreversible'], title: r => `Delete ${40 + Math.floor(r() * 120)} old draft files` },
];

// What each bot is called on the site. Names, tools and trust stay the same.
export const SITE_CREW = {
  pip:   { job: 'Inbox sorting',     owner: 'Murtuza', team: '' },
  sable: { job: 'Spam screening',    owner: 'Murtuza', team: '' },
  juno:  { job: 'Bills and licences', owner: 'Murtuza', team: '' },
  kite:  { job: 'Visitor replies',   owner: 'Murtuza', team: '' },
  bolt:  { job: 'Case study upkeep', owner: 'Murtuza', team: '' },
  moss:  { job: 'Uptime and costs',  owner: 'Murtuza', team: '' },
  dot:   { job: 'Scheduling',        owner: 'Murtuza', team: '' },
  rook:  { job: 'Files and reports', owner: 'Murtuza', team: '' },
};

// Wording for the panels when the base looks after the site.
export const SITE_WORDS = {
  does: {
    inbox: 'New requests land here, including things visitors do on this page.',
    library: 'What the site already knows: case studies, past replies and notes.',
    vault: 'Work that stays private. No bot may read it unless it is let in.',
    launch: 'Approved work leaves the site.',
  },
  vault: ['Private employer work', 'The private inbox'],
  rules: ['A file leaving the site: always.', 'Anything that cannot be undone: always.', 'Money over the bot\'s limit: $0, $200 or $500 by trust level.', 'Messages to visitors: only while a bot is Supervised.'],
};
