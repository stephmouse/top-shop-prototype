import type { StageDefinition } from './builder';

/**
 * Official PS1 Stages 0-4 (Stages 1-5) verified from SLUS_013.33 (0x800acd14).
 * Tokens: '.' = void, '=' = 0-step hallway bridge, 'B' = Bank,
 * 'E0'/'E1' = Elevator shafts 0/1, 'T'/'S' = Escalator top cap / body, 'A0'..'A10' = Area shop.
 */
export const STAGES_PART_1: readonly StageDefinition[] = [
  {
    id: 'stage_0',
    stageIndex: 0,
    name: 'Stage 1 — Classic 3F',
    cols: 11,
    floors: 3,
    shopCount: 24,
    rows: [
      'T  A4  A4  A4  A4  E0  A5  A5  A5  A5  T',
      'S  A0  A0  A0  A0  E0  A1  A1  A1  A1  S',
      'S  A3  A3  A3  A3  B   A2  A2  A2  A2  S',
    ],
  },
  {
    id: 'stage_1',
    stageIndex: 1,
    name: 'Stage 2 — Center Crossover 4F',
    cols: 11,
    floors: 4,
    shopCount: 27,
    rows: [
      'T  A10 A10 A10 A10 E0  A9  A9  A9  A9  T',
      'S  A5  A5  A5  =   T   =   A7  A7  A7  S',
      'T  A3  A3  A3  =   S   =   A4  A4  A4  T',
      'S  A1  A1  A1  B   E0  A0  A0  A0  A0  S',
    ],
  },
  {
    id: 'stage_2',
    stageIndex: 2,
    name: 'Stage 3 — Wide 3F',
    cols: 16,
    floors: 3,
    shopCount: 36,
    rows: [
      'T  A8  A8  A8  A8  E0  A9  A9  A9  A9  E1  A7  A7  A7  A7  T',
      'S  A3  A3  A3  A3  E0  A4  A4  A4  A4  E1  A6  A6  A6  A6  S',
      'S  A0  A0  A0  A0  B   A1  A1  A1  A1  E1  A5  A5  A5  A5  S',
    ],
  },
  {
    id: 'stage_3',
    stageIndex: 3,
    name: 'Stage 4 — Classic 4F',
    cols: 11,
    floors: 4,
    shopCount: 32,
    rows: [
      'T  A8  A8  A8  A8  E0  A10 A10 A10 A10 T',
      'S  A7  A7  A7  A7  E0  A5  A5  A5  A5  S',
      'S  A2  A2  A2  A2  E0  A4  A4  A4  A4  S',
      'S  A1  A1  A1  A1  B   A0  A0  A0  A0  S',
    ],
  },
  {
    id: 'stage_4',
    stageIndex: 4,
    name: 'Stage 5 — Crossover Tower 5F',
    cols: 11,
    floors: 5,
    shopCount: 36,
    rows: [
      'T  A10 A10 A10 A10 E0  A9  A9  A9  A9  T',
      'S  A6  A6  A6  =   T   =   A7  A7  A7  S',
      'T  A4  A4  A4  =   S   =   A5  A5  A5  T',
      'S  A3  A3  A3  A3  E0  A2  A2  A2  A2  S',
      'S  A0  A0  A0  A0  B   A1  A1  A1  A1  S',
    ],
  },
];
