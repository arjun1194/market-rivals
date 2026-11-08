// Tiny WebAudio synth for table sounds (no audio files needed).
import { store } from './net.js';

export class Sound {
  constructor() {
    this.enabled = store.get('mr-sound') !== 'off';
    this.ctx = null;
    const unlock = () => {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  toggle() {
    this.enabled = !this.enabled;
    store.set('mr-sound', this.enabled ? 'on' : 'off');
    return this.enabled;
  }

  tone(freq, dur, { type = 'sine', gain = 0.15, delay = 0, slide = 0 } = {}) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, { gain = 0.2, delay = 0, freq = 2000 } = {}) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination);
    src.start(c.currentTime + delay);
  }

  play(name) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    switch (name) {
      case 'dice':
        for (let i = 0; i < 6; i++) this.noise(0.05, { gain: 0.35 - i * 0.04, delay: 0.25 + i * 0.13 + Math.random() * 0.05, freq: 1800 + Math.random() * 1500 });
        break;
      case 'step':
        this.tone(520 + Math.random() * 60, 0.05, { type: 'triangle', gain: 0.06 });
        break;
      case 'thud':
        this.tone(140, 0.25, { type: 'sine', gain: 0.3, slide: 0.5 });
        break;
      case 'cash':
        this.tone(1320, 0.12, { type: 'triangle', gain: 0.09 });
        this.tone(1760, 0.18, { type: 'triangle', gain: 0.09, delay: 0.08 });
        break;
      case 'pay':
        this.tone(440, 0.14, { type: 'triangle', gain: 0.08 });
        this.tone(330, 0.2, { type: 'triangle', gain: 0.08, delay: 0.09 });
        break;
      case 'card':
        this.noise(0.25, { gain: 0.12, freq: 4000 });
        break;
      case 'build':
        this.tone(300, 0.08, { type: 'square', gain: 0.05 });
        this.tone(450, 0.1, { type: 'square', gain: 0.05, delay: 0.07 });
        break;
      case 'turn':
        this.tone(660, 0.15, { gain: 0.12 });
        this.tone(880, 0.22, { gain: 0.12, delay: 0.12 });
        break;
      case 'jail':
        this.tone(220, 0.4, { type: 'sawtooth', gain: 0.06, slide: 0.6 });
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', gain: 0.12, delay: i * 0.12 }));
        break;
    }
  }
}
