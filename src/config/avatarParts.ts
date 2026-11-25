import type {
  AvatarAccessory,
  AvatarHair,
  AvatarMarking,
  AvatarSpecies,
} from './avatarTypes';

export type FillRole =
  | 'primary'
  | 'secondary'
  | 'innerEar'
  | 'hair'
  | 'dark'
  | 'light'
  | 'accent'
  | 'gold'
  | 'glass'
  | 'none';

export interface ShapeSpec {
  d: string;
  fill: FillRole;
  stroke?: FillRole;
  sw?: number;
  op?: number;
}

export const HEAD_PATH =
  'M 32 14 C 44 14 50 21 50 32 C 50 42 43 47 32 47 C 21 47 14 42 14 32 C 14 21 20 14 32 14 Z';
export const BUST_PATH = 'M 10 64 C 11 50 20 43 32 43 C 44 43 53 50 54 64 Z';

const sh = (d: string, fill: FillRole, stroke?: FillRole, sw = 1.4, op = 1): ShapeSpec => ({
  d, fill, stroke, sw, op,
});
const circ = (cx: number, cy: number, rx: number, ry = rx) =>
  `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${rx * 2} 0 a ${rx} ${ry} 0 1 0 -${rx * 2} 0`;

const MUZZLE_SOFT = sh('M 29 35 L 35 35 L 32 38 Z', 'dark');
const SMILE_W = sh('M 28 39 Q 30 41 32 39 Q 34 41 36 39', 'none', 'dark', 1.4);
const WHISKERS = sh('M 17 36 L 23 37 M 17 39 L 23 39 M 47 36 L 41 37 M 47 39 L 41 39', 'none', 'dark', 1);

