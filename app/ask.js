// The command bar. Typed requests are matched with plain rules, not a language model,
// so the same words always do the same thing. In a real product a model would fill this slot.
import { CREW, byId, statusOf } from '../src/index.js';

const AREAS = [
  { re: /pay|money|refund|invoice|billing/, prefix: 'payments', label: 'payments' },
  { re: /customer|email|message|repl/, prefix: 'email', label: 'customer email' },
  { re: /data|export|record/, prefix: 'data', label: 'data export' },
  { re: /account/, prefix: 'accounts', label: 'accounts' },
  { re: /claim/, prefix: 'claims', label: 'claims' },
];
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

export function ask(text, api) {
  const q = text.toLowerCase().trim(), s = api.sim.state;
  if (!q) return '';
  const bot = CREW.find(c => new RegExp('\\b' + c.id + '\\b').test(q));
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
    if (/all|every/.test(q)) { const ids = CREW.map(c => c.id).filter(id => api.sim.pause(id)); return `Paused all ${ids.length} bots.`; }
    return 'Pause who? Try "pause Juno" or "pause everything touching payments".';
  }
  if (/risky|refund|export|close account|danger/.test(q) && /send|new|give|try|make/.test(q)) { const t = api.dispatch(/export|data/.test(q) ? 'export' : /close/.test(q) ? 'close' : 'refund'); return `Sent ${t.id}: ${t.title}. Watch the Gate.`; }
  if (/\b(send|new|dispatch|add)\b.*\b(task|job|work|one)\b|^send/.test(q)) { const t = api.dispatch(); return `Sent ${t.id}: ${t.title}.`; }
  if (/roll ?call|list|table|everyone|all bots/.test(q)) { api.openList(); return 'Roll call. Everyone, in one list.'; }
  if (/rewind|what (just )?happened|go back|replay/.test(q)) { api.rewind(25); return 'Rewound 25 seconds. Drag the timeline to look around, then press the button on its left to return.'; }
  if (/trust|level|limit/.test(q) && bot) { api.select(bot.id); return `${bot.name}'s trust and limits are in the panel.`; }
  if (bot) { api.select(bot.id); return `${bot.name}: ${statusOf(s, bot.id).toLowerCase()}.`; }
  if (/gate|approv/.test(q)) { api.focus('gate'); return 'The Gate is where risky work waits for you.'; }
  if (/vault|secret|off.?limits/.test(q)) { api.focus('vault'); return 'The Vault holds what no bot may touch without being let in.'; }
  if (/help|what can|how/.test(q)) return 'Try: "who needs me?", "where is Kite?", "pause everything touching payments", "send a risky task", "rewind".';
  return 'I can find bots, pause them, send tasks and rewind. Try "who needs me?"';
}
