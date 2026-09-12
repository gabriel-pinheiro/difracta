import { z } from "zod";

/**
 * Live state: what is happening right now around a document, replicated to
 * subscribers that ask for it (`subscribe` with `live: true`) but never
 * written to the file, never in undo history, and never versioned by the
 * document revision. Today it holds the Output Sessions.
 */
const Count = z
  .object({
    executedPerFrame: z.number().nonnegative(),
    enabled: z.number().int().nonnegative(),
    relevant: z.number().int().nonnegative(),
  })
  .strict();
export type WorkloadCount = z.infer<typeof Count>;

/** How many issues one telemetry report carries at most; the Output keeps the first ones. */
export const MAX_TELEMETRY_ISSUES = 8;

/** A planned Layer drawing nothing on the Output because its Visual or Filter cannot run. */
export const OutputIssueSchema = z
  .object({
    layerId: z.string(),
    /** The Visual or Filter definition id. */
    definition: z.string(),
    message: z.string(),
  })
  .strict();
export type OutputIssue = z.infer<typeof OutputIssueSchema>;

export const OutputTelemetrySchema = z
  .object({
    /** Canvas size in device pixels after the pixel-ratio policy. */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    pixelRatio: z.number().positive(),
    /** Rolling average between animation frames; null before the first measure. */
    frameIntervalMs: z.number().nonnegative().nullable(),
    /** Rolling average spent producing one frame; null before the first measure. */
    renderWorkMs: z.number().nonnegative().nullable(),
    workload: z
      .object({
        canvasVisuals: Count,
        shaderVisuals: Count,
        filters: Count,
      })
      .strict(),
    /**
     * Layers that failed on this Output, empty when all run. Optional so a
     * report without it still validates; a reader treats a missing list as
     * empty.
     */
    issues: z.array(OutputIssueSchema).max(MAX_TELEMETRY_ISSUES).optional(),
  })
  .strict();
export type OutputTelemetry = z.infer<typeof OutputTelemetrySchema>;

/** One Output page tab attached to one Output. */
export const OutputSessionLiveSchema = z
  .object({
    sessionId: z.string(),
    outputId: z.string(),
    connectedAt: z.number(),
    /** Epoch ms of the last telemetry report; null until the first one. */
    reportedAt: z.number().nullable(),
    /** No report within `settings.live.staleAfterMs`. */
    stale: z.boolean(),
    telemetry: OutputTelemetrySchema.nullable(),
  })
  .strict();
export type OutputSessionLive = z.infer<typeof OutputSessionLiveSchema>;

/** The runtime's OSC door: which port, and how many OSCQuery clients listen for values. */
export const OscLiveSchema = z
  .object({ port: z.number().int().nullable(), listeners: z.number().int() })
  .strict();
export type OscLive = z.infer<typeof OscLiveSchema>;

export const LiveStateSchema = z
  .object({
    osc: OscLiveSchema,
    outputs: z.record(
      z.string(),
      z
        .object({ sessions: z.record(z.string(), OutputSessionLiveSchema) })
        .strict(),
    ),
  })
  .strict();
export type LiveState = z.infer<typeof LiveStateSchema>;

export const EMPTY_LIVE_STATE: LiveState = {
  osc: { port: null, listeners: 0 },
  outputs: {},
};