export const SPECIES_BACK_SHAPES: Record<AvatarSpecies, readonly ShapeSpec[]> = {
  mouse: [
    sh(circ(15, 16, 8.5), 'primary', 'dark', 1.6), sh(circ(49, 16, 8.5), 'primary', 'dark', 1.6),
    sh(circ(15, 16, 5), 'innerEar'), sh(circ(49, 16, 5), 'innerEar'),
  ],
  dragon: [
    sh('M 21 17 L 12 4 L 25 14 Z', 'secondary', 'dark', 1.5), sh('M 43 17 L 52 4 L 39 14 Z', 'secondary', 'dark', 1.5),
    sh('M 15 24 L 6 22 L 14 31 Z', 'secondary', 'dark', 1.4), sh('M 49 24 L 58 22 L 50 31 Z', 'secondary', 'dark', 1.4),
  ],
  kangaroo: [
    sh('M 18 19 C 14 7 21 2 25 5 C 28 8 27 15 26 18 Z', 'primary', 'dark', 1.6),
    sh('M 46 19 C 50 7 43 2 39 5 C 36 8 37 15 38 18 Z', 'primary', 'dark', 1.6),
    sh('M 20 17 C 18 9 22 6 24 8 C 25 10 25 14 24 16 Z', 'innerEar'),
    sh('M 44 17 C 46 9 42 6 40 8 C 39 10 39 14 40 16 Z', 'innerEar'),
  ],
  dog: [
    sh(circ(16, 20, 4), 'primary', 'dark', 1.4), sh(circ(48, 20, 4), 'primary', 'dark', 1.4),
  ],
  wolf: [
    sh('M 15 21 L 16 3 L 28 15 Z', 'primary', 'dark', 1.6), sh('M 49 21 L 48 3 L 36 15 Z', 'primary', 'dark', 1.6),
    sh('M 18 18 L 18 7 L 25 15 Z', 'innerEar'), sh('M 46 18 L 46 7 L 39 15 Z', 'innerEar'),
  ],
  fox: [
    sh('M 14 23 L 9 4 L 27 15 Z', 'primary', 'dark', 1.6), sh('M 50 23 L 55 4 L 37 15 Z', 'primary', 'dark', 1.6),
    sh('M 16 20 L 13 8 L 24 15 Z', 'secondary'), sh('M 48 20 L 51 8 L 40 15 Z', 'secondary'),
  ],
  beaver: [
    sh(circ(15, 19, 5), 'primary', 'dark', 1.5), sh(circ(49, 19, 5), 'primary', 'dark', 1.5),
    sh(circ(15, 19, 2.7), 'innerEar'), sh(circ(49, 19, 2.7), 'innerEar'),
  ],
  skunk: [
    sh('M 15 20 C 14 10 18 7 25 14 Z', 'primary', 'dark', 1.6),
    sh('M 49 20 C 50 10 46 7 39 14 Z', 'primary', 'dark', 1.6),
    sh('M 17 18 C 17 12 20 11 23 14 Z', 'secondary'),
    sh('M 47 18 C 47 12 44 11 41 14 Z', 'secondary'),
  ],
  cat: [
    sh('M 16 19 L 17 5 L 28 15 Z', 'primary', 'dark', 1.6), sh('M 48 19 L 47 5 L 36 15 Z', 'primary', 'dark', 1.6),
    sh('M 19 17 L 19 9 L 25 15 Z', 'innerEar'), sh('M 45 17 L 45 9 L 39 15 Z', 'innerEar'),
  ],
  raccoon: [
    sh('M 15 20 C 13 10 18 6 26 14 Z', 'primary', 'dark', 1.6),
    sh('M 49 20 C 51 10 46 6 38 14 Z', 'primary', 'dark', 1.6),
    sh('M 17 18 C 16 11 20 9 24 14 Z', 'light'), sh('M 47 18 C 48 11 44 9 40 14 Z', 'light'),
  ],
  horse: [
    sh('M 19 16 L 20 3 L 26 14 Z', 'primary', 'dark', 1.6), sh('M 45 16 L 44 3 L 38 14 Z', 'primary', 'dark', 1.6),
    sh('M 21 14 L 21 6 L 24 13 Z', 'innerEar'), sh('M 43 14 L 43 6 L 40 13 Z', 'innerEar'),
  ],
  otter: [
    sh(circ(13, 22, 4.3), 'primary', 'dark', 1.5), sh(circ(51, 22, 4.3), 'primary', 'dark', 1.5),
    sh(circ(13, 22, 2), 'innerEar'), sh(circ(51, 22, 2), 'innerEar'),
  ],
  deer: [
    sh('M 18 17 L 16 7 M 16 11 L 21 8', 'none', 'gold', 2.2),
    sh('M 46 17 L 48 7 M 48 11 L 43 8', 'none', 'gold', 2.2),
    sh('M 17 18 C 9 14 7 18 14 23 Z', 'primary', 'dark', 1.5),
    sh('M 47 18 C 55 14 57 18 50 23 Z', 'primary', 'dark', 1.5),
  ],
  frog: [
    sh(circ(23, 15, 6), 'primary', 'dark', 1.6), sh(circ(41, 15, 6), 'primary', 'dark', 1.6),
    sh(circ(23, 15, 3.2), 'secondary'), sh(circ(41, 15, 3.2), 'secondary'),
  ],
  panda: [
    sh(circ(16, 15, 6.2), 'secondary', 'dark', 1.5), sh(circ(48, 15, 6.2), 'secondary', 'dark', 1.5),
  ],
  bunny: [
    sh('M 19 17 C 15 4 21 1 25 4 C 28 7 27 14 25 17 Z', 'primary', 'dark', 1.6),
    sh('M 45 17 C 49 4 43 1 39 4 C 36 7 37 14 39 17 Z', 'primary', 'dark', 1.6),
    sh('M 21 15 C 19 6 22 4 24 6 C 25 8 25 13 24 15 Z', 'innerEar'),
    sh('M 43 15 C 45 6 42 4 40 6 C 39 8 39 13 40 15 Z', 'innerEar'),
  ],
  robin: [
    sh('M 22 45 C 14 39 7 37 3 39 C 3 42 6 43 9 43 C 6 44 4 46 5 48 C 7 49 9 49 11 49 C 8 51 8 53 10 54 C 12 56 15 57 18 57 Z', 'primary', 'dark', 1.5),
    sh('M 42 45 C 50 39 57 37 61 39 C 61 42 58 43 55 43 C 58 44 60 46 59 48 C 57 49 55 49 53 49 C 56 51 56 53 54 54 C 52 56 49 57 46 57 Z', 'primary', 'dark', 1.5),
    sh('M 15 45 L 7 41 M 15 48 L 8 47 M 15 51 L 11 52', 'none', 'dark', 1.1),
    sh('M 49 45 L 57 41 M 49 48 L 56 47 M 49 51 L 53 52', 'none', 'dark', 1.1),
  ],
  koi: [
    sh('M 15 27 C 6 21 5 30 9 36 C 12 39 15 35 16 32 Z', 'secondary', 'dark', 1.5),
    sh('M 49 27 C 58 21 59 30 55 36 C 52 39 49 35 48 32 Z', 'secondary', 'dark', 1.5),
    sh('M 13 28 L 8 27 M 13 31 L 8 32 M 51 28 L 56 27 M 51 31 L 56 32', 'none', 'dark', 1),
  ],
  dolphin: [
    sh('M 28 17 C 27 6 35 3 40 7 C 36 10 35 14 36 17 Z', 'primary', 'dark', 1.5),
    sh('M 21 47 C 13 46 8 47 7 50 C 9 54 14 55 18 55 Z', 'primary', 'dark', 1.5),
    sh('M 43 47 C 51 46 56 47 57 50 C 55 54 50 55 46 55 Z', 'primary', 'dark', 1.5),
  ],
};

