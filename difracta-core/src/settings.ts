/**
 * Every tunable in one place. Packages import from here instead of carrying
 * their own literals, so someone adjusting Difracta for their rig changes one
 * file. Command-line flags and environment variables override the runtime
 * values at startup (see `difracta-runtime/src/config.ts`).
 */
export const settings = {
  runtime: {
    host: "0.0.0.0",
    port: 4800,
    /** Where the live websocket is served. */
    livePath: "/live",
  },
  history: {
    /** Consecutive same-key entries from one actor within this window merge into one undo step. */
    coalesceWindowMs: 1_000,
    /** Oldest undo entries are dropped past this count. */
    limit: 500,
  },
  autosave: {
    /** Delay between a document becoming dirty and its sidecar being written. */
    delayMs: 5_000,
  },
  client: {
    /** First reconnect delay; doubles on each failure up to the maximum. */
    reconnectInitialMs: 500,
    reconnectMaxMs: 5_000,
  },
  cli: {
    connectTimeoutMs: 3_000,
  },
} as const;
