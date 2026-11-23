import type { StageDefinition } from './builder';

/**
 * Official PS1 Stages 5-9 (Stages 6-10) verified from SLUS_013.33 (0x800acd14).
 * Includes staggered wings, dual elevator shafts (E0/E1), center crossovers, and 3F express escalators.
 */
export const STAGES_PART_2: readonly StageDefinition[] = [
  {
    id: 'stage_5',
    stageIndex: 5,
    name: 'Stage 6 — Stepped Terrace 4F',
    cols: 16,
    floors: 4,
    shopCount: 35,
    lapSteps: 42,
    recommendedStartingCash: 4000,
    recommendedTargetAssets: 20000,
    rows: [
      '.  .   .   .   .   T   A8  A8  A8  A8  E1  A9  A9  A9  A9  T',
      '.  .   .   .   .   S   A5  A5  A5  =   T   =   A10 A10 A10 S',
      'T  A6  A6  A6  A6  E0  A7  A7  A7  =   S   =   A3  A3  A3  T',
      'S  A2  A2  A2  A2  E0  A1  A1  A1  B   E1  A0  A0  A0  A0  S',
    ],
  },
  {
    id: 'stage_6',
    stageIndex: 6,
    name: 'Stage 7 — Express Z-Mall 4F',
    cols: 16,
    floors: 4,
    shopCount: 31,
    lapSteps: 36,
    recommendedStartingCash: 4200,
    recommendedTargetAssets: 24000,
    rows: [
      'T  A5  A5  A5  A5  E0  A9  A9  A9  A9  T   .   .   .   .   .',
      'S  .   .   .   .   T   A8  A8  A8  A8  S   .   .   .   .   .',
      'S  .   .   .   .   S   A6  A6  A6  A6  E1  A2  A2  A2  A2  T',
      'S  A3  A3  A3  A3  E0  A0  A0  A0  A0  E1  B   A1  A1  A1  S',
    ],
  },
  {
    id: 'stage_7',
    stageIndex: 7,
    name: 'Stage 8 — Twin Courtyard 4F',
    cols: 16,
    floors: 4,
    shopCount: 39,
    lapSteps: 44,
    recommendedStartingCash: 4600,
    recommendedTargetAssets: 26000,
    rows: [
      'T  A10 A10 A10 A10 E0  A9  A9  A9  A9  E1  A8  A8  A8  A8  T',
      'S  A7  A7  A7  A7  T   .   .   .   .   T   A4  A4  A4  A4  S',
      'T  A6  A6  A6  A6  S   .   .   .   .   S   A3  A3  A3  A3  T',
      'S  A2  A2  A2  A2  E0  A1  A1  A1  B   E1  A0  A0  A0  A0  S',
    ],
  },
  {
    id: 'stage_8',
    stageIndex: 8,
    name: 'Stage 9 — Grand Tower 5F',
    cols: 11,
    floors: 5,
    shopCount: 40,
    lapSteps: 72,
    recommendedStartingCash: 4800,
    recommendedTargetAssets: 28000,
    rows: [
      'T  A9  A9  A9  A9  E0  A10 A10 A10 A10 T',
      'S  A8  A8  A8  A8  E0  A7  A7  A7  A7  S',
      'S  A5  A5  A5  A5  E0  A6  A6  A6  A6  S',
      'S  A4  A4  A4  A4  E0  A3  A3  A3  A3  S',
      'S  A0  A0  A0  A0  B   A2  A2  A2  A2  S',
    ],
  },
  {
    id: 'stage_9',
    stageIndex: 9,
    name: 'Stage 10 — Express Wing 4F',
    cols: 16,
    floors: 4,
    shopCount: 40,
    lapSteps: 46,
    recommendedStartingCash: 5000,
    recommendedTargetAssets: 30000,
    rows: [
      'T  A9  A9  A9  A9  E0  A7  A7  A7  A7  E1  A6  A6  A6  A6  T',
      'S  A8  A8  A8  A8  E0  A5  A5  A5  A5  T   .   .   .   .   S',
      'T  A1  A1  A1  A1  E0  A4  A4  A4  A4  S   .   .   .   .   S',
      'S  A0  A0  A0  A0  B   A2  A2  A2  A2  E1  A3  A3  A3  A3  S',
    ],
  },
];
