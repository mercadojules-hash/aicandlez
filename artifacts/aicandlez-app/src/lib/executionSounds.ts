/**
 * executionSounds.ts — Cinematic execution feedback via Web Audio API.
 *
 * No external assets. Every sound is synthesised at runtime so it ships zero
 * bytes of audio data and works offline. Inspired by trading-desk fills,
 * fintech reward chimes, and futuristic AI confirmation tones.
 *
 * State map:
 *   submitted   → short blip       (acknowledge tap)
 *   pending     → soft tick        (order accepted, awaiting fill)
 *   filled      → 3-note chord     (TRADE EXECUTED — premium)
 *   profit      → 4-note arpeggio  (PROFITABLE — luxury bell shimmer)
 *   rejected    → descending buzz  (clear, non-grating error)
 */

export type FeedbackState = "submitted" | "pending" | "filled" | "profit" | "rejected";

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setExecutionSoundMuted(v: boolean) { muted = v; }
export function isExecutionSoundMuted() { return muted; }

interface ToneOpts {
  freq:    number;
  start:   number;
  dur:     number;
  type?:   OscillatorType;
  gain?:   number;
  attack?: number;
  release?:number;
  detune?: number;
}

function tone(ac: AudioContext, master: AudioNode, o: ToneOpts) {
  const osc  = ac.createOscillator();
  const gain = ac.createGain();
  const g    = o.gain    ?? 0.18;
  const att  = o.attack  ?? 0.008;
  const rel  = o.release ?? 0.08;
  osc.type      = o.type ?? "sine";
  osc.frequency.value = o.freq;
  if (o.detune) osc.detune.value = o.detune;
  gain.gain.setValueAtTime(0.0001, o.start);
  gain.gain.exponentialRampToValueAtTime(g,      o.start + att);
  gain.gain.exponentialRampToValueAtTime(0.0001, o.start + o.dur + rel);
  osc.connect(gain).connect(master);
  osc.start(o.start);
  osc.stop(o.start + o.dur + rel + 0.02);
}

function makeBus(ac: AudioContext): AudioNode {
  // Master bus → mild lowpass + soft compressor for a "polished" tone.
  const lp   = ac.createBiquadFilter();
  lp.type    = "lowpass";
  lp.frequency.value = 8000;
  lp.Q.value = 0.5;
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value      = 22;
  comp.ratio.value     = 3;
  comp.attack.value    = 0.003;
  comp.release.value   = 0.18;
  const out  = ac.createGain();
  out.gain.value = 0.85;
  lp.connect(comp).connect(out).connect(ac.destination);
  return lp;
}

export function playExecutionSound(state: FeedbackState) {
  if (muted) return;
  const ac = getCtx();
  if (!ac) return;
  const bus = makeBus(ac);
  const t0  = ac.currentTime + 0.005;

  switch (state) {
    case "submitted": {
      // Quick acknowledge blip — bright sine
      tone(ac, bus, { freq: 1320, start: t0,        dur: 0.045, type: "sine",     gain: 0.16, release: 0.06 });
      tone(ac, bus, { freq: 1980, start: t0 + 0.02, dur: 0.04,  type: "triangle", gain: 0.06, release: 0.04 });
      break;
    }
    case "pending": {
      // Soft "tick" — a hint of forward motion
      tone(ac, bus, { freq: 880,  start: t0,        dur: 0.05,  type: "sine",     gain: 0.12, release: 0.08 });
      tone(ac, bus, { freq: 1760, start: t0 + 0.06, dur: 0.04,  type: "sine",     gain: 0.05, release: 0.05 });
      break;
    }
    case "filled": {
      // Cinematic 3-note ascending chord — "TRADE EXECUTED"
      // C5 → E5 → G5 perfect-fifth lift, with shimmer harmonic overlay.
      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((f, i) => {
        const start = t0 + i * 0.085;
        tone(ac, bus, { freq: f,         start, dur: 0.32, type: "sine",     gain: 0.22, attack: 0.005, release: 0.30 });
        tone(ac, bus, { freq: f * 2,     start, dur: 0.32, type: "triangle", gain: 0.07, attack: 0.005, release: 0.30 });
        tone(ac, bus, { freq: f * 0.5,   start, dur: 0.30, type: "sine",     gain: 0.10, attack: 0.005, release: 0.28 });
      });
      // Closing sparkle
      tone(ac, bus, { freq: 1567.98, start: t0 + 0.30, dur: 0.45, type: "sine", gain: 0.10, attack: 0.01, release: 0.55 });
      tone(ac, bus, { freq: 2093.00, start: t0 + 0.35, dur: 0.40, type: "sine", gain: 0.06, attack: 0.01, release: 0.50 });
      break;
    }
    case "profit": {
      // Luxury 4-note major arpeggio with bell shimmer — "MONEY MADE"
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
      notes.forEach((f, i) => {
        const start = t0 + i * 0.09;
        tone(ac, bus, { freq: f,       start, dur: 0.38, type: "sine",     gain: 0.24, attack: 0.005, release: 0.40 });
        tone(ac, bus, { freq: f * 3,   start, dur: 0.32, type: "sine",     gain: 0.06, attack: 0.005, release: 0.36 });
        tone(ac, bus, { freq: f * 1.5, start, dur: 0.30, type: "triangle", gain: 0.05, attack: 0.005, release: 0.36 });
      });
      // Bell-like tail
      tone(ac, bus, { freq: 2093.00, start: t0 + 0.42, dur: 0.55, type: "sine", gain: 0.12, attack: 0.01, release: 0.85 });
      tone(ac, bus, { freq: 3135.96, start: t0 + 0.50, dur: 0.50, type: "sine", gain: 0.06, attack: 0.01, release: 0.85 });
      break;
    }
    case "rejected": {
      // Descending minor-second buzz — assertive but not alarming
      tone(ac, bus, { freq: 220, start: t0,        dur: 0.10, type: "sawtooth", gain: 0.14, release: 0.10 });
      tone(ac, bus, { freq: 165, start: t0 + 0.10, dur: 0.18, type: "sawtooth", gain: 0.12, release: 0.18 });
      tone(ac, bus, { freq: 110, start: t0 + 0.22, dur: 0.10, type: "sine",     gain: 0.10, release: 0.12 });
      break;
    }
  }
}
