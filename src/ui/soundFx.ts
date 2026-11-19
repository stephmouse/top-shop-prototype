import type { VisualEvent } from './stateDiff';

export interface SoundFxController {
  isMuted: () => boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => boolean;
  playVisualEvents: (events: VisualEvent[]) => void;
  playCardFlip: () => void;
  playPencilStop: () => void;
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
    const cash = events.find((e) => e.type === 'cash_delta');
    const shop = events.find((e) => e.type === 'shop_changed');

    if (moved && !payday) {
      if (moved.kind === 'step') tone(440, 0.045, 'triangle', 0, 520, 0.045);
      else if (moved.kind === 'escalator') tone(392, 0.11, 'sine', 0, 587, 0.05);
      else if (moved.kind === 'elevator') playArp([659, 880], 'sine', 0.09, 0.18);
    }

    if (payday) {
      playArp([523, 659, 784, 1046], 'triangle', 0.06, 0.16);
    } else if (cash) {
      if (cash.amount > 0 && !shop) playArp([880, 1175], 'sine', 0.06, 0.12);
      else if (cash.isHurt) tone(240, 0.18, 'triangle', 0, 145, 0.06);
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
  };
}
