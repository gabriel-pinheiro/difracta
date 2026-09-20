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
    /**
     * Where the open document travels as a `.difracta` file: GET downloads a
     * copy, PUT replaces its content.
     */
    documentPath: "/document",
    /** The largest `.difracta` file a PUT there may carry. */
    maxDocumentBytes: 64 * 1024 * 1024,
    /**
     * Document mode when `--documents` is not given. `pinned` keeps the file
     * the runtime was started with; `free` lets loopback clients create, open
     * and close Installations and save them elsewhere.
     */
    documents: "pinned",
  },
  osc: {
    /** UDP for OSC input, HTTP and WebSocket for OSCQuery, all on this port. */
    port: 9000,
    /** How the runtime announces itself to Chataigne and other OSCQuery browsers. */
    name: "Difracta",
    /** Rejected OSC input is logged at most once per reason within this window. */
    rejectionLogIntervalMs: 5_000,
  },
  discovery: {
    /** The DNS-SD service the runtime announces on its HTTP port: `_difracta._tcp`. */
    serviceType: "difracta",
    /** The instance is "<name> on <hostname>", like the OSC one. */
    name: "Difracta",
    /** A run of document changes re-announces the TXT record once, this long after the last. */
    txtUpdateDelayMs: 1_000,
    /** How long `difracta runtimes` listens for answers. */
    browseMs: 1_500,
  },
  history: {
    /** Consecutive same-key entries from one actor within this window merge into one undo step. */
    coalesceWindowMs: 1_000,
    /** Oldest undo entries are dropped past this count. */
    limit: 500,
  },
  autosave: {
    /** Delay between the last change to a dirty document and its sidecar being written. */
    delayMs: 5_000,
    /** A run of changes never keeps a sidecar waiting longer than this since the previous write. */
    maxWaitMs: 30_000,
  },
  numbers: {
    /**
     * How far a number may sit off its step grid and still count as on it, as
     * a fraction of the step: float noise from JSON and sliders, not a value
     * between steps.
     */
    stepTolerance: 1e-9,
  },
  masks: {
    /** A new Mask is the Surface minus this fraction on each side. */
    defaultInset: 0.1,
  },
  paths: {
    /** A new Path runs around the Surface this fraction in from each side. */
    defaultInset: 0.15,
  },
  output: {
    /**
     * How often the Projection Frame ticks while it has nothing to draw:
     * under Blackout or without a document. A document change wakes it.
     */
    idleFrameMs: 1_000,
  },
  live: {
    /** How often an Output page reports telemetry. */
    telemetryIntervalMs: 1_000,
    /** An Output Session with no report for this long shows as stale. */
    staleAfterMs: 3_000,
    /** ...and is dropped after this long (a socket that died without closing). */
    dropAfterMs: 600_000,
    /** How often the runtime checks sessions for staleness. */
    sweepIntervalMs: 1_000,
  },
  client: {
    /** First reconnect delay; doubles on each failure up to the maximum. */
    reconnectInitialMs: 500,
    reconnectMaxMs: 5_000,
  },
  cli: {
    connectTimeoutMs: 3_000,
  },
  desktop: {
    /** How long Desktop waits for the runtime it started to answer `/health`. */
    runtimeStartTimeoutMs: 15_000,
    /** The first wait between two `/health` attempts; doubles up to the maximum. */
    healthPollInitialMs: 50,
    healthPollMaxMs: 500,
    /** How long the runtime gets to flush and exit on quit before it is killed. */
    runtimeStopTimeoutMs: 5_000,
    /** The Studio window's size on first show. */
    windowWidth: 1440,
    windowHeight: 900,
    /** The launch page's window: a chooser, so smaller than Studio's. */
    launchWindowWidth: 760,
    launchWindowHeight: 680,
    /** How long a runtime somewhere else gets to answer `/health` before Desktop says it cannot be reached. */
    remoteCheckTimeoutMs: 4_000,
    /** Runtimes connected to before that the launch page keeps; the oldest drop off. */
    rememberedRuntimesLimit: 12,
  },
} as const;
