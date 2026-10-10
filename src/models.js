// Models paused in Umbra. Umbra decides which AI models agents may run on; when a person pauses one there,
// every bot here that runs on it stops until the model is resumed. Umbra writes one small record:
//   localStorage key `umbra.models.paused`  ->  { v: 1, paused: [{ id, name }, ...] }
// Both sites share an origin in production, so Outpost hears the change as it happens.
// Like the handoff, the record is untrusted: it is checked here, and only model names come out.
import { cleanText } from './handoff.js';

export const MODEL_PAUSE_KEY = 'umbra.models.paused';
const MAX_INPUT = 4000, MAX_MODELS = 8;

/** The names of the models Umbra has paused, from the stored JSON (or a parsed value). Anything malformed gives []. */
export function parseModelPause(input) {
  let o = input;
  if (typeof input === 'string') {
    if (input.length > MAX_INPUT) return [];
    try { o = JSON.parse(input); } catch (e) { return []; }
  }
  if (!o || typeof o !== 'object' || o.v !== 1 || !Array.isArray(o.paused)) return [];
  const names = o.paused.slice(0, MAX_MODELS).map(m => cleanText(m && m.name, 40)).filter(Boolean);
  return [...new Set(names)];
}