export const SPECIES_FRONT_SHAPES: Partial<Record<AvatarSpecies, readonly ShapeSpec[]>> = {
  dog: [
    sh('M 16 19 C 10 23 8 36 12 41 C 15 43 18 37 17 29 Z', 'primary', 'dark', 1.5),
    sh('M 48 19 C 54 23 56 36 52 41 C 49 43 46 37 47 29 Z', 'primary', 'dark', 1.5),
  ],
};

export const SPECIES_MUZZLE_SHAPES: Record<AvatarSpecies, readonly ShapeSpec[]> = {
  mouse: [sh('M 29 35 L 35 35 L 32 38 Z', 'innerEar', 'dark', 0.9), SMILE_W, WHISKERS],
  dragon: [sh(circ(29.5, 36, 1.1), 'dark'), sh(circ(34.5, 36, 1.1), 'dark'), sh('M 26 40 Q 32 43 38 40 M 28 41 L 29 43 M 36 41 L 35 43', 'none', 'dark', 1.3)],
  kangaroo: [sh(circ(32, 36, 3.2, 2.1), 'dark'), sh('M 27 40 Q 32 42 37 40', 'none', 'dark', 1.4)],
  dog: [sh(circ(32, 36, 3.5, 2.3), 'dark'), SMILE_W, sh('M 30 40 C 30 44 34 44 34 40 Z', 'innerEar', 'dark', 1)],
  wolf: [sh(circ(32, 36, 3.3, 2.2), 'dark'), sh('M 27 40 Q 32 42 37 40', 'none', 'dark', 1.4)],
  fox: [MUZZLE_SOFT, SMILE_W, WHISKERS],
  beaver: [
    sh(circ(32, 35.5, 3.4, 2.2), 'dark'),
    sh('M 29.2 39 H 31.8 V 43 H 29.2 Z M 32.2 39 H 34.8 V 43 H 32.2 Z', 'light', 'dark', 0.9),
    sh('M 26 39 Q 32 40 38 39', 'none', 'dark', 1.2),
  ],
  skunk: [MUZZLE_SOFT, SMILE_W],
  cat: [sh('M 29.5 35 L 34.5 35 L 32 37.5 Z', 'innerEar', 'dark', 0.8), SMILE_W, WHISKERS],
  raccoon: [MUZZLE_SOFT, SMILE_W, WHISKERS],
  horse: [
    sh('M 24 34 C 24 32 40 32 40 34 C 41 42 38 46 32 46 C 26 46 23 42 24 34 Z', 'secondary', 'dark', 1),
    sh(circ(29, 37, 1.2), 'dark'), sh(circ(35, 37, 1.2), 'dark'),
    sh('M 28 42 Q 32 44 36 42', 'none', 'dark', 1.3),
  ],
  otter: [sh('M 29 35 H 35 L 32 38 Z', 'dark'), SMILE_W, WHISKERS],
  deer: [sh(circ(32, 36, 2.8, 2), 'dark'), SMILE_W],
  frog: [sh(circ(29.5, 34.5, 0.9), 'dark'), sh(circ(34.5, 34.5, 0.9), 'dark'), sh('M 23 37 Q 32 43 41 37', 'none', 'dark', 1.6)],
  panda: [sh(circ(32, 36, 3.3, 2.2), 'dark'), SMILE_W],
  bunny: [sh('M 29.5 35 L 34.5 35 L 32 37.5 Z', 'innerEar', 'dark', 0.8), SMILE_W],
  robin: [
    sh('M 27 35 L 37 35 L 32 42 Z', 'gold', 'dark', 1.3),
    sh('M 28.5 37 H 35.5', 'none', 'dark', 1),
  ],
  koi: [
    sh('M 26.5 37.5 Q 29.2 41.5 32 38 Q 34.8 41.5 37.5 37.5', 'none', 'dark', 1.6),
    sh('M 26.5 37.5 Q 20 38 16.5 42.5 M 27.5 39.2 Q 22 42 20 45.5', 'none', 'dark', 1.3),
    sh('M 37.5 37.5 Q 44 38 47.5 42.5 M 36.5 39.2 Q 42 42 44 45.5', 'none', 'dark', 1.3),
  ],
  dolphin: [
    sh('M 27 36 C 27 33 37 33 37 36 C 37 39 27 39 27 36 Z', 'secondary', 'dark', 1.2),
    sh('M 28 37.5 Q 32 40 36 37.5', 'none', 'dark', 1.3),
  ],
};

