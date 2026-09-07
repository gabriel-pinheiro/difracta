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

export const LiveStateSchema = z
  .object({
    outputs: z.record(
      z.string(),
      z
        .object({ sessions: z.record(z.string(), OutputSessionLiveSchema) })
        .strict(),
    ),
  })
  .strict();
export type LiveState = z.infer<typeof LiveStateSchema>;

export const EMPTY_LIVE_STATE: LiveState = { outputs: {} };
