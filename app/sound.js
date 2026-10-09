// A few synth blips. Off until someone turns it on, because browsers only allow sound after a click.
export function makeSound() {
  let ac = null, on = false, master = null;
  function tone(f, at, dur, type = 'sine', vol = 0.09, to = null) {
    const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(f, t0); if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  const S = {
    drop: () => { tone(180, 0, 0.16, 'triangle', 0.12, 90); },
    pickup: () => { tone(520, 0, 0.08, 'square', 0.04); tone(780, 0.07, 0.1, 'square', 0.04); },
    wait: () => { tone(440, 0, 0.14, 'triangle', 0.09); tone(349, 0.16, 0.22, 'triangle', 0.09); },
    approve: () => { tone(523, 0, 0.12, 'triangle', 0.1); tone(659, 0.1, 0.12, 'triangle', 0.1); tone(784, 0.2, 0.26, 'triangle', 0.1); },
    back: () => { tone(392, 0, 0.14, 'triangle', 0.08); tone(294, 0.13, 0.22, 'triangle', 0.08); },
    launch: () => { tone(220, 0, 0.5, 'sawtooth', 0.05, 1400); tone(1568, 0.5, 0.3, 'sine', 0.06); },
    incident: () => { tone(160, 0, 0.18, 'square', 0.07); tone(160, 0.26, 0.18, 'square', 0.07); tone(160, 0.52, 0.18, 'square', 0.07); },
    level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.08, 0.16, 'triangle', 0.09)); },
    fail: () => { tone(220, 0, 0.2, 'sawtooth', 0.05, 150); },
    tap: () => { tone(660, 0, 0.05, 'square', 0.03); },
    dock: () => { [392, 523, 659, 880].forEach((f, i) => tone(f, i * 0.11, 0.42, 'sine', 0.05)); },
    drill: () => { tone(110, 0, 0.32, 'sawtooth', 0.05, 82); tone(110, 0.4, 0.32, 'sawtooth', 0.05, 82); tone(880, 0.85, 0.2, 'sine', 0.035); },
  };
  return {
    get on() { return on; },
    toggle() {
      on = !on;
      if (on && !ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination); } catch (e) { on = false; } }
      if (ac) ac.resume && ac.resume(); if (on) S.approve(); return on;
    },
    play(name) { if (on && ac && S[name]) { try { S[name](); } catch (e) {} } },
  };
}
