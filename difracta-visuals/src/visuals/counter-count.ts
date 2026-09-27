/**
 * The Counter's arithmetic, apart from its drawing: the count within its
 * limits, the digits it shows, and the columns that ease from one digit
 * to the next.
 */
export interface CountLimits {
  readonly min: number;
  readonly max: number;
  readonly atLimit: "stop" | "wrap";
}

/** The limits in order, whichever way round they were set. */
function bounds(limits: CountLimits): { low: number; high: number } {
  return {
    low: Math.min(limits.min, limits.max),
    high: Math.max(limits.min, limits.max),
  };
}

/** `count` held within the limits. */
export function clampCount(count: number, limits: CountLimits): number {
  const { low, high } = bounds(limits);
  return Math.min(high, Math.max(low, Math.round(count)));
}

/**
 * `count` moved by `change`: held at the limit it would pass, or with
 * Wrap carried on from the other one, the step after Maximum being
 * Minimum.
 */
export function moveCount(
  count: number,
  change: number,
  limits: CountLimits,
): number {
  const { low, high } = bounds(limits);
  const next = Math.round(count + change);
  if (limits.atLimit === "stop" || (next >= low && next <= high))
    return Math.min(high, Math.max(low, next));
  const span = high - low + 1;
  return low + ((((next - low) % span) + span) % span);
}

/** The digits of `count` without its sign, ones first, at least `minimum` and at most `maximum` of them. */
export function digitsOf(
  count: number,
  minimum: number,
  maximum: number,
): number[] {
  const text = String(Math.abs(Math.round(count)));
  const digits = Array.from(text, Number).reverse();
  while (digits.length < Math.min(minimum, maximum)) digits.push(0);
  return digits.slice(0, maximum);
}

/**
 * One digit's place on the strip of digits, which repeats every ten: it
 * eases from where it is to the digit it should show, the way the count
 * went, so 9 to 0 on the way up is one step on and not nine back.
 */
export interface Column {
  from: number;
  to: number;
  /** 0 to 1 along the way; 1 at rest. */
  progress: number;
}

const wrap = (value: number): number => ((value % 10) + 10) % 10;

const ease = (t: number): number => t * t * (3 - 2 * t);

export function columnAt(digit: number): Column {
  return { from: digit, to: digit, progress: 1 };
}

/** Where the column is now, from 0 up to 10. */
export function columnPlace(column: Column): number {
  return wrap(column.from + (column.to - column.from) * ease(column.progress));
}

export function columnMoving(column: Column): boolean {
  return column.progress < 1;
}

/** Sends the column to `digit`, up the strip for a `direction` above zero and down it otherwise, from wherever it is. */
export function sendColumn(
  column: Column,
  digit: number,
  direction: number,
): void {
  const shown = wrap(column.to);
  if (shown === digit) return;
  const steps = direction > 0 ? wrap(digit - shown) : -wrap(shown - digit);
  const place = column.from + (column.to - column.from) * ease(column.progress);
  column.from = place;
  column.to += steps;
  column.progress = 0;
}

/** Advances the column by `dt` seconds of a move that takes `time`; at rest it settles on its digit. */
export function stepColumn(column: Column, dt: number, time: number): void {
  if (column.progress >= 1) return;
  column.progress = time <= 0 ? 1 : Math.min(1, column.progress + dt / time);
  if (column.progress >= 1) {
    column.to = wrap(column.to);
    column.from = column.to;
  }
}

/** Puts the column on its digit at once. */
export function settleColumn(column: Column): void {
  column.to = wrap(column.to);
  column.from = column.to;
  column.progress = 1;
}
