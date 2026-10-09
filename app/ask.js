// The command bar. Typed requests are matched with plain rules, not a language model,
// so the same words always do the same thing. In a real product a model would fill this slot.
import { byId, statusOf, STATIONS } from '../src/index.js';

const AREAS = [
  { re: /pay|money|refund|invoice|billing/, prefix: 'payments', label: 'payments' },
  { re: /customer|email|message|repl/, prefix: 'email', label: 'customer email' },
  { re: /data|export|record/, prefix: 'data', label: 'data export' },
  { re: /account/, prefix: 'accounts', label: 'accounts' },
  { re: /claim/, prefix: 'claims', label: 'claims' },
];
// One line that says what every station is for, for anyone asking for help.
const GUIDE = ['beacon', 'library', 'workshop', 'check', 'gate', 'launch', 'vault'].map(id => `${STATIONS[id].name.replace(/^The /, 'the ')} (${STATIONS[id].gloss})`).join(', ');
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

export function ask(text, api) {
  const q = text.toLowerCase().trim(), s = api.sim.state;
  if (!q) return '';
  const bot = s.agents.map(a => byId[a.id]).find(c => new RegExp('\\b' + c.name.toLowerCase().replace(/[^a-z0-9 ]/g, '') + '\\b').test(q));
  const names = ids => list(ids.map(id => byId[id].name));

  if (/who.*(need|wait)|waiting on me|needs? me|what.*need/.test(q)) {
    const w = s.approvals, i = s.incidents;
    if (!w.length && !i.length) return 'Nobody. The crew is fine on its own right now.';
    api.focus(i.length ? 'vault' : 'gate');
    const parts = []; if (w.length) parts.push(`${names(w)} ${w.length > 1 ? 'are' : 'is'} at the Gate`); if (i.length) parts.push(`${names(i.map(x => x.agent))} ${i.length > 1 ? 'are' : 'is'} stopped at the Vault`);
    return parts.join(', and ') + '.';
  }
  if (/\b(resume|unpause|carry on|continue|wake)\b/.test(q)) {
    if (bot) { api.sim.resume(bot.id); api.select(bot.id); return `${bot.name} is back at work.`; }
    const ids = api.sim.resumeAll(); return ids.length ? `Resumed ${names(ids)}.` : 'Nobody was paused.';
  }
  if (/\b(pause|stop|hold|freeze|halt)\b/.test(q)) {
    if (bot) { api.sim.pause(bot.id); api.select(bot.id); return `${bot.name} is paused. It stays where it is until you resume it.`; }
    const area = AREAS.find(a => a.re.test(q));
    if (area) { const ids = api.sim.pauseWhere(area.prefix); return ids.length ? `Paused ${names(ids)}: every bot that can touch ${area.label}.` : `Every bot that can touch ${area.label} is already paused.`; }
    if (/all|every/.test(q)) { const ids = s.agents.map(a => a.id).filter(id => api.sim.pause(id)); return `Paused all ${ids.length} bots.`; }
    return 'Pause who? Try "pause Juno" or "pause everything touching payments".';
  }
  if (/risky|refund|export|close account|danger/.test(q) && /send|new|give|try|make/.test(q)) { const t = api.dispatch(/export|data/.test(q) ? 'export' : /close/.test(q) ? 'close' : 'refund'); return `Sent ${t.id}: ${t.title}. Watch the Gate.`; }
  if (/\b(send|new|dispatch|add)\b.*\b(task|job|work|one)\b|^send/.test(q)) { const t = api.dispatch(); return `Sent ${t.id}: ${t.title}.`; }
  if (/authority|autonomy|policy|lab|what.?if|simulat|limit.*(change|raise|lower)|(change|raise|lower).*limit/.test(q) && !bot) { api.openPanel('lab'); return 'The Autonomy lab. Set what the crew may do alone and replay 20 shifts before anything changes.'; }
  if (/logbook|ledger|audit|export|history|decisions?\b|who (approved|decided)/.test(q)) { api.openPanel('ledger'); return 'The logbook: every decision, the rule that fired and who made it.'; }
  if (/roll ?call|list|table|everyone|all bots/.test(q)) { api.openList(); return 'Roll call. Everyone, in one list.'; }
  if (/rewind|what (just )?happened|go back|replay/.test(q)) { api.rewind(25); return 'Rewound 25 seconds. Drag the timeline to look around, then press the button on its left to return.'; }
  if (/trust|level|limit/.test(q) && bot) { api.select(bot.id); return `${bot.name}'s trust and limits are in the panel.`; }
  if (bot) { api.select(bot.id); return `${bot.name}: ${statusOf(s, bot.id).toLowerCase()}.`; }
  if (/approv/.test(q)) { api.focus('gate'); return 'The Gate waits for your yes: risky work stops there until a person decides.'; }
  if (/secret|off.?limits/.test(q)) { api.focus('vault'); return 'The Vault holds off-limits data. No bot may touch it without being let in.'; }
  const st = Object.values(STATIONS).find(x => new RegExp('\\b' + x.name.toLowerCase().replace(/^the /, '').split(' ')[0] + '\\b').test(q));
  if (st) { api.focus(st.id); return `${st.name} (${st.gloss}). ${st.does}`; }
  if (/help|what can|how|station/.test(q)) return `The stations: ${GUIDE}. Try: "who needs me?", "where is Kite?", "pause everything touching payments", "open the lab", "show the logbook", "rewind".`;
  return 'I can find bots, pause them, send tasks and rewind. Try "who needs me?"';
}