const BODY_CHEST = sh('M 21 64 C 22 50 25 43 32 43 C 39 43 42 50 43 64 Z', 'secondary');
const HEAD_MUZZLE = sh('M 20 47 C 20 35 26 32 32 32 C 38 32 44 35 44 47 Z', 'secondary');
const EYE_MASK = sh('M 14 29 C 18 24 27 25 32 28 C 37 25 46 24 50 29 C 48 35 37 36 32 31 C 27 36 16 35 14 29 Z', 'secondary');

export const MARKING_BODY_SHAPES: Record<AvatarMarking, readonly ShapeSpec[]> = {
  solid: [],
  underfur: [BODY_CHEST],
  nose_stripe: [BODY_CHEST],
  mouth_outline: [],
  eye_mask: [],
  mouth_and_eyes: [],
  chest_neck: [BODY_CHEST],
  shoulder_spots: [
    BODY_CHEST,
    sh(circ(16, 53, 2.5), 'secondary'), sh(circ(19, 60, 2), 'secondary'),
    sh(circ(48, 53, 2.5), 'secondary'), sh(circ(45, 60, 2), 'secondary'),
  ],
  robin_breast: [
    sh('M 19 64 C 19 49 24 44 32 44 C 40 44 45 49 45 64 Z', 'secondary'),
  ],
  koi_patches: [
    sh('M 13 54 C 17 49 24 51 23 58 C 22 63 14 63 13 54 Z', 'secondary'),
    sh('M 37 51 C 43 48 49 54 47 61 C 42 63 35 58 37 51 Z', 'secondary'),
    sh(circ(27, 57, 3.2, 2.4), 'dark'),
  ],
  dolphin_belly: [
    sh('M 20 64 C 21 51 25 45 32 45 C 39 45 43 51 44 64 Z', 'secondary'),
  ],
};

