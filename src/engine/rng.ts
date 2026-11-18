/**
 * Deterministic Mulberry32 PRNG.
 * Returns both the generated value and the updated seed so GameState stays pure.
 */
export function nextRandom(seed: number): { value: number; nextSeed: number } {
  const nextSeed = (seed + 0x6d2b79f5) | 0;
  let t = nextSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextSeed };
}

export function randomInt(
  seed: number,
  minInclusive: number,
  maxInclusive: number
): { value: number; nextSeed: number } {
  const { value, nextSeed } = nextRandom(seed);
  const span = maxInclusive - minInclusive + 1;
  return {
    value: minInclusive + Math.floor(value * span),
    nextSeed,
  };
}

export function pickRandom<T>(
  seed: number,
  items: readonly T[]
): { value: T; nextSeed: number } {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty array');
  }
  const { value: idx, nextSeed } = randomInt(seed, 0, items.length - 1);
  return { value: items[idx]!, nextSeed };
}