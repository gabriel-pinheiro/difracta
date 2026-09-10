/**
 * A source of randomness a Visual instance owns. It is a small seeded
 * generator rather than `Math.random` so that the same Layer looks the
 * same on every run and a test can replay a Visual exactly; nothing else
 * about it is deterministic, and a Visual never has to think about it.
 */
export interface Random {
  /** From 0 inclusive to 1 exclusive, like `Math.random`. */
  (): number;
  between(min: number, max: number): number;
  pick<T>(list: readonly T[]): T;
  sign(): 1 | -1;
}

/** A 32-bit seed from any text, such as a Layer id (FNV-1a). */
export function seedFromText(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A generator whose sequence is fixed by `seed` (mulberry32). */
export function createRandom(seed: number | string): Random {
  let state = (typeof seed === "string" ? seedFromText(seed) : seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return Object.assign(next, {
    between: (min: number, max: number): number => min + next() * (max - min),
    pick<T>(list: readonly T[]): T {
      const item = list[Math.floor(next() * list.length)];
      if (item === undefined) throw new Error("Nothing to pick from.");
      return item;
    },
    sign: (): 1 | -1 => (next() < 0.5 ? -1 : 1),
  });
}