export const MARKING_HEAD_SHAPES: Record<AvatarMarking, readonly ShapeSpec[]> = {
  solid: [],
  underfur: [HEAD_MUZZLE],
  nose_stripe: [HEAD_MUZZLE, sh('M 29 36 L 28 14 H 36 L 35 36 Z', 'secondary')],
  mouth_outline: [sh(circ(32, 39, 9.5, 6.2), 'secondary')],
  eye_mask: [EYE_MASK],
  mouth_and_eyes: [EYE_MASK, sh(circ(32, 39, 9.2, 6), 'secondary')],
  chest_neck: [],
  shoulder_spots: [HEAD_MUZZLE],
  robin_breast: [sh('M 22 47 C 22 39 27 37 32 37 C 37 37 42 39 42 47 Z', 'secondary')],
  koi_patches: [
    sh('M 15 24 C 20 15 30 15 29 24 C 28 31 18 31 15 24 Z', 'secondary'),
    sh('M 37 34 C 42 31 48 34 47 41 C 42 44 36 40 37 34 Z', 'secondary'),
    sh(circ(41, 21, 3.6, 2.8), 'dark'),
  ],
  dolphin_belly: [
    sh('M 19 47 C 20 35 25 32 32 32 C 39 32 44 35 45 47 Z', 'secondary'),
  ],
};

const MEDIUM_BACK_HAIR = sh(
  'M 12 28 C 11 16 20 11 32 11 C 44 11 53 16 52 28 C 54 36 54 45 48 49 L 44 45 L 20 45 L 16 49 C 10 45 10 36 12 28 Z',
  'hair',
  'dark',
  1.4
);
const LONG_BACK_HAIR = sh(
  'M 12 28 C 11 15 20 11 32 11 C 44 11 53 15 52 28 C 56 39 57 52 54 64 H 10 C 7 52 8 39 12 28 Z',
  'hair',
  'dark',
  1.4
);

export const HAIR_BACK_SHAPES: Record<AvatarHair, readonly ShapeSpec[]> = {
  none: [],
  tuft: [],
  spiky: [],
  medium: [MEDIUM_BACK_HAIR],
  medium_bangs: [MEDIUM_BACK_HAIR],
  long: [LONG_BACK_HAIR],
  long_bangs: [LONG_BACK_HAIR],
  feather_crest: [],
  dorsal_fin: [],
};

export const HAIR_FRONT_SHAPES: Record<AvatarHair, readonly ShapeSpec[]> = {
  none: [],
  tuft: [sh('M 26 16 C 27 9 32 8 33 13 C 35 9 39 11 38 16 C 34 15 30 15 26 16 Z', 'hair', 'dark', 1.2)],
  spiky: [
    sh(
      'M 15 27 C 15 19 18 14 21 15 L 22 8 L 28 13 L 32 6 L 36 13 L 42 8 L 43 15 C 46 14 49 19 49 27 C 46 21 43 20 40 22 L 36 18 L 32 22 L 28 18 L 24 22 C 21 20 18 21 15 27 Z',
      'hair',
      'dark',
      1.3
    ),
  ],
  medium: [
    sh(
      'M 12.5 34 C 12 20 19 12 32 12 C 45 12 52 20 51.5 34 C 49.5 36 47.5 33 47 28 C 46 22 41 18 33 19 L 32 21 L 31 19 C 23 18 18 22 17 28 C 16.5 33 14.5 36 12.5 34 Z',
      'hair',
      'dark',
      1.3
    ),
  ],
  medium_bangs: [
    sh(
      'M 12.5 35 C 12 20 19 12 32 12 C 45 12 52 20 51.5 35 C 49 36 47.5 33 47 26.5 L 44 25 L 41 25.5 L 38 22.5 L 35 25.5 L 32 22 L 29 25.5 L 26 22.5 L 23 25.5 L 20 25 L 17 26.5 C 16.5 33 15 36 12.5 35 Z',
      'hair',
      'dark',
      1.3
    ),
  ],
  long: [
    sh(
      'M 12 40 C 11.5 22 19 12 32 12 C 45 12 52.5 22 52 40 C 49.5 41 47.5 37 47.5 29 C 46.5 22 41 18 33 19 L 32 21.5 L 31 19 C 23 18 17.5 22 16.5 29 C 16.5 37 14.5 41 12 40 Z',
      'hair',
      'dark',
      1.3
    ),
  ],
  long_bangs: [
    sh(
      'M 12 41 C 11.5 22 19 12 32 12 C 45 12 52.5 22 52 41 C 49.5 42 47.5 37 47.5 26.5 L 44 25 L 41 25.5 L 38 22.5 L 35 25.5 L 32 22 L 29 25.5 L 26 22.5 L 23 25.5 L 20 25 L 16.5 26.5 C 16.5 37 14.5 42 12 41 Z',
      'hair',
      'dark',
      1.3
    ),
  ],
  feather_crest: [
    sh('M 27 17 C 24 8 28 5 31 12 C 33 4 38 5 36 13 C 39 8 42 10 38 17 C 34 15 30 15 27 17 Z', 'hair', 'dark', 1.2),
  ],
  dorsal_fin: [
    sh('M 29 17 L 25 8 L 31 11 L 34 4 L 37 11 L 41 9 L 37 17 C 34 15 31 15 29 17 Z', 'hair', 'dark', 1.3),
  ],
};

