import { isValidWalkSoundChoice } from './walkSounds';
import type { WalkSoundChoice } from './walkSounds';

export const AVATAR_SPECIES = [
  'mouse', 'dragon', 'kangaroo', 'dog', 'wolf', 'fox', 'beaver', 'skunk',
  'cat', 'raccoon', 'horse', 'otter', 'deer', 'frog', 'panda', 'bunny',
  'robin', 'koi', 'dolphin',
] as const;
export type AvatarSpecies = (typeof AVATAR_SPECIES)[number];

export const AVATAR_MARKINGS = [
  'solid', 'underfur', 'nose_stripe', 'mouth_outline',
  'eye_mask', 'mouth_and_eyes', 'chest_neck', 'shoulder_spots',
  'robin_breast', 'koi_patches', 'dolphin_belly',
] as const;
export type AvatarMarking = (typeof AVATAR_MARKINGS)[number];

export const AVATAR_HAIRS = [
  'none', 'tuft', 'spiky', 'medium', 'medium_bangs', 'long', 'long_bangs',
  'feather_crest', 'dorsal_fin',
] as const;
export type AvatarHair = (typeof AVATAR_HAIRS)[number];

export const AVATAR_EYES = ['round', 'happy', 'relaxed', 'wink', 'starry'] as const;
export type AvatarEyeStyle = (typeof AVATAR_EYES)[number];

export const AVATAR_ACCESSORIES = [
  'none', 'thick_glasses', 'round_glasses', 'shades', 'beanie', 'cap', 'crown', 'bow', 'bandana', 'scuba_mask',
] as const;
export type AvatarAccessory = (typeof AVATAR_ACCESSORIES)[number];

export interface AvatarSpec {
  species: AvatarSpecies;
  primaryColor: string;
  secondaryColor: string;
  eyeColor: string;
  hairColor: string;
  marking: AvatarMarking;
  hair: AvatarHair;
  eyeStyle: AvatarEyeStyle;
  accessory: AvatarAccessory;
  walkSound?: WalkSoundChoice;
  customImage?: string;
}

export const SPECIES_LABELS: Record<AvatarSpecies, string> = {
  mouse: 'Mouse', dragon: 'Dragon', kangaroo: 'Kangaroo', dog: 'Dog',
  wolf: 'Wolf', fox: 'Fox', beaver: 'Beaver', skunk: 'Skunk',
  cat: 'Cat', raccoon: 'Raccoon', horse: 'Horse', otter: 'Otter',
  deer: 'Deer', frog: 'Frog', panda: 'Panda', bunny: 'Bunny',
  robin: 'Robin', koi: 'Koi Fish', dolphin: 'Dolphin',
};

export const MARKING_LABELS: Record<AvatarMarking, string> = {
  solid: 'Solid Coat',
  underfur: 'Chest, Neck & Muzzle',
  nose_stripe: 'Skunk Stripe + Underfur',
  mouth_outline: 'Muzzle Ring',
  eye_mask: 'Eye Mask',
  mouth_and_eyes: 'Eye Mask + Muzzle',
  chest_neck: 'Chest & Neck Only',
  shoulder_spots: 'Shoulder Spots + Underfur',
  robin_breast: 'Bird Breast & Wingtips',
  koi_patches: 'Koi Calico Patches',
  dolphin_belly: 'Aquatic Belly & Cheek',
};

export const HAIR_LABELS: Record<AvatarHair, string> = {
  none: 'None', tuft: 'Fluff Tuft', spiky: 'Spiky Hair',
  medium: 'Medium Hair', medium_bangs: 'Medium + Bangs',
  long: 'Long Hair', long_bangs: 'Long + Bangs',
  feather_crest: 'Feather Crest', dorsal_fin: 'Fin Crest',
};

export const EYE_LABELS: Record<AvatarEyeStyle, string> = {
  round: 'Bright Eyes', happy: 'Happy', relaxed: 'Cool / Chill', wink: 'Wink', starry: 'Starry',
};

export const ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  none: 'None', thick_glasses: 'Thick Black Glasses', round_glasses: 'Round Specs',
  shades: 'Cool Shades', beanie: 'Beanie', cap: 'Baseball Cap',
  crown: 'Gold Crown', bow: 'Ribbon Bow', bandana: 'Neck Bandana', scuba_mask: 'Scuba Mask & Snorkel',
};

export const MAX_CUSTOM_AVATAR_CHARS = 16500;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const CUSTOM_IMG_RE = /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;

export function isValidCustomImageDataUrl(raw: unknown): raw is string {
  return (
    typeof raw === 'string' &&
    raw.length >= 32 &&
    raw.length <= MAX_CUSTOM_AVATAR_CHARS &&
    CUSTOM_IMG_RE.test(raw)
  );
}

