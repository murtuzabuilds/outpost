// The crew at Kestrel Mutual, the fictional insurer from the Umbra demo.
// Every bot has one human owner, a badge of tools it may use, and a record of clean runs.

export const TOOLS = {
  'claims.write':    'Sort and update claims',
  'fraud.flag':      'Flag suspicious claims',
  'payments.refund': 'Issue refunds',
  'payments.pay':    'Pay invoices',
  'email.send':      'Send customer emails',
  'crm.read':        'Read contact details',
  'crm.write':       'Update contact details',
  'crm.records':     'Read full customer records',
  'docs.write':      'Write documents',
  'calendar.write':  'Book calendar time',
  'ledger.write':    'Post to the ledger',
  'data.export':     'Send data outside the company',
  'accounts.close':  'Close accounts',
  'underwriting.models': 'Read underwriting models',
};

export const CREW = [
  { id: 'pip',   name: 'Pip',   job: 'Claims intake',     owner: 'Rosa Chen',    team: 'Claims',        clean: 9, color: '#F08C6E', body: 'pod',  hat: 'antenna',
    tools: ['claims.write', 'docs.write', 'crm.read'], quirk: 'Sorts everything. Including the snacks.' },
  { id: 'sable', name: 'Sable', job: 'Fraud screening',   owner: 'Dev Okoye',    team: 'Claims',        clean: 5, color: '#A99BF5', body: 'cone', hat: 'visor',
    tools: ['fraud.flag', 'crm.read'], quirk: 'Trusts no one. Fair, given the job.' },
  { id: 'juno',  name: 'Juno',  job: 'Refunds and billing', owner: 'Priya Patel', team: 'Finance',      clean: 4, color: '#E6C06A', body: 'box',  hat: 'halo',
    tools: ['payments.refund', 'payments.pay', 'crm.read'], quirk: 'Counts twice, pays once.' },
  { id: 'kite',  name: 'Kite',  job: 'Customer replies',  owner: 'Hana Lopez',   team: 'Customer Care', clean: 1, color: '#7CC2F0', body: 'pod',  hat: 'prop',
    tools: ['email.send', 'crm.read', 'crm.write'], quirk: 'New here. Very keen. Asks before sending.' },
  { id: 'bolt',  name: 'Bolt',  job: 'Broker assist',     owner: 'Wren Hayes',   team: 'Underwriting',  clean: 6, color: '#74D6BC', body: 'drum', hat: 'spike',
    tools: ['docs.write', 'calendar.write', 'crm.write', 'crm.read'], quirk: 'Fastest on the deck and knows it.' },
  { id: 'moss',  name: 'Moss',  job: 'Month-end close',   owner: 'Omar Ito',     team: 'Finance',       clean: 8, color: '#A9D47A', body: 'box',  hat: 'cap',
    tools: ['ledger.write', 'payments.pay', 'accounts.close'], quirk: 'Has never once rounded up.' },
  { id: 'dot',   name: 'Dot',   job: 'Scheduling',        owner: 'Mateo Diaz',   team: 'Claims',        clean: 2, color: '#EE8FBA', body: 'pod',  hat: 'bow',
    tools: ['calendar.write', 'crm.read'], quirk: 'Believes every problem is a calendar problem.' },
  { id: 'rook',  name: 'Rook',  job: 'Records and reports', owner: 'Lena Fischer', team: 'Data Science', clean: 3, color: '#B9C4DC', body: 'cone', hat: 'dish',
    tools: ['docs.write', 'data.export', 'accounts.close'], quirk: 'Remembers everything. Brings it up.' },
];

export const byId = Object.fromEntries(CREW.map(c => [c.id, c]));

// The looks a bot can have. A bot that joins later (see handoff.js) is given one of each, picked from its id.
export const BODIES = ['pod', 'box', 'cone', 'drum'];
export const HATS = ['antenna', 'visor', 'halo', 'prop', 'spike', 'cap', 'bow', 'dish'];
export const COLORS = CREW.map(c => c.color);

// Adds a bot that joined after the start, so every panel can look it up by id. Entries are kept after
// the bot leaves, so the logbook and a rewind can still name it. The original eight are never replaced.
export function register(spec) {
  if (!spec || !spec.id || CREW.some(c => c.id === spec.id)) return false;
  byId[spec.id] = spec;
  return true;
}
