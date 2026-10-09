// The base. Each station is a place a bot can be, and where a bot stands tells you what it is doing.
// `gloss` is the few words that say what a station is for, shown wherever its name first appears.
// Coordinates are in tiles on the deck; the app draws them, the engine only needs distances.

export const STATIONS = {
  inbox:    { id: 'inbox',    name: 'Inbox', gloss: 'where work arrives',         x: -33, z: -1,  dwell: 1.1, color: '#D5DEF2', does: 'New requests land here and wait for a bot with the right tools.' },
  beacon:   { id: 'beacon',   name: 'Briefing', gloss: 'plans the work',      x: 0,   z: 0,   dwell: 1.6, color: '#6F86FF', does: 'Each request is broken into steps before any work starts.' },
  library:  { id: 'library',  name: 'Library', gloss: 'reads references',       x: -17, z: -27, dwell: 1.7, color: '#D5DEF2', does: 'What the company already knows: policies, past cases and templates.' },
  workshop: { id: 'workshop', name: 'Workshop', gloss: 'does the work',      x: 15,  z: -29, dwell: 2.6, color: '#D5DEF2', does: 'Where bots use their tools. A bot can only use the tools on its badge.' },
  check:    { id: 'check',    name: 'Checkpoint', gloss: 'checks it',    x: 33,  z: -5,  dwell: 1.4, color: '#D5DEF2', does: 'Finished work is tested against the rules before it goes anywhere.' },
  gate:     { id: 'gate',     name: 'The Gate', gloss: 'waits for your yes',      x: 25,  z: 23,  dwell: 0.9, color: '#FFB547', does: 'Risky work waits here for a person\'s yes.' },
  launch:   { id: 'launch',   name: 'Launchpad', gloss: 'ships it',     x: -3,  z: 34,  dwell: 1.0, color: '#D5DEF2', does: 'Approved work leaves the base.' },
  dock:     { id: 'dock',     name: 'Charging Dock', gloss: 'where bots rest', x: -23, z: 21,  dwell: 0,   color: '#D5DEF2', does: 'Bots with nothing to do rest here. Every bot has its own pad.' },
  vault:    { id: 'vault',    name: 'The Vault', gloss: 'off-limits data',     x: 56,  z: -40, dwell: 1.5, color: '#FF4D5E', does: 'Data and tools that are off limits unless a bot was given access.' },
};

export const SPEED = 10; // tiles per second

export function distance(a, b) {
  const A = STATIONS[a], B = STATIONS[b];
  return Math.hypot(A.x - B.x, A.z - B.z);
}
