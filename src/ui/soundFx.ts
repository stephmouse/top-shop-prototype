import { WALK_SOUND_STYLES } from '../config/walkSounds';
import type { WalkSoundChoice } from '../config/walkSounds';
import type { VisualEvent } from './stateDiff';
import { playWalkEquipSound, playWalkStepSound } from './walkSoundFx';

export interface SoundFxController {
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => boolean;
  playVisualEvents: (events: VisualEvent[]) => void;
  playCardFlip: () => void;
  playPencilStop: () => void;
  playYourTurn: () => void;
  playCashbackFanfare: () => void;
  playMonthFlip: () => void;
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
          playWalkStepSound(moved.walkSound ?? 'chirp', tone, chirpAlt, ensureContext());
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
      playArp([523, 659, 784, 1046], 'triangle', 0.06, 0.16);
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
    playPencilStop: () => tone(330, 0.055, 'triangle', 0, 520, 0.05),
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
