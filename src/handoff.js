// The handoff from Umbra: how a bot approved in Umbra joins the crew here.
//
// Umbra decides what AI gets in: which agents are allowed, their owner, the approved model each runs on and what each may touch. It hands that
// over in one of two ways, carrying the same object:
//   localStorage key `umbra.outpost.handoff`  (both sites share an origin in production)
//   URL hash `#dock=<base64url of the JSON>`   (covers local testing on different ports)
// The object is { v: 1, agents: [AGENT, ...] }. Everything that arrives is treated as untrusted: it is
// checked field by field, anything malformed is dropped, and at most three bots are docked.
// This module is pure: it parses, checks and converts. It does not touch the page, storage or the simulation.
import { TOOLS, BODIES, HATS, COLORS, CREW } from './crew.js';

export const HANDOFF_KEY = 'umbra.outpost.handoff';
export const MAX_DOCKED = 3;
const MAX_INPUT = 20000, MAX_SEEN = 12;
const CAP = { name: 16, job: 48, owner: 48, team: 32, umbraName: 64, rule: 90, rules: 6 };
const ID = /^umb-[a-z0-9][a-z0-9-]{0,39}$/;
const ISO = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

// Control characters and bidirectional overrides are removed, runs of space collapse, and the text is cut to `max` characters.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;
export function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return Array.from(v.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim();
}

const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// One agent from the handoff, checked. Returns { agent } with only the known fields, or { error }.
export function checkAgent(x) {
  if (!plain(x)) return { error: 'not an object' };
  if (x.source !== 'umbra') return { error: 'source is not umbra' };
  if (typeof x.id !== 'string' || !ID.test(x.id)) return { error: 'bad id' };
  const name = cleanText(x.name, CAP.name), owner = cleanText(x.owner, CAP.owner);
  if (!name) return { error: `${x.id}: no name` };
  if (!owner) return { error: `${x.id}: no owner` };
  if (!Array.isArray(x.tools)) return { error: `${x.id}: tools is not a list` };
  const tools = [...new Set(x.tools.filter(t => typeof t === 'string' && Object.prototype.hasOwnProperty.call(TOOLS, t)))];
  if (!tools.length) return { error: `${x.id}: no known tools` };
  if (typeof x.limit !== 'number' || !Number.isFinite(x.limit) || x.limit < 0) return { error: `${x.id}: bad limit` };
  if (typeof x.approvedAt !== 'string' || x.approvedAt.length > 40 || !ISO.test(x.approvedAt) || Number.isNaN(Date.parse(x.approvedAt))) return { error: `${x.id}: bad approvedAt` };
  const model = cleanText(x.model, 40);
  const rules = Array.isArray(x.rules) ? x.rules.map(r => cleanText(r, CAP.rule)).filter(Boolean).slice(0, CAP.rules) : [];
  return {
    agent: {
      id: x.id, name, job: cleanText(x.job, CAP.job), owner, team: cleanText(x.team, CAP.team), tools,
      limit: Math.min(100000, Math.round(x.limit)), approvedAt: x.approvedAt, source: 'umbra',
      umbraName: cleanText(x.umbraName, CAP.umbraName) || name, model, rules,
    },
  };
}

// The whole handoff object, as a JSON string or an already parsed value.
// Returns { agents, errors }: agents are checked and de-duplicated by id, at most MAX_DOCKED.
export function parseHandoff(input) {
  const errors = [];
  let o = input;
  if (typeof input === 'string') {
    if (input.length > MAX_INPUT) return { agents: [], errors: ['too large'] };
    try { o = JSON.parse(input); } catch (e) { return { agents: [], errors: ['not JSON'] }; }
  }
  if (!plain(o) || o.v !== 1 || !Array.isArray(o.agents)) return { agents: [], errors: ['not a v1 handoff'] };
  const agents = [], seen = new Set();
  for (const x of o.agents.slice(0, MAX_SEEN)) {
    const r = checkAgent(x);
    if (r.error) { errors.push(r.error); continue; }
    if (seen.has(r.agent.id)) { errors.push(`${r.agent.id}: duplicate`); continue; }
    if (agents.length >= MAX_DOCKED) { errors.push(`${r.agent.id}: more than ${MAX_DOCKED}`); continue; }
    seen.add(r.agent.id); agents.push(r.agent);
  }
  return { agents, errors };
}

