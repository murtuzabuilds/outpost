// Checks a ledger against the promises the product makes. It reads only the records, so it can be
// run on an exported ledger as well as a live one. An empty `breaks` list means every promise held.
//
//   1. Nothing that sends data out or cannot be undone was ever allowed by the rules alone.
//   2. No money moved alone above the limit that applied to that bot at that moment.
//   3. Every decision a person made answers something the rules held or stopped first.
const LOCKED_RISK = ['leaves-company', 'irreversible'], AFTER_HOLD = ['approved', 'sent back'], AFTER_STOP = ['kept out', 'allowed once', 'bot paused'];

export function verifyLedger(ledger) {
  const breaks = [], held = new Set(), stopped = new Set();
  let checked = 0;
  for (const e of ledger) {
    if (e.by === 'rules') {
      checked++;
      if (e.outcome === 'allow' && (e.risk || []).some(r => LOCKED_RISK.includes(r))) breaks.push({ n: e.n, why: 'a locked rule was skipped' });
      if (e.outcome === 'allow' && e.amount != null && e.limit != null && e.amount > e.limit) breaks.push({ n: e.n, why: 'money moved alone over the limit' });
      if (e.outcome === 'hold') held.add(e.task);
      if (e.outcome === 'stop') stopped.add(e.task);
    } else if (AFTER_HOLD.includes(e.outcome)) {
      checked++; if (!held.has(e.task)) breaks.push({ n: e.n, why: 'a person decided something the rules never held' });
    } else if (AFTER_STOP.includes(e.outcome)) {
      checked++; if (!stopped.has(e.task)) breaks.push({ n: e.n, why: 'a person decided a stop that never happened' });
    }
  }
  return { checked, breaks };
}
