export const WALK_SOUND_STYLES = ['chirp', 'squeak', 'boing', 'tap', 'honk', 'jingle'] as const;
export type WalkSoundStyle = (typeof WALK_SOUND_STYLES)[number];

export const WALK_SOUND_CHOICES = [...WALK_SOUND_STYLES, 'random'] as const;
export type WalkSoundChoice = (typeof WALK_SOUND_CHOICES)[number];

export interface WalkSoundMeta {
  label: string;
  shortChip: string;
  badgeText: string;
}

export const WALK_SOUND_META: Record<WalkSoundStyle, WalkSoundMeta> = {
  chirp: { label: '"Chirp-Chirp" Sandals', shortChip: 'Chirp', badgeText: 'Chirp-Chirp!' },
  squeak: { label: 'Squeak-Squeak Sneaks', shortChip: 'Squeak', badgeText: 'Squeak-Squeak!' },
  boing: { label: 'Boing-Boing Boots', shortChip: 'Boing', badgeText: 'Boing-Boing!' },
  tap: { label: 'Tap-Dance Loafers', shortChip: 'Tap', badgeText: 'Click-Clack!' },
  honk: { label: 'Honk-Honk Clogs', shortChip: 'Honk', badgeText: 'Honk-Honk!' },
  jingle: { label: 'Jingle-Bell Slippers', shortChip: 'Jingle', badgeText: 'Jingle-Jingle!' },
};

export const WALK_SOUND_CHOICE_LABELS: Record<WalkSoundChoice, string> = {
  chirp: WALK_SOUND_META.chirp.label,
  squeak: WALK_SOUND_META.squeak.label,
  boing: WALK_SOUND_META.boing.label,
  tap: WALK_SOUND_META.tap.label,
  honk: WALK_SOUND_META.honk.label,
  jingle: WALK_SOUND_META.jingle.label,
  random: '🎲 Random Shoes (Surprise on Unlock)',
};

export function isValidWalkSoundStyle(raw: unknown): raw is WalkSoundStyle {
  return typeof raw === 'string' && (WALK_SOUND_STYLES as readonly string[]).includes(raw);
}

export function isValidWalkSoundChoice(raw: unknown): raw is WalkSoundChoice {
  return typeof raw === 'string' && (WALK_SOUND_CHOICES as readonly string[]).includes(raw);
}
