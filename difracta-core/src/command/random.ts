/**
 * A repeatable stand-in for `Math.random`: the same seed gives the same
 * numbers in [0, 1), so a test of a Macro's Run Mode or an action's Chance
 * asserts what it picked. Mulberry32: small, and neighbouring seeds already
 * differ on their first draw.
 */
export function seededRandom(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}