// ---------- base64url, written out so it behaves the same in a browser and in Node ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function utf8(str) { return new TextEncoder().encode(str); }
export function encodeHandoff(obj) {
  const b = utf8(JSON.stringify(obj)); let out = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '') + (i + 2 < b.length ? B64[n & 63] : '');
  }
  return out;
}
function decode64(s) {
  s = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (!/^[A-Za-z0-9_-]*$/.test(s) || s.length % 4 === 1) return null;
  const bytes = [];
  for (let i = 0; i < s.length; i += 4) {
    const c = [0, 1, 2, 3].map(k => (i + k < s.length ? B64.indexOf(s[i + k]) : 0)), n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
    bytes.push((n >> 16) & 255); if (i + 2 < s.length) bytes.push((n >> 8) & 255); if (i + 3 < s.length) bytes.push(n & 255);
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)); } catch (e) { return null; }
}

// The JSON text carried by a `#dock=` hash, or null. The hash may hold other parameters joined with `&`.
export function decodeHash(hash) {
  if (typeof hash !== 'string' || hash.length > MAX_INPUT * 2) return null;
  const parts = hash.replace(/^#/, '').split('&'), p = parts.find(x => x.startsWith('dock='));
  if (!p) return null;
  let v = p.slice(5);
  try { v = decodeURIComponent(v); } catch (e) { return null; }
  return v ? decode64(v) : null;
}

// Reads both places: the hash first, then storage. Agents found in both are kept once (the hash wins).
// Returns { agents, fromHash, fromStorage, errors }.
export function readHandoff({ hash = '', stored = null } = {}) {
  const h = decodeHash(hash), a = h != null ? parseHandoff(h) : { agents: [], errors: [] };
  const b = stored ? parseHandoff(stored) : { agents: [], errors: [] };
  const agents = a.agents.slice();
  for (const x of b.agents) if (agents.length < MAX_DOCKED && !agents.some(y => y.id === x.id)) agents.push(x);
  return { agents, fromHash: a.agents.length, fromStorage: b.agents.length, errors: a.errors.concat(b.errors) };
}

// Storage helpers: what to write back after docking, and after undocking one bot (null means remove the key).
export function storedWith(stored, agents) {
  const prev = stored ? parseHandoff(stored).agents : [], out = prev.slice();
  for (const x of agents) if (!out.some(y => y.id === x.id) && out.length < MAX_DOCKED) out.push(x);
  return JSON.stringify({ v: 1, agents: out.map(toContract) });
}
export function storedWithout(stored, id) {
  const left = stored ? parseHandoff(stored).agents.filter(x => x.id !== id) : [];
  return left.length ? JSON.stringify({ v: 1, agents: left.map(toContract) }) : null;
}

export const toContract = a => ({ id: a.id, name: a.name, job: a.job, owner: a.owner, team: a.team, tools: a.tools.slice(), limit: a.limit, approvedAt: a.approvedAt, source: 'umbra', umbraName: a.umbraName, model: a.model, rules: a.rules.slice() });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'an unknown date' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }

// A checked agent as a crew member. It starts Supervised with no clean runs, its Umbra limit becomes a
// ceiling on what it may move alone, and its look is picked from its id, so it is the same on every visit.
export function toSpec(a, o = {}) {
  const h = hash(a.id);
  // Two bots with one name would be confusing on the deck, so a clash with someone already aboard gets a suffix.
  const taken = new Set((o.taken || CREW.filter(c => c.id !== a.id).map(c => c.name)).map(n => n.toLowerCase()));
  let name = a.name; for (let k = 2; taken.has(name.toLowerCase()); k++) name = `${a.name.slice(0, 13)} ${k}`;
  return {
    id: a.id, name, job: a.job || 'Approved in Umbra', owner: a.owner, team: a.team, clean: 0, cap: a.limit,
    color: COLORS[h % COLORS.length], body: BODIES[(h >>> 8) % BODIES.length], hat: HATS[(h >>> 16) % HATS.length],
    tools: a.tools.slice(), model: a.model || '', quirk: `Known in Umbra as ${a.umbraName}.`,
    umbra: { umbraName: a.umbraName, rules: a.rules.slice(), approvedAt: a.approvedAt, approvedOn: formatDate(a.approvedAt), limit: a.limit, sample: !!o.sample },
  };
}

// The sample behind the "Dock a bot from Umbra" button, so the feature can be seen without Umbra. It is
// labelled as a sample wherever it shows, and it is never written to storage. It is built like a real
// handoff: an owner who exists in Umbra's org data, and tools that the crew's everyday work uses
// (customer replies and contact updates), so once docked it takes tasks like any other bot.
export const SAMPLE_AGENT = Object.freeze({
  id: 'umb-sample-lark', name: 'Lark', job: 'Claim status emails', owner: 'Hana Lopez', team: 'Customer Care',
  tools: ['email.send', 'crm.read', 'crm.write'], limit: 0, approvedAt: '2026-10-06T14:20:00Z', source: 'umbra',
  umbraName: 'Sample agent', model: 'Aster Enterprise',
  rules: ['Answers customers about their own claim only', 'Moves no money', 'Its customer emails wait for a person\'s yes while it is Supervised'],
});
