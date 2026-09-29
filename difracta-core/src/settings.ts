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
    /** Where a Media item's file is served, by id: `GET /media/<id>`. */
    mediaPath: "/media",
    /** Where a Bundled Media entry's file is served, by entry id: `GET /bundled/<id>`. */
    bundledPath: "/bundled",
    /** Where a Bundled Font's files are served, by file name: `GET /fonts/<file>`. */
    fontsPath: "/fonts",
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
  media: {
    /** File extensions a Media file may have; the type is read from the extension, never stored. */
    imageExtensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
    videoExtensions: ["mp4", "webm", "mov"],
    /**
     * Whether the runtime serves a Media file whose path leaves the
     * Installation file's folder. Off, such an item is `outside` and its
     * file is refused; `--media-anywhere` turns it on for one runtime.
     */
    allowOutsideShowFolder: false,
    video: {
      /**
       * How many video preloads an Output loads to their first frame at the
       * same moment; the rest wait their turn, so opening an Output with
       * many video Media items does not start a decoder for each at once.
       */
      preloadBatch: 4,
      /** A preload with no first frame and no error after this long gives its turn up. */
      preloadStallMs: 5_000,
      /**
       * How many hardware video decoders work at the same moment, a player
       * playing or loading its first frame each taking one; players past
       * it decode on the CPU. Measured on Chromium on Linux with VA-API;
       * other platforms were not measured. An Output playing more players
       * than this shows a warning.
       */
      hardwareDecoders: 16,
      /** How a Video synced to a tempo chases the beat Cue. */
      sync: {
        /** The most the rate bends to make up a distance, as a fraction of the rate. */
        maxBend: 0.1,
        /** A distance is made up over about this long, in seconds, when the bend allows. */
        chaseSeconds: 0.5,
        /** A clip this close to the beat, in seconds, is on it and owes nothing. */
        lockedWithin: 0.008,
        /** The bend moves in steps of this, so the rate is not set on every frame. */
        bendStep: 0.01,
        /** Synced, Speed is read as the nearest power of two between these. */
        minSpeed: 0.25,
        maxSpeed: 4,
      },
    },
    /** The most beats a Media item lasts. */
    maxBeats: 4_096,
    /**
     * The release of the difracta-media repository whose clips are the
     * Bundled Media: `npm run media:fetch` downloads
     * `difracta-media-<version>.tar.gz` from that release and refuses it
     * unless its SHA-256 is `sha256`. An empty `sha256` pins nothing: the
     * script then writes an empty manifest unless `DIFRACTA_MEDIA_DIR`
     * names a local copy.
     */
    bundle: {
      version: "0.1.1",
      sha256:
        "3e37de35fd4136e49087f08cfae911f0d6c9ada9c9fd91d9940f3d2c8b0c1f25",
      url: "https://github.com/gabriel-pinheiro/difracta-media/releases/download/v<version>/difracta-media-<version>.tar.gz",
    },
  },
  text: {
    /** The most characters a text Parameter or a Text Controller holds. */
    maxLength: 2_000,
    /**
     * The longest side, in pixels, of a picture text is rasterized into;
     * text asking for more is drawn smaller and stretched.
     */
    maxRasterSize: 4_096,
  },
  regions: {
    /** A new Region is the Surface minus this fraction on each side. */
    defaultInset: 0.25,
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
  preview: {
    /**
     * How long Studio's Preview waits after its panel stops changing size
     * before it renders at the new size: a size change starts every Visual
     * again, so a drag costs one restart, not one per step.
     */
    resizeSettleMs: 250,
    /** For how many Installations and Outputs Studio remembers what the Preview showed; the oldest drop off. */
    rememberedLimit: 64,
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
  displays: {
    /**
     * How long a Display Host gets to answer `displays.show` or
     * `displays.hide` before the runtime tells the requester it did not.
     */
    requestTimeoutMs: 10_000,
  },
  shares: {
    /**
     * The most Viewers one Screen Share takes, waiting ones included: the
     * Sharer encodes once per Viewer.
     */
    maxViewers: 8,
    /**
     * How long a share whose Sharer's connection dropped stays
     * `interrupted`, waiting for the same Sharer to declare it again,
     * before it falls to `idle`.
     */
    interruptedForMs: 30_000,
    /** The largest signalling payload the runtime relays, as JSON characters. */
    maxSignalBytes: 64 * 1024,
  },
  client: {
    /** First reconnect delay; doubles on each failure up to the maximum. */
    reconnectInitialMs: 500,
    reconnectMaxMs: 5_000,
  },
  cli: {
    connectTimeoutMs: 3_000,
    /** How long a reply waits for its own change to reach the CLI's replica, to name what a command created. */
    replicaCatchUpTimeoutMs: 1_000,
  },
  desktop: {
    /** How long Desktop waits for the runtime it started to answer `/health`. */
    runtimeStartTimeoutMs: 15_000,
    /** The first wait between two `/health` attempts; doubles up to the maximum. */
    healthPollInitialMs: 50,
    healthPollMaxMs: 500,
    /** How long the runtime gets to flush and exit on quit before it is killed. */
    runtimeStopTimeoutMs: 5_000,
    /** How long, after the runtime exits, its last lines get to come through its pipes before the log is closed. */
    runtimeLogDrainMs: 250,
    /** The Studio window's size on first show. */
    windowWidth: 1440,
    windowHeight: 900,
    /** The launch page's window: a chooser, so smaller than Studio's. */
    launchWindowWidth: 980,
    launchWindowHeight: 780,
    /** How long a runtime somewhere else gets to answer `/health` before Desktop says it cannot be reached. */
    remoteCheckTimeoutMs: 4_000,
    /** Runtimes connected to before that the launch page keeps; the oldest drop off. */
    rememberedRuntimesLimit: 12,
    /**
     * How long Desktop waits for more changes before it rebuilds the native
     * menu, which cannot be edited in place.
     */
    menuRebuildDelayMs: 30,
    /** The most items per menu, and the longest label, Desktop takes from a page for the native menu. */
    pageMenuItemsLimit: 40,
    pageMenuLabelLimit: 80,
    /**
     * A runtime child that exits by itself is started again after this wait,
     * doubled for every restart still inside the window below.
     */
    runtimeRestartInitialDelayMs: 500,
    /** This many restarts within the window and Desktop stops trying. */
    runtimeRestartLimit: 3,
    runtimeRestartWindowMs: 60_000,
    /** How long the runtime gets to say which Output Sessions are attached before Desktop leaves without the warning. */
    outputSessionsTimeoutMs: 1_500,
    /**
     * For how many Installations Desktop remembers which Display showed each
     * Output; the one placed longest ago drops off.
     */
    displayMappingsLimit: 64,
  },
} as const;
