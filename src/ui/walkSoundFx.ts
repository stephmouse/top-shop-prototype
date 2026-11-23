import type { WalkSoundStyle } from '../config/walkSounds';

export type ToneFn = (
  freq: number,
  dur: number,
  type: OscillatorType,
  delay?: number,
  endFreq?: number,
  vol?: number
) => void;

export function playWalkStepSound(style: WalkSoundStyle, tone: ToneFn, alt: boolean): void {
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
  }
}

export function playWalkEquipSound(style: WalkSoundStyle, tone: ToneFn): void {
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
  }
}
