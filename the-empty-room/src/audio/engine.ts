/**
 * Son entièrement procédural : aucun fichier, aucune licence.
 * Le contexte n'existe qu'après le premier geste (politique d'autoplay).
 */
import { BALLAD, VOID_NOTES, midiToHz } from './score';

export type LayerId = 'drone' | 'air' | 'rain' | 'wind' | 'ballad' | 'clock';
export type Sfx =
  | 'tick'
  | 'tock'
  | 'hesitate'
  | 'rewind'
  | 'step'
  | 'stepFar'
  | 'door'
  | 'locked'
  | 'buzz'
  | 'clink'
  | 'crack'
  | 'paper'
  | 'letter'
  | 'reveal'
  | 'steam'
  | 'switch'
  | 'bloom';

const LAYERS: LayerId[] = ['drone', 'air', 'rain', 'wind', 'ballad', 'clock'];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private noise!: AudioBuffer;
  private layers = {} as Record<LayerId, GainNode>;
  private targets: Partial<Record<LayerId, number>> = {};
  private volume = 0.7;
  private muted = false;
  private scheduler: number | undefined;
  private nextBar = 0;
  private bar = 0;
  private density = 0.2;
  private mode: 'ballad' | 'void' = 'ballad';

  get awake() {
    return this.ctx !== null;
  }

  /** À appeler depuis un geste utilisateur. */
  wake() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.55;
    const reverb = ctx.createConvolver();
    reverb.buffer = this.impulse(4.2);
    this.dry.connect(this.master);
    this.wet.connect(reverb).connect(this.master);

    this.noise = this.makeNoise(3);

    for (const id of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.dry);
      if (id === 'ballad' || id === 'clock') g.connect(this.wet);
      this.layers[id] = g;
    }
    this.buildDrone();
    this.buildAir();
    this.buildRain();
    this.buildWind();

    this.applyVolume(4);
    for (const [id, v] of Object.entries(this.targets)) this.setLayer(id as LayerId, v, 4);

    this.nextBar = ctx.currentTime + 1.5;
    this.scheduler = window.setInterval(() => this.schedule(), 250);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  setVolume(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    this.applyVolume(0.6);
  }

  private applyVolume(time: number) {
    if (!this.ctx) return;
    const v = this.muted ? 0 : this.volume * this.volume;
    this.ramp(this.master.gain, v, time);
  }

  setLayer(id: LayerId, value: number, time = 3) {
    this.targets[id] = value;
    if (!this.ctx) return;
    this.ramp(this.layers[id].gain, value, time);
  }

  setLayers(values: Partial<Record<LayerId, number>>, time = 3) {
    for (const [id, v] of Object.entries(values)) this.setLayer(id as LayerId, v ?? 0, time);
  }

  /** 0..1 : la ballade devient plus présente à mesure qu'on comprend. */
  setDensity(d: number) {
    this.density = Math.max(0, Math.min(1, d));
  }

  setMode(mode: 'ballad' | 'void') {
    this.mode = mode;
  }

  // ─── construction des couches ─────────────────────────

  private buildDrone() {
    const ctx = this.ctx!;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 0.4;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1 / 17.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();
    for (const [f, d, t] of [
      [36.71, -4, 'sawtooth'],
      [36.71, 5, 'sawtooth'],
      [55.0, 0, 'triangle'],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = t;
      o.frequency.value = f;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(filter);
      o.start();
    }
    filter.connect(this.layers.drone);
  }

  private noiseSource() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 2);
    return src;
  }

  private buildAir() {
    const ctx = this.ctx!;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    this.noiseSource().connect(lp).connect(g).connect(this.layers.air);
  }

  private buildRain() {
    const ctx = this.ctx!;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.value = 0.22;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    this.noiseSource().connect(hp).connect(lp).connect(g).connect(this.layers.rain);
  }

  private buildWind() {
    const ctx = this.ctx!;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 260;
    bp.Q.value = 0.8;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(bp.frequency);
    lfo.start();
    const g = ctx.createGain();
    g.gain.value = 0.5;
    this.noiseSource().connect(bp).connect(g).connect(this.layers.wind);
  }

  // ─── la ballade ───────────────────────────────────────

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextBar < ctx.currentTime + 1.2) {
      if (this.mode === 'ballad') this.scheduleBar(this.nextBar);
      else this.scheduleVoid(this.nextBar);
      this.nextBar += BALLAD.barSeconds;
      this.bar++;
    }
  }

  private scheduleBar(t: number) {
    const chord = BALLAD.progression[this.bar % BALLAD.progression.length];
    const out = this.layers.ballad;
    // nappe
    for (const n of chord.pad) this.pad(midiToHz(n), t, BALLAD.barSeconds + 1.5, 0.035, out);
    // basse
    if (this.bar % 2 === 0) this.piano(midiToHz(chord.root - 12), t, 0.1, out, 6);
    // mélodie : clairsemée, plus présente avec la compréhension
    const slots = [0, 1.2, 2.4, 3.6];
    for (const s of slots) {
      if (Math.random() > 0.15 + this.density * 0.55) continue;
      const pool = chord.melody;
      const note = pool[Math.floor(Math.random() * pool.length)];
      this.piano(midiToHz(note), t + s + Math.random() * 0.08, 0.07 + Math.random() * 0.04, out);
    }
  }

  private scheduleVoid(t: number) {
    if (Math.random() > 0.35) return;
    const n = VOID_NOTES[Math.floor(Math.random() * VOID_NOTES.length)];
    this.piano(midiToHz(n), t + Math.random() * 2, 0.04, this.layers.ballad, 7);
  }

  private pad(freq: number, t: number, dur: number, level: number, out: AudioNode) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 1.8);
    g.gain.setValueAtTime(level, t + dur - 1.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    for (const [type, det] of [
      ['sine', -6],
      ['triangle', 6],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    lp.connect(g).connect(out);
  }

  private piano(freq: number, t: number, level: number, out: AudioNode, decay = 4) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.012);
    g.gain.exponentialRampToValueAtTime(level * 0.35, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(7000, freq * 8), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(300, freq * 1.5), t + decay);
    for (const [h, a] of [
      [1, 1],
      [2, 0.28],
      [3, 0.08],
      [4.02, 0.04],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = freq * h;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
    lp.connect(g).connect(out);
  }

  // ─── bruits ponctuels ─────────────────────────────────

  play(sfx: Sfx, opts: { pan?: number; level?: number; delay?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + (opts.delay ?? 0);
    const level = opts.level ?? 1;
    const panner = ctx.createStereoPanner();
    panner.pan.value = opts.pan ?? 0;
    panner.connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 0.4;
    panner.connect(send).connect(this.wet);

    switch (sfx) {
      case 'tick':
      case 'tock':
        this.burst(t, 0.025, sfx === 'tick' ? 3400 : 2600, 6, 0.05 * level, this.layers.clock);
        break;
      case 'hesitate':
        this.burst(t, 0.02, 3400, 6, 0.04 * level, this.layers.clock);
        this.burst(t + 0.13, 0.02, 3000, 6, 0.03 * level, this.layers.clock);
        break;
      case 'rewind':
        this.glide(t, 520, 180, 0.9, 0.03 * level, 'sine', panner);
        break;
      case 'step':
      case 'stepFar': {
        const far = sfx === 'stepFar';
        this.burst(t, 0.07, far ? 380 : 520, 1.2, (far ? 0.05 : 0.12) * level, panner);
        this.glide(t, 90, 50, 0.12, (far ? 0.04 : 0.1) * level, 'sine', panner);
        break;
      }
      case 'door':
        this.creak(t, 1.6, 0.05 * level, panner);
        this.glide(t + 1.5, 70, 40, 0.3, 0.12 * level, 'sine', panner);
        break;
      case 'locked':
        this.burst(t, 0.04, 1800, 8, 0.08 * level, panner);
        this.burst(t + 0.11, 0.04, 1700, 8, 0.06 * level, panner);
        this.glide(t, 120, 90, 0.08, 0.05 * level, 'sine', panner);
        break;
      case 'buzz':
        for (let i = 0; i < 2; i++) this.vibrate(t + i * 0.55, 0.38, 0.08 * level, panner);
        break;
      case 'clink':
        for (const [f, a] of [
          [2310, 1],
          [3120, 0.6],
          [4870, 0.25],
        ]) this.glide(t, f, f * 0.998, 0.6, 0.025 * a * level, 'sine', panner, true);
        break;
      case 'crack':
        this.burst(t, 0.03, 2600, 3, 0.1 * level, panner);
        this.burst(t + 0.05, 0.08, 1400, 2, 0.06 * level, panner);
        break;
      case 'paper':
        this.burst(t, 0.28, 2400, 0.7, 0.035 * level, panner);
        break;
      case 'letter':
        this.piano(midiToHz(VOID_NOTES[Math.floor(Math.random() * VOID_NOTES.length)] + 12), t, 0.035 * level, panner, 3);
        break;
      case 'reveal':
        this.piano(midiToHz(VOID_NOTES[Math.floor(Math.random() * VOID_NOTES.length)]), t, 0.05 * level, panner, 6);
        break;
      case 'steam':
        this.burst(t, 1.4, 5200, 0.5, 0.012 * level, panner);
        break;
      case 'switch':
        this.burst(t, 0.015, 2200, 4, 0.07 * level, panner);
        break;
      case 'bloom':
        for (const n of [50, 57, 62, 65, 69, 74]) this.pad(midiToHz(n), t, 9, 0.03 * level, panner);
        break;
    }
  }

  private burst(t: number, dur: number, freq: number, q: number, level: number, out: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.02);
  }

  private glide(t: number, f0: number, f1: number, dur: number, level: number, type: OscillatorType, out: AudioNode, bell = false) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(bell ? level : 0, t);
    if (!bell) g.gain.linearRampToValueAtTime(level, t + Math.min(0.05, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private creak(t: number, dur: number, level: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(95, t);
    o.frequency.linearRampToValueAtTime(140, t + dur * 0.6);
    o.frequency.linearRampToValueAtTime(110, t + dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 4;
    const am = ctx.createOscillator();
    am.frequency.value = 23;
    const amGain = ctx.createGain();
    amGain.gain.value = level * 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.2);
    g.gain.linearRampToValueAtTime(0, t + dur);
    am.connect(amGain).connect(g.gain);
    o.connect(bp).connect(g).connect(out);
    o.start(t);
    am.start(t);
    o.stop(t + dur);
    am.stop(t + dur);
  }

  private vibrate(t: number, dur: number, level: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 148;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 0.03);
    g.gain.setValueAtTime(level, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur);
  }

  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // bruit légèrement rosé
      last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
      data[i] = (Math.random() * 2 - 1) * 0.6 + last * 4;
    }
    return buf;
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  private ramp(param: AudioParam, value: number, time: number) {
    const ctx = this.ctx!;
    param.cancelScheduledValues(ctx.currentTime);
    param.setValueAtTime(param.value, ctx.currentTime);
    param.linearRampToValueAtTime(value, ctx.currentTime + Math.max(0.02, time));
  }

  dispose() {
    window.clearInterval(this.scheduler);
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.ctx?.close();
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
