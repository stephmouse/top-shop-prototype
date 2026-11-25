import type { WalkSoundStyle } from '../config/walkSounds';

export type ToneFn = (
  freq: number,
  dur: number,
  type: OscillatorType,
  delay?: number,
  endFreq?: number,
  vol?: number
) => void;

function playWhoopee(
  audio: AudioContext | null | undefined,
  tone: ToneFn,
  startFreq: number,
  endFreq: number,
  dur: number,
  flutterHz: number,
  delay = 0,
  vol = 0.075
): void {
  if (
    !audio ||
    typeof audio.createBiquadFilter !== 'function' ||
    typeof audio.createBuffer !== 'function' ||
    typeof audio.createBufferSource !== 'function'
  ) {
    tone(startFreq, dur, 'sawtooth', delay, endFreq, 0.05);
    tone(Math.max(50, endFreq * 1.2), dur * 0.7, 'triangle', delay + 0.03, Math.max(45, endFreq * 0.85), 0.04);
    return;
  }

  const now = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const lfo = audio.createOscillator();
  const lfoGain = audio.createGain();
  const lp = audio.createBiquadFilter();
  const env = audio.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + dur);

  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(flutterHz, now);
  lfoGain.gain.setValueAtTime(28, now);
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(480, now);
  lp.Q.setValueAtTime(4.5, now);

  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(vol, now + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(lp);
  lp.connect(env);
  env.connect(audio.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
  lfo.start(now);
  lfo.stop(now + dur + 0.02);

  const samples = Math.max(256, Math.floor(audio.sampleRate * dur));
  const buf = audio.createBuffer(1, samples, audio.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < samples; i++) data[i] = Math.random() * 2 - 1;

  const noise = audio.createBufferSource();
  noise.buffer = buf;
  const bp = audio.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(420, now);
  bp.Q.setValueAtTime(1.8, now);
  const nGain = audio.createGain();
  nGain.gain.setValueAtTime(0.0001, now);
  nGain.gain.linearRampToValueAtTime(vol * 0.45, now + 0.012);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  noise.connect(bp);
  bp.connect(nGain);
  nGain.connect(audio.destination);
  noise.start(now);
  noise.stop(now + dur + 0.02);
}

export function playWalkStepSound(
  style: WalkSoundStyle,
  rawTone: ToneFn,
  alt: boolean,
  audio?: AudioContext | null,
  baseDelay = 0
): void {
  const tone: ToneFn =
    baseDelay > 0
      ? (freq, dur, type, delay = 0, endFreq = freq, vol = 0.055) =>
          rawTone(freq, dur, type, delay + baseDelay, endFreq, vol)
      : rawTone;
  switch (style) {
    case 'chirp': {
      const f1 = alt ? 1250 : 1350;
      const t1 = alt ? 2250 : 2400;
      const f2 = alt ? 1480 : 1580;
      const t2 = alt ? 2550 : 2720;
      tone(f1, 0.042, 'sine', 0, t1, 0.052);
      tone(f2, 0.048, 'sine', 0.055, t2, 0.052);
      return;
    }
    case 'squeak': {
      const dip = alt ? 920 : 980;
      const peak = alt ? 1880 : 1980;
      tone(1620, 0.045, 'sine', 0, dip, 0.055);
      tone(dip, 0.055, 'triangle', 0.048, peak, 0.055);
      return;
    }
    case 'boing': {
      const base = alt ? 165 : 185;
      tone(base, 0.11, 'triangle', 0, base * 3.1, 0.06);
      tone(base * 1.55, 0.09, 'sine', 0.055, base * 3.7, 0.042);
      return;
    }
    case 'tap': {
      const f1 = alt ? 920 : 1020;
      const f2 = alt ? 1220 : 1140;
      tone(f1, 0.028, 'square', 0, 320, 0.032);
      tone(f2, 0.032, 'triangle', 0.055, 410, 0.05);
      return;
    }
    case 'honk': {
      const shift = alt ? 1.05 : 1;
      tone(330 * shift, 0.075, 'sawtooth', 0, 315 * shift, 0.036);
      tone(415 * shift, 0.085, 'triangle', 0.02, 395 * shift, 0.048);
      return;
    }
    case 'jingle': {
      const notes = alt ? [1760, 2349, 2637] : [1976, 2349, 2794];
      notes.forEach((f, idx) => tone(f, 0.08, idx === 2 ? 'triangle' : 'sine', idx * 0.035, f, 0.045));
      return;
    }
    case 'poot': {
      if (alt) playWhoopee(audio, rawTone, 195, 115, 0.11, 36, baseDelay);
      else playWhoopee(audio, rawTone, 140, 58, 0.16, 28, baseDelay);
      return;
    }
  }
}

export function playWalkEquipSound(
  style: WalkSoundStyle,
  tone: ToneFn,
  audio?: AudioContext | null
): void {
  switch (style) {
    case 'chirp':
      tone(1250, 0.05, 'sine', 0, 2150, 0.055);
      tone(1450, 0.05, 'sine', 0.07, 2450, 0.055);
      tone(1650, 0.05, 'sine', 0.14, 2800, 0.055);
      return;
    case 'squeak':
      tone(1500, 0.06, 'sine', 0, 950, 0.055);
      tone(950, 0.07, 'triangle', 0.065, 2050, 0.058);
      tone(1800, 0.09, 'sine', 0.14, 2350, 0.05);
      return;
    case 'boing':
      tone(175, 0.12, 'triangle', 0, 560, 0.06);
      tone(240, 0.13, 'sine', 0.11, 760, 0.055);
      return;
    case 'tap':
      [960, 1180, 1440].forEach((f, idx) => tone(f, 0.036, 'triangle', idx * 0.065, 420, 0.055));
      return;
    case 'honk':
      tone(330, 0.09, 'sawtooth', 0, 320, 0.036);
      tone(440, 0.09, 'triangle', 0.02, 420, 0.05);
      tone(523, 0.14, 'sawtooth', 0.13, 554, 0.036);
      return;
    case 'jingle':
      [1568, 1976, 2349, 2637].forEach((f, idx) => tone(f, 0.1, 'sine', idx * 0.055, f, 0.048));
      return;
    case 'poot':
      playWhoopee(audio, tone, 165, 52, 0.36, 30, 0, 0.085);
      playWhoopee(audio, tone, 225, 180, 0.07, 40, 0.34, 0.06);
      return;
  }
}
