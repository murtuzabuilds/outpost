// Mounts the base inside another page. Everything lives in a shadow root, so the host page's
// styles and ids cannot collide with Outpost's, in either direction.
import { boot } from './main.js';
import { CSS, MARKUP } from './_assets.js';

export function mount(host, opts = {}) {
  const sh = host.shadowRoot || host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>${CSS}</style>${MARKUP}`;
  return boot(sh, { ...opts, embed: true, host });
}
