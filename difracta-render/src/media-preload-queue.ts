/**
 * The turns video preloads take: at most `batch` of them load their first
 * frame at the same moment, since each one loading holds a decoder at
 * work. A turn ends when the element has its first frame, fails, or
 * stalls for `stallMs`, so a file that never loads holds nobody back.
 * Among the ones waiting, the items `advance` was told are wanted go
 * first, in the order they asked, then the rest. Nothing starts until
 * `advance` is called, so the first batch already follows what is wanted;
 * a turn that ends starts the next by itself.
 */
export interface PreloadTimers {
  set(callback: () => void, ms: number): unknown;
  clear(timer: unknown): void;
}

export interface PreloadTurn {
  /** Gives the turn up, waiting or loading. */
  cancel(): void;
}

export interface PreloadQueue {
  /** Asks for a turn for the entry `id`; `start` makes the element that loads. */
  request(id: string, start: () => HTMLVideoElement): PreloadTurn;
  /** How many are waiting for a turn. */
  readonly waiting: number;
  /** Starts as many waiting preloads as there are free turns, the wanted items first. */
  advance(wanted?: ReadonlySet<string>): void;
}

const NONE_WANTED: ReadonlySet<string> = new Set();

const BROWSER_TIMERS: PreloadTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (timer) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  },
};

interface Waiting {
  readonly id: string;
  readonly start: () => HTMLVideoElement;
  /** Set once loading: ends the turn. */
  end: (() => void) | undefined;
}

export function createPreloadQueue(options: {
  readonly batch: number;
  readonly stallMs: number;
  readonly timers?: PreloadTimers | undefined;
}): PreloadQueue {
  const timers = options.timers ?? BROWSER_TIMERS;
  const waiting: Waiting[] = [];
  let loading = 0;
  let wanted = NONE_WANTED;

  const next = (): Waiting | undefined => {
    const preferred = waiting.findIndex((entry) => wanted.has(entry.id));
    return waiting.splice(Math.max(0, preferred), 1)[0];
  };
  const begin = (entry: Waiting): void => {
    loading += 1;
    const element = entry.start();
    const end = (): void => {
      if (entry.end === undefined) return;
      entry.end = undefined;
      element.removeEventListener("loadeddata", end);
      element.removeEventListener("error", end);
      timers.clear(timer);
      loading -= 1;
      fill();
    };
    entry.end = end;
    element.addEventListener("loadeddata", end);
    element.addEventListener("error", end);
    const timer = timers.set(end, options.stallMs);
  };
  const fill = (): void => {
    while (loading < options.batch) {
      const entry = next();
      if (entry === undefined) return;
      begin(entry);
    }
  };

  return {
    request(id, start) {
      const entry: Waiting = { id, start, end: undefined };
      waiting.push(entry);
      return {
        cancel() {
          const index = waiting.indexOf(entry);
          if (index >= 0) waiting.splice(index, 1);
          else entry.end?.();
        },
      };
    },
    get waiting() {
      return waiting.length;
    },
    advance(ids) {
      if (ids !== undefined) wanted = ids;
      fill();
    },
  };
}
