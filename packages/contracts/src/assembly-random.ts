/** The versioned assembly randomness reference in EXAM_ASSEMBLY_SPEC. */
export const ASSEMBLY_RANDOM_VERSION = "xorshift32-v1" as const;

const UINT32_RANGE = 4_294_967_296n;
const ZERO_SEED_STATE = 2_463_534_242;

function assertUint32(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError("Seed must be an unsigned 32-bit integer");
  }
}

export function createXorshift32V1(seed: number): () => number {
  assertUint32(seed);
  let state = seed === 0 ? ZERO_SEED_STATE : seed;
  return () => {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;
    return state;
  };
}

/** Fisher–Yates over caller-supplied order; canonical unit order is a separate contract. */
export function shuffleAssemblyUnitsV1<T>(units: readonly T[], seed: number): T[] {
  const next = createXorshift32V1(seed);
  const shuffled = [...units];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const random = next();
    const other = Number((BigInt(random) * BigInt(index + 1)) / UINT32_RANGE);
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled;
}
