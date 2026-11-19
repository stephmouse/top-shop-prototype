/**
 * Official PS1 Top Shop 12-Month Calendar, Seasonal Sale table (0x800ade20),
 * and 49x8 Rubber-Banding Event Weight table (0x800adc64) from SLUS_013.33.
 */
export const MONTH_NAMES = [
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
] as const;

export const SEASONAL_EVENT_BY_MONTH: readonly string[] = [
  'eve_085', // 0: April     — Spring Sale (50% off)
  'eve_085', // 1: May       — Spring Sale (50% off)
  'eve_081', // 2: June      — Hurricane (50% off)
  'eve_081', // 3: July      — Hurricane (50% off)
  'eve_086', // 4: August    — Summer Sale (50% off)
  'eve_081', // 5: September — Hurricane (50% off)
  'eve_082', // 6: October   — Halloween Sale (30% off)
  'eve_087', // 7: November  — Fall Sale (50% off)
  'eve_083', // 8: December  — Christmas Sale (50% off)
  'eve_080', // 9: January   — Snowstorm (50% off)
  'eve_088', // 10: February — Winter Sale (50% off)
  'eve_084', // 11: March    — Final Sale (70% off)
];

export type EventRubberBandColumn = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const EVENT_RUBBER_BAND_LABELS: Record<EventRubberBandColumn, string> = {
  0: 'Early Game (Year 1)',
  1: 'Leader',
  2: 'Trailing (≤$1,500)',
  3: 'Trailing ($1,501–$3,000)',
  4: 'Trailing ($3,001–$6,000)',
  5: 'Trailing ($6,001–$10,000)',
  6: 'Far Behind (>$10,000)',
  7: 'Endgame (≥50% Target)',
};

export const EVENT_RUBBER_BAND_CONFIG = {
  earlyGameMonths: 12,
  rollMax: 200,
  deficitBuckets: [0, 1500, 3000, 6000, 10000] as const,
} as const;

export interface EventWeightRow {
  readonly id: string;
  readonly thresholds: readonly [number, number, number, number, number, number, number, number];
}

export const EVENT_WEIGHT_TABLE: readonly EventWeightRow[] = [
  { id: 'eve_024', thresholds: [5, 0, 6, 10, 0, 0, 0, 4] },
  { id: 'eve_025', thresholds: [5, 0, 9, 20, 0, 0, 0, 8] },
  { id: 'eve_026', thresholds: [5, 0, 12, 30, 30, 30, 0, 12] },
  { id: 'eve_027', thresholds: [5, 0, 15, 40, 30, 30, 0, 16] },
  { id: 'eve_028', thresholds: [5, 0, 18, 50, 30, 30, 0, 20] },
  { id: 'eve_029', thresholds: [5, 0, 21, 60, 60, 60, 0, 24] },
  { id: 'eve_030', thresholds: [5, 10, 27, 60, 60, 60, 0, 28] },
  { id: 'eve_031', thresholds: [5, 20, 33, 70, 60, 60, 0, 32] },
  { id: 'eve_032', thresholds: [5, 30, 36, 80, 60, 60, 0, 36] },
  { id: 'eve_033', thresholds: [5, 40, 42, 90, 90, 90, 0, 40] },
  { id: 'eve_034', thresholds: [5, 50, 48, 90, 90, 90, 0, 44] },
  { id: 'eve_035', thresholds: [5, 60, 51, 90, 90, 90, 0, 48] },
  { id: 'eve_036', thresholds: [5, 60, 54, 100, 100, 90, 30, 52] },
  { id: 'eve_037', thresholds: [5, 60, 57, 110, 110, 120, 60, 56] },
  { id: 'eve_040', thresholds: [15, 60, 60, 120, 120, 120, 90, 60] },
  { id: 'eve_041', thresholds: [15, 60, 63, 130, 130, 120, 120, 64] },
  { id: 'eve_042', thresholds: [15, 60, 66, 140, 140, 150, 150, 68] },
  { id: 'eve_043', thresholds: [15, 70, 69, 150, 150, 160, 160, 72] },
  { id: 'eve_044', thresholds: [25, 80, 72, 150, 150, 160, 160, 76] },
  { id: 'eve_045', thresholds: [35, 80, 78, 150, 150, 160, 160, 80] },
  { id: 'eve_046', thresholds: [45, 80, 84, 160, 160, 160, 170, 84] },
  { id: 'eve_047', thresholds: [55, 80, 87, 170, 170, 160, 170, 88] },
  { id: 'eve_048', thresholds: [55, 90, 90, 170, 170, 160, 170, 92] },
  { id: 'eve_049', thresholds: [55, 100, 93, 170, 170, 160, 170, 96] },
  { id: 'eve_050', thresholds: [55, 110, 96, 170, 170, 160, 170, 100] },
  { id: 'eve_051', thresholds: [55, 120, 99, 170, 170, 160, 170, 104] },
  { id: 'eve_052', thresholds: [55, 130, 102, 170, 170, 160, 170, 108] },
  { id: 'eve_053', thresholds: [55, 140, 105, 170, 170, 160, 170, 112] },
  { id: 'eve_054', thresholds: [55, 150, 108, 170, 170, 160, 170, 116] },
  { id: 'eve_058', thresholds: [55, 150, 111, 170, 170, 160, 170, 120] },
  { id: 'eve_059', thresholds: [55, 150, 114, 170, 170, 160, 170, 124] },
  { id: 'eve_060', thresholds: [55, 150, 117, 170, 170, 160, 170, 128] },
  { id: 'eve_061', thresholds: [65, 150, 120, 170, 170, 160, 170, 132] },
  { id: 'eve_062', thresholds: [75, 150, 123, 170, 170, 160, 170, 136] },
  { id: 'eve_063', thresholds: [85, 150, 127, 170, 170, 160, 170, 140] },
  { id: 'eve_064', thresholds: [95, 150, 139, 170, 170, 160, 170, 148] },
  { id: 'eve_065', thresholds: [105, 150, 142, 170, 170, 160, 170, 152] },
  { id: 'eve_066', thresholds: [115, 150, 145, 170, 170, 160, 170, 156] },
  { id: 'eve_067', thresholds: [125, 150, 148, 170, 170, 160, 170, 160] },
  { id: 'eve_068', thresholds: [135, 150, 151, 170, 170, 160, 170, 164] },
  { id: 'eve_069', thresholds: [140, 150, 157, 170, 170, 160, 170, 168] },
  { id: 'eve_070', thresholds: [145, 150, 163, 170, 170, 160, 170, 172] },
  { id: 'eve_071', thresholds: [150, 150, 169, 170, 170, 160, 170, 176] },
  { id: 'eve_072', thresholds: [160, 150, 181, 180, 180, 170, 180, 180] },
  { id: 'eve_076', thresholds: [165, 150, 184, 190, 190, 180, 190, 184] },
  { id: 'eve_075', thresholds: [175, 150, 192, 190, 190, 180, 190, 188] },
  { id: 'eve_076', thresholds: [185, 150, 195, 190, 190, 180, 190, 192] },
  { id: 'eve_076', thresholds: [190, 150, 200, 200, 200, 200, 200, 196] },
  { id: 'seasonal', thresholds: [200, 200, 200, 200, 200, 200, 200, 200] },
];
