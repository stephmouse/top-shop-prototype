import { WALK_SOUND_STYLES } from '../config/walkSounds';
import type { WalkSoundChoice } from '../config/walkSounds';
import type { WinReason } from '../engine/types';
import type { VisualEvent } from './stateDiff';
import { playWalkEquipSound, playWalkStepSound } from './walkSoundFx';

export interface SoundFxController {
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => boolean;
  playVisualEvents: (events: VisualEvent[]) => void;
  playCardFlip: () => void;
  playPencilTick: (isSlow?: boolean, speedNorm?: number) => void;
  playPencilStop: (isEvent?: boolean, fromStateDiff?: boolean) => void;
  playYourTurn: () => void;
  playCashbackFanfare: () => void;
  playMonthFlip: () => void;
  playTurnPing: () => void;
  playVictoryFanfare: (reason?: WinReason | null) => void;
  playWalkSoundPreview: (choice: WalkSoundChoice) => void;
}

const MUTE_KEY = 'top_shop_sfx_muted_v1';

function readInitialMute(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage?.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function createSoundFx(): SoundFxController {
  let muted = readInitialMute();
  let ctx: AudioContext | null = null;
  let chirpAlt = false;
  let lastPencilStopAt = 0;
  let lastPencilTickAt = 0;

  function ensureContext(): AudioContext | null {
    if (muted || typeof window === 'undefined') return null;
    const AudioCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx ??= new AudioCtor();
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq: number, dur: number, type: OscillatorType, delay = 0, endFreq = freq, vol = 0.055): void {
    const audio = ensureContext();
    if (!audio) return;
    const now = audio.currentTime + delay;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), now + dur);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  const playArp = (notes: number[], type: OscillatorType = 'triangle', step = 0.065, dur = 0.14) =>
    notes.forEach((f, idx) => tone(f, dur, type, idx * step));

  function playLiquidateAlert(): void {
    tone(311, 0.11, 'sawtooth', 0, 294, 0.034);
    tone(155, 0.11, 'triangle', 0, 147, 0.045);
    tone(277, 0.11, 'sawtooth', 0.12, 262, 0.034);
    tone(138, 0.11, 'triangle', 0.12, 131, 0.045);
    tone(233, 0.26, 'sawtooth', 0.24, 147, 0.038);
    tone(116, 0.26, 'triangle', 0.24, 73, 0.05);
  }

  function setMuted(next: boolean): void {
    muted = next;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      }
    } catch { /* Ignore storage errors */ }
  }

  function playVisualEvents(events: VisualEvent[]): void {
    if (muted || events.length === 0) return;

    const moved = events.find((e) => e.type === 'player_moved');
    const payday = events.find((e) => e.type === 'bank_payday');
    const liquidate = events.find((e) => e.type === 'liquidate_forced');
    const cashEvents = events.filter(
      (e): e is Extract<VisualEvent, { type: 'cash_delta' }> => e.type === 'cash_delta'
    );
    const cash =
      cashEvents.find((e) => e.isActive) ??
      cashEvents.find((e) => e.isHurt) ??
      cashEvents[0];
    const cashback = events.find((e) => e.type === 'cashback_triggered');
    const shop = events.find((e) => e.type === 'shop_changed');

    if (moved && !payday) {
      if (moved.kind === 'step') {
        if (moved.chirp) {
          chirpAlt = !chirpAlt;
          const layers =
            moved.walkSounds && moved.walkSounds.length > 0
              ? moved.walkSounds
              : [moved.walkSound ?? 'chirp'];
          layers.forEach((style, idx) =>
            playWalkStepSound(style, tone, chirpAlt, ensureContext(), idx * 0.085)
          );
        } else tone(440, 0.045, 'triangle', 0, 520, 0.045);
      } else if (moved.kind === 'escalator') {
        const up = (moved.verticalSign ?? 1) >= 0;
        tone(up ? 260 : 440, 0.36, 'sine', 0, up ? 440 : 260, 0.048);
        tone(up ? 130 : 215, 0.34, 'triangle', 0, up ? 215 : 130, 0.03);
      } else if (moved.kind === 'elevator') {
        const durSec = (moved.durationMs ?? 520) / 1000;
        const goingUp = (moved.verticalSign ?? 1) >= 0;
        tone(goingUp ? 145 : 185, Math.max(0.25, durSec - 0.1), 'triangle', 0, goingUp ? 185 : 145, 0.028);
        const dingAt = Math.max(0.22, durSec - 0.06);
        tone(880, 0.24, 'sine', dingAt, 880, 0.055);
        tone(1760, 0.2, 'triangle', dingAt + 0.015, 1760, 0.032);
      }
    }
    const equipped = events.find((e) => e.type === 'chirp_equipped');
    if (equipped && equipped.type === 'chirp_equipped') playWalkEquipSound(equipped.walkSound ?? 'chirp', tone, ensureContext());

    if (payday) {
      if (payday.isExact) {
        playArp([523, 659, 784, 1046, 1318, 1568], 'triangle', 0.055, 0.18);
        tone(1046, 0.24, 'sine', 0.22, 1568, 0.045);
      } else {
        playArp([523, 659, 784, 1046], 'triangle', 0.06, 0.16);
      }
    } else if (liquidate) {
      playLiquidateAlert();
    } else if (cash) {
      if (cash.amount > 0 && !shop) playArp([880, 1175], 'sine', 0.06, 0.12);
      else if (cash.isHurt) tone(240, 0.18, 'triangle', 0, 145, 0.06);
    } else if (cashback) {
      // Beat 1 plays the standard hurt purchase sound right before Beat 2's Cash Back twist.
      tone(240, 0.18, 'triangle', 0, 145, 0.06);
    }

    if (shop) {
      if (shop.kind === 'opened') playArp([523, 659, 784], 'triangle', 0.055, 0.13);
      else if (shop.kind === 'buyout') playArp([440, 554, 659, 880], 'triangle', 0.055, 0.14);
      else if (shop.kind === 'upgraded') playArp([587, 740, 880, 1175], 'sine', 0.055, 0.15);
      else if (shop.kind === 'closed') tone(210, 0.2, 'sawtooth', 0, 105, 0.032);
      else if (shop.kind === 'restocked') tone(660, 0.08, 'sine', 0, 880, 0.05);
      else if (shop.kind === 'vacated') tone(330, 0.15, 'triangle', 0, 220, 0.045);
    }
  }

  return {
    isMuted: () => muted,
    setMuted,
    toggleMuted: () => { setMuted(!muted); return muted; },
    playVisualEvents,
    playCardFlip: () => tone(520, 0.065, 'triangle', 0, 780, 0.05),
    playPencilTick: (isSlow = false, speedNorm = 1) => {
      if (muted) return;
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (nowMs - lastPencilTickAt < 38) return;
      lastPencilTickAt = nowMs;
      const norm = Math.max(0, Math.min(1, speedNorm));
      const baseFreq = isSlow ? 520 : 540 + norm * 240;
      tone(baseFreq, 0.022, 'triangle', 0, baseFreq * 0.52, isSlow ? 0.024 : 0.018 + norm * 0.012);
      tone(210 + norm * 70, 0.018, 'sine', 0, 130, 0.014);
    },
    playPencilStop: (isEvent = false, fromStateDiff = false) => {
      const nowMs = Date.now();
      if (fromStateDiff && nowMs - lastPencilStopAt < 1100) return;
      lastPencilStopAt = nowMs;
      if (isEvent) {
        tone(440, 0.08, 'triangle', 0, 587, 0.052);
        tone(880, 0.16, 'sine', 0.065, 1046, 0.052);
      } else {
        tone(260, 0.04, 'triangle', 0, 180, 0.048);
        tone(523, 0.09, 'sine', 0.03, 659, 0.05);
      }
    },
    playYourTurn: () => {
      tone(659, 0.14, 'sine', 0, 659, 0.055);
      tone(988, 0.22, 'triangle', 0.095, 988, 0.055);
    },
    playCashbackFanfare: () => {
      playArp([523, 659, 784, 988, 1046], 'triangle', 0.055, 0.16);
      tone(1318, 0.22, 'sine', 0.28, 1568, 0.05);
    },
    playMonthFlip: () => {
      tone(523, 0.07, 'sine', 0, 659, 0.036);
      tone(784, 0.11, 'triangle', 0.06, 784, 0.032);
    },
    playTurnPing: () => {
      tone(880, 0.12, 'sine', 0, 880, 0.06);
      tone(1175, 0.2, 'triangle', 0.09, 1175, 0.06);
    },
    playVictoryFanfare: (reason = 'target_assets') => {
      if (muted) return;

      if (reason === 'bankruptcy') {
        // Dramatic knockout brass stabs pivoting into a bold D-major triumph
        const stabs: Array<[number, number, number]> = [
          [294, 0, 0.14],
          [262, 0.13, 0.14],
          [233, 0.26, 0.2],
        ];
        for (const [f, d, dur] of stabs) {
          tone(f, dur, 'sawtooth', d, f, 0.032);
          tone(f / 2, dur, 'triangle', d, f / 2, 0.048);
        }
        const finish: Array<[number, number, number]> = [
          [440, 0.5, 0.14],
          [587, 0.62, 0.14],
          [740, 0.74, 0.14],
          [880, 0.86, 0.2],
          [1175, 1.04, 0.58],
        ];
        for (const [f, d, dur] of finish) {
          tone(f, dur, 'triangle', d, f, 0.062);
        }
        tone(147, 0.34, 'sine', 0.5, 147, 0.048);
        tone(220, 0.26, 'sine', 0.78, 220, 0.048);
        tone(294, 0.58, 'sine', 1.04, 294, 0.055);
        return;
      }

      if (reason === 'bank_99_points') {
        // Cash-register chime into rapid golden E-major jackpot sparkle chord
        tone(988, 0.12, 'sine', 0, 988, 0.055);
        tone(1319, 0.22, 'sine', 0.08, 1319, 0.06);
        const harp: number[] = [659, 831, 988, 1319, 1661, 1976];
        harp.forEach((f, idx) => tone(f, 0.28, 'sine', 0.24 + idx * 0.065, f, 0.05));
        const chord: number[] = [659, 831, 988, 1319];
        chord.forEach((f) => tone(f, 0.68, 'triangle', 0.72, f, 0.04));
        tone(330, 0.68, 'sine', 0.72, 330, 0.048);
        tone(1976, 0.52, 'sine', 0.78, 1976, 0.036);
        return;
      }

      // Default ('target_assets'): bright retro C-major arcade victory fanfare
      const lead: Array<[number, number, number]> = [
        [523, 0, 0.14],
        [659, 0.09, 0.14],
        [784, 0.18, 0.16],
        [1046, 0.28, 0.24],
        [784, 0.52, 0.12],
        [880, 0.63, 0.12],
        [988, 0.74, 0.14],
        [1046, 0.88, 0.52],
      ];
      for (const [freq, delay, dur] of lead) {
        tone(freq, dur, 'triangle', delay, freq, 0.062);
      }
      tone(262, 0.28, 'sine', 0, 262, 0.045);
      tone(392, 0.26, 'sine', 0.52, 392, 0.045);
      tone(523, 0.54, 'sine', 0.88, 523, 0.05);
      tone(1318, 0.42, 'sine', 0.9, 1568, 0.04);
      tone(1568, 0.48, 'triangle', 0.96, 1568, 0.036);
    },
    playWalkSoundPreview: (choice) => {
      if (muted) return;
      chirpAlt = !chirpAlt;
      const style = choice === 'random'
        ? WALK_SOUND_STYLES[Math.floor(Math.random() * WALK_SOUND_STYLES.length)]!
        : choice;
      playWalkStepSound(style, tone, chirpAlt, ensureContext());
    },
  };
}