export const ACCESSORY_SHAPES: Record<AvatarAccessory, readonly ShapeSpec[]> = {
  none: [],
  thick_glasses: [
    sh('M 17 26 H 29 V 35 H 17 Z M 35 26 H 47 V 35 H 35 Z', 'glass', 'dark', 2.8),
    sh('M 29 29 H 35 M 14 29 H 17 M 47 29 H 50', 'none', 'dark', 2.6),
  ],
  round_glasses: [
    sh(`${circ(24, 30, 5.2)} ${circ(40, 30, 5.2)}`, 'glass', 'dark', 1.6),
    sh('M 29 30 H 35 M 15 29 L 19 30 M 49 29 L 45 30', 'none', 'dark', 1.5),
  ],
  shades: [
    sh('M 16 25 H 29 V 34 Q 22 36 16 33 Z M 35 25 H 48 V 33 Q 42 36 35 34 Z', 'dark', 'dark', 1.5),
    sh('M 29 28 H 35 M 14 28 H 16 M 48 28 H 50', 'none', 'dark', 2),
    sh('M 19 28 L 23 32 M 38 28 L 42 32', 'none', 'light', 1.2, 0.7),
  ],
  beanie: [
    sh('M 16 19 C 16 6 48 6 48 19 Z', 'accent', 'dark', 1.5),
    sh('M 15 17 H 49 V 22 H 15 Z', 'accent', 'dark', 1.5),
  ],
  cap: [
    sh('M 17 19 C 17 7 47 7 47 19 Z', 'accent', 'dark', 1.5),
    sh('M 15 18 H 53 Q 50 22 15 20 Z', 'dark', 'dark', 1.3),
  ],
  crown: [
    sh('M 22 16 L 20 6 L 27 11 L 32 4 L 37 11 L 44 6 L 42 16 Z', 'gold', 'dark', 1.4),
    sh(circ(32, 12, 1.5), 'accent'),
  ],
  bow: [
    sh('M 16 16 L 10 12 V 20 Z M 16 16 L 22 12 V 20 Z', 'accent', 'dark', 1.2),
    sh(circ(16, 16, 2), 'light', 'dark', 1.1),
  ],
  bandana: [
    sh('M 19 46 Q 32 51 45 46 L 42 54 L 32 58 L 22 54 Z', 'accent', 'dark', 1.4),
  ],
  scuba_mask: [
    sh('M 16 25 C 16 23 48 23 48 25 V 33 C 48 36 37 36 34 33 Q 32 31 30 33 C 27 36 16 36 16 33 Z', 'glass', 'accent', 2.2),
    sh('M 14 29 H 16 M 48 29 H 51', 'none', 'dark', 2),
    sh('M 50 11 V 35 C 50 38 46 39 41 39', 'none', 'accent', 2.6),
    sh('M 39 38 H 43 V 40 H 39 Z', 'dark', 'dark', 1),
  ],
};
