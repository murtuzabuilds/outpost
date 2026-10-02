// The base. Each station is a place a bot can be, and where a bot stands tells you what it is doing.
// Coordinates are in tiles on the deck; the app draws them, the engine only needs distances.

export const STATIONS = {
  inbox:    { id: 'inbox',    name: 'Inbox',         x: -33, z: -1,  dwell: 1.1, color: '#6FC3FF', does: 'New requests land here and wait for a bot with the right tools.' },
  beacon:   { id: 'beacon',   name: 'Briefing',      x: 0,   z: 0,   dwell: 1.6, color: '#FFF4D6', does: 'Each request is broken into steps before any work starts.' },
  library:  { id: 'library',  name: 'Library',       x: -17, z: -27, dwell: 1.7, color: '#B79CFF', does: 'What the company already knows: policies, past cases and templates.' },
  workshop: { id: 'workshop', name: 'Workshop',      x: 15,  z: -29, dwell: 2.6, color: '#FF8A6B', does: 'Where bots use their tools. A bot can only use the tools on its badge.' },
  check:    { id: 'check',    name: 'Checkpoint',    x: 33,  z: -5,  dwell: 1.4, color: '#6FE8C0', does: 'Finished work is tested against the rules before it goes anywhere.' },
  gate:     { id: 'gate',     name: 'The Gate',      x: 25,  z: 23,  dwell: 0.9, color: '#FFC857', does: 'Risky work stops here until a person says yes.' },
  launch:   { id: 'launch',   name: 'Launchpad',     x: -3,  z: 34,  dwell: 1.0, color: '#FF7EB6', does: 'Approved work leaves the base.' },
  dock:     { id: 'dock',     name: 'Charging Dock', x: -23, z: 21,  dwell: 0,   color: '#62D6E8', does: 'Bots with nothing to do rest here. Every bot has its own pad.' },
  vault:    { id: 'vault',    name: 'The Vault',     x: 56,  z: -40, dwell: 1.5, color: '#FF5470', does: 'Data and tools that are off limits unless a bot was given access.' },
};

export const SPEED = 10; // tiles per second

export function distance(a, b) {
  const A = STATIONS[a], B = STATIONS[b];
  return Math.hypot(A.x - B.x, A.z - B.z);
}