export function stripAvatarCustomImage(avatar?: AvatarSpec): AvatarSpec | undefined {
  if (!avatar || avatar.customImage === undefined) return avatar;
  const { customImage: _img, ...rest } = avatar;
  return rest;
}
const SPECIES_DEFAULTS: Record<AvatarSpecies, Partial<AvatarSpec>> = {
  mouse: { primaryColor: '#9ca3af', secondaryColor: '#fde2e4', marking: 'underfur', accessory: 'thick_glasses' },
  dragon: { primaryColor: '#16a34a', secondaryColor: '#fde047', marking: 'chest_neck', hair: 'spiky' },
  kangaroo: { primaryColor: '#c2783a', secondaryColor: '#fde68a', marking: 'underfur' },
  dog: { primaryColor: '#e0a958', secondaryColor: '#fef3c7', marking: 'underfur', eyeStyle: 'happy' },
  wolf: { primaryColor: '#64748b', secondaryColor: '#e2e8f0', marking: 'underfur', hair: 'spiky' },
  fox: { primaryColor: '#ea580c', secondaryColor: '#fff7ed', marking: 'underfur', eyeStyle: 'relaxed' },
  beaver: { primaryColor: '#78350f', secondaryColor: '#fcd34d', marking: 'mouth_outline' },
  skunk: { primaryColor: '#1f2937', secondaryColor: '#f8fafc', marking: 'nose_stripe' },
  cat: { primaryColor: '#f59e0b', secondaryColor: '#fef3c7', marking: 'shoulder_spots', hair: 'tuft' },
  raccoon: { primaryColor: '#71717a', secondaryColor: '#18181b', marking: 'eye_mask' },
  horse: { primaryColor: '#92400e', secondaryColor: '#fde68a', marking: 'nose_stripe', hair: 'long' },
  otter: { primaryColor: '#854d0e', secondaryColor: '#fef08a', marking: 'mouth_and_eyes' },
  deer: { primaryColor: '#b45309', secondaryColor: '#fef3c7', marking: 'shoulder_spots' },
  frog: { primaryColor: '#22c55e', secondaryColor: '#bbf7d0', marking: 'chest_neck' },
  panda: { primaryColor: '#f8fafc', secondaryColor: '#18181b', marking: 'eye_mask' },
  bunny: { primaryColor: '#f9a8d4', secondaryColor: '#fff1f2', marking: 'underfur', accessory: 'bow' },
  robin: { primaryColor: '#6b4c3b', secondaryColor: '#e25822', marking: 'robin_breast', hair: 'feather_crest', hairColor: '#4b362a' },
  koi: { primaryColor: '#f8fafc', secondaryColor: '#f97316', marking: 'koi_patches', hair: 'dorsal_fin', hairColor: '#fb923c', eyeStyle: 'happy' },
  dolphin: { primaryColor: '#38bdf8', secondaryColor: '#e0f2fe', marking: 'dolphin_belly', hair: 'none', accessory: 'scuba_mask', eyeStyle: 'happy' },
};

const BASE_AVATAR: AvatarSpec = {
  species: 'mouse', primaryColor: '#9ca3af', secondaryColor: '#fde2e4', eyeColor: '#2563eb',
  hairColor: '#334155', marking: 'underfur', hair: 'tuft', eyeStyle: 'round', accessory: 'none',
};

export function createSpeciesPreset(species: AvatarSpecies): AvatarSpec {
  return { ...BASE_AVATAR, ...SPECIES_DEFAULTS[species], species };
}

export const DEFAULT_AVATAR_PRESETS: readonly AvatarSpec[] = [
  createSpeciesPreset('mouse'),
  createSpeciesPreset('fox'),
  createSpeciesPreset('cat'),
  createSpeciesPreset('dragon'),
  createSpeciesPreset('wolf'),
  createSpeciesPreset('skunk'),
  createSpeciesPreset('robin'),
  createSpeciesPreset('dolphin'),
];

export function getDefaultAvatarForSeat(index: number): AvatarSpec {
  return { ...DEFAULT_AVATAR_PRESETS[index % DEFAULT_AVATAR_PRESETS.length]! };
}

const SWATCH_POOL = ['#9ca3af', '#ea580c', '#e0a958', '#64748b', '#16a34a', '#92400e', '#f59e0b', '#f9a8d4', '#1f2937', '#f8fafc'];
const MARK_COLORS = ['#fef3c7', '#fde2e4', '#e2e8f0', '#fff7ed', '#18181b', '#bbf7d0', '#fde047'];
const EYE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#9333ea', '#0d9488'];

export function createRandomAvatar(): AvatarSpec {
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;
  return {
    species: pick(AVATAR_SPECIES), primaryColor: pick(SWATCH_POOL), secondaryColor: pick(MARK_COLORS),
    eyeColor: pick(EYE_COLORS), hairColor: pick(SWATCH_POOL), marking: pick(AVATAR_MARKINGS),
    hair: pick(AVATAR_HAIRS), eyeStyle: pick(AVATAR_EYES), accessory: pick(AVATAR_ACCESSORIES),
  };
}

export function isValidAvatarSpec(raw: unknown): raw is AvatarSpec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return (
    typeof r.species === 'string' && (AVATAR_SPECIES as readonly string[]).includes(r.species) &&
    typeof r.marking === 'string' && (AVATAR_MARKINGS as readonly string[]).includes(r.marking) &&
    typeof r.hair === 'string' && (AVATAR_HAIRS as readonly string[]).includes(r.hair) &&
    typeof r.eyeStyle === 'string' && (AVATAR_EYES as readonly string[]).includes(r.eyeStyle) &&
    typeof r.accessory === 'string' && (AVATAR_ACCESSORIES as readonly string[]).includes(r.accessory) &&
    typeof r.primaryColor === 'string' && HEX_RE.test(r.primaryColor) &&
    typeof r.secondaryColor === 'string' && HEX_RE.test(r.secondaryColor) &&
    typeof r.eyeColor === 'string' && HEX_RE.test(r.eyeColor) &&
    typeof r.hairColor === 'string' && HEX_RE.test(r.hairColor) &&
    (r.walkSound === undefined || isValidWalkSoundChoice(r.walkSound)) &&
    (r.customImage === undefined || isValidCustomImageDataUrl(r.customImage))
  );
}

export function sanitizeAvatarSpec(raw: unknown, fallbackIdx = 0): AvatarSpec {
  return isValidAvatarSpec(raw) ? { ...raw } : getDefaultAvatarForSeat(fallbackIdx);
}
