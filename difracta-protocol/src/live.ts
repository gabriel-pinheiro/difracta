import { settings } from "@difracta/core";
import { z } from "zod";

import { DisplayHostLiveSchema } from "./display-hosts.ts";
import { PackLiveSchema } from "./packs.ts";
import { ShareLiveSchema } from "./screen-shares.ts";

/**
 * Live state: what is happening right now around a document, replicated to
 * subscribers that ask for it (`subscribe` with `live: true`) but never
 * written to the file, never in undo history, and never versioned by the
 * document revision. Today it holds the OSC door, the Output Sessions, the
 * connected Display Hosts, the Packs the runtime has loaded with their
 * entries, and who shares into each Screen Share.
 */
const Count = z
  .object({
    executedPerFrame: z.number().nonnegative(),
    enabled: z.number().int().nonnegative(),
    relevant: z.number().int().nonnegative(),
  })
  .strict();
export type WorkloadCount = z.infer<typeof Count>;

/**
 * Video on an Output: the video elements playing, the ones it holds (one
 * kept ready per video entry in use and one per playback a Layer holds, a
 * decoder each), and the planned Layers whose Visual takes a video.
 */
const VideoCount = z
  .object({
    playing: z.number().int().nonnegative(),
    players: z.number().int().nonnegative(),
    layers: z.number().int().nonnegative(),
  })
  .strict();
export type VideoCount = z.infer<typeof VideoCount>;

/**
 * How many of the players playing are past the hardware decoders
 * (`settings.media.video.hardwareDecoders`), and so may decode on the CPU;
 * zero within the limit. Inferred from the count: a page cannot ask which
 * decoder a player got.
 */
export function videosPastHardware(count: Pick<VideoCount, "playing">): number {
  return Math.max(0, count.playing - settings.media.video.hardwareDecoders);
}

/**
 * Screen Shares on an Output: the slots it views, waiting ones included,
 * the ones whose peer connection is up, and, when the runtime refused it
 * as a Viewer of one, the runtime's words. A page cannot tell whether it
 * decodes a share in hardware.
 */
const ShareViewCount = z
  .object({
    viewed: z.number().int().nonnegative(),
    connected: z.number().int().nonnegative(),
    refused: z.string().optional(),
  })
  .strict();
export type ShareViewCount = z.infer<typeof ShareViewCount>;

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
        /** Optional so a report without it still validates. */
        videos: VideoCount.optional(),
        /** Optional so a report without it still validates. */
        shares: ShareViewCount.optional(),
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

/**
 * The sections of the live state. A subscriber asks for all of them
 * (`live: true`) or names the ones it reads: an Output page asks for
 * `packs` alone, so it never pays for telemetry or Display Hosts.
 */
export const LIVE_SECTIONS = [
  "osc",
  "outputs",
  "displayHosts",
  "packs",
  "shares",
] as const;
export const LiveSectionSchema = z.enum(LIVE_SECTIONS);
export type LiveSection = z.infer<typeof LiveSectionSchema>;

/** What `subscribe` asks of the live state: all of it, or the sections named; false or absent for none. */
export const LiveRequestSchema = z.union([
  z.boolean(),
  z.array(LiveSectionSchema),
]);
export type LiveRequest = z.infer<typeof LiveRequestSchema>;

/** Whether `request` includes `section`. */
export function liveSectionWanted(
  request: LiveRequest | undefined,
  section: LiveSection,
): boolean {
  if (request === undefined || request === false) return false;
  return request === true || request.includes(section);
}

export const LiveStateSchema = z
  .object({
    osc: OscLiveSchema,
    outputs: z.record(
      z.string(),
      z
        .object({ sessions: z.record(z.string(), OutputSessionLiveSchema) })
        .strict(),
    ),
    /** Connected Display Hosts by id; they belong to connections, not to the document. */
    displayHosts: z.record(z.string(), DisplayHostLiveSchema),
    /** The Packs the runtime has loaded, by Pack id: the Bundled Pack and the open Installation's attached ones. */
    packs: z.record(z.string(), PackLiveSchema),
    /** Each Screen Share of the open document by id: who shares into it. */
    shares: z.record(z.string(), ShareLiveSchema),
  })
  .strict();
export type LiveState = z.infer<typeof LiveStateSchema>;

export const EMPTY_LIVE_STATE: LiveState = {
  osc: { port: null, listeners: 0 },
  outputs: {},
  displayHosts: {},
  packs: {},
  shares: {},
};

/** `state` with only the sections `request` asks for; the rest as empty as `EMPTY_LIVE_STATE` has them. */
export function liveStateFor(
  state: LiveState,
  request: LiveRequest,
): LiveState {
  if (request === true) return state;
  const picked: Record<string, unknown> = { ...EMPTY_LIVE_STATE };
  if (request !== false)
    for (const section of request) picked[section] = state[section];
  return picked as LiveState;
}
