import { settings } from "@difracta/core";
import { z } from "zod";

/**
 * Screen Shares: a Media item of kind `share` is a slot a Sharer (a
 * connection of kind `desktop`) shares a screen or window into, and any
 * client may view. The runtime keeps who shares into each slot and who
 * views it, and relays the WebRTC signalling between the Sharer and each
 * Viewer without reading it. Everything is keyed by slot: the slot's Media
 * id.
 *
 * Sharer, to the runtime: `share` declares, updates or stops a share;
 * `share-signal` with `viewerId` sends one Viewer a payload.
 * Runtime, to the Sharer: `share-viewer` says a Viewer joined (offer to it,
 * anew if one was already there) or left; `share-signal` with `viewerId`
 * brings a Viewer's payload; `share-ended` says a share stopped without the
 * Sharer asking, and why.
 *
 * Viewer, to the runtime: `share-view` joins or leaves a slot; joining a
 * slot already viewed asks the Sharer for a new offer; `share-signal`
 * without `viewerId` sends the slot's Sharer a payload.
 * Runtime, to the Viewer: `share-viewing` after each `share-view` and on
 * every change of the slot's Sharer; `share-signal` without `viewerId`
 * brings the Sharer's payload.
 */
const MediaId = z.string().min(1);

/** Whether the Sharer shares a whole screen or one window. Nothing else about the source travels. */
export const ShareSourceSchema = z.enum(["screen", "window"]);
export type ShareSource = z.infer<typeof ShareSourceSchema>;

/** What a Sharer says about a share: its own name, as its Display Host is named, and the kind of source. */
export const ShareDeclarationSchema = z
  .object({
    sharer: z.string().trim().min(1).max(120),
    source: ShareSourceSchema,
  })
  .strict();
export type ShareDeclaration = z.infer<typeof ShareDeclarationSchema>;

/** Why a share ended without its Sharer asking. */
export const ShareEndReasonSchema = z.enum([
  /** Another Sharer declared the same slot. */
  "replaced",
  /** A client stopped it with `shares.stop`. */
  "stopped",
  /** The slot left the open Installation, or no Installation is open. */
  "removed",
  /** The declaration was not taken: the message says why. */
  "refused",
]);
export type ShareEndReason = z.infer<typeof ShareEndReasonSchema>;

/**
 * A signalling payload, relayed unread: an SDP offer or answer, an ICE
 * candidate, whatever the two ends agree on. At most
 * `settings.shares.maxSignalBytes` characters of JSON.
 */
export const ShareSignalPayloadSchema = z
  .unknown()
  .refine(
    (payload) =>
      (JSON.stringify(payload) ?? "").length <= settings.shares.maxSignalBytes,
    {
      message: `A signalling payload is at most ${String(settings.shares.maxSignalBytes)} characters of JSON.`,
    },
  );

/**
 * What a Viewer hears about a slot it asked to view: `idle` while nobody
 * shares (it waits and is connected when a Sharer arrives), `live` or
 * `interrupted` with the id of the share, which changes when another share
 * starts in the slot so the Viewer drops what it had, or `refused` with the
 * reason it is not a Viewer of the slot.
 */
export const ShareViewingSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("idle") }).strict(),
  z.object({ status: z.literal("live"), share: z.string() }).strict(),
  z.object({ status: z.literal("interrupted"), share: z.string() }).strict(),
  z.object({ status: z.literal("refused"), error: z.string() }).strict(),
]);
export type ShareViewing = z.infer<typeof ShareViewingSchema>;

export const SHARE_STATUSES = ["idle", "live", "interrupted"] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

/**
 * A Screen Share in the live state, under `["media", id]` like every Media
 * item's status: `idle` while nobody shares, `live` while a Sharer does,
 * `interrupted` while its Sharer's connection is gone and may come back.
 * Not idle, it says who shares, a screen or a window, since when (epoch
 * ms, kept across an interruption) and how many Viewers it has.
 */
export const ShareLiveSchema = z.union([
  z.object({ status: z.literal("idle") }).strict(),
  z
    .object({
      status: z.enum(["live", "interrupted"]),
      sharer: z.string(),
      source: ShareSourceSchema,
      since: z.number(),
      viewers: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type ShareLive = z.infer<typeof ShareLiveSchema>;

/** What a client sends about Screen Shares; `messages.ts` adds them to the protocol. */
export const SHARE_CLIENT_MESSAGES = [
  /**
   * This `desktop` connection shares into the slot, or stops (null). Sent
   * again to change what it says. `resume` marks a declaration sent again
   * after a reconnect: it takes the slot back only while nobody else shares
   * into it.
   */
  z
    .object({
      type: z.literal("share"),
      mediaId: MediaId,
      share: ShareDeclarationSchema.nullable(),
      resume: z.boolean().optional(),
    })
    .strict(),
  /** This connection views the slot, or stops (false); viewing it again asks for a new offer. */
  z
    .object({
      type: z.literal("share-view"),
      mediaId: MediaId,
      view: z.boolean(),
    })
    .strict(),
  /** A payload for the other end: with `viewerId` from the Sharer to that Viewer, without from a Viewer to the Sharer. */
  z
    .object({
      type: z.literal("share-signal"),
      mediaId: MediaId,
      viewerId: z.string().min(1).optional(),
      payload: ShareSignalPayloadSchema,
    })
    .strict(),
] as const;

/** What the runtime sends about Screen Shares. */
export const SHARE_SERVER_MESSAGES = [
  /** To a Sharer: a Viewer joined the slot (offer to it, anew if one was there) or left. */
  z
    .object({
      type: z.literal("share-viewer"),
      mediaId: MediaId,
      /** Stable for the Viewer's connection. */
      viewerId: z.string(),
      joined: z.boolean(),
    })
    .strict(),
  /** To a Sharer: its share of the slot ended without it asking. */
  z
    .object({
      type: z.literal("share-ended"),
      mediaId: MediaId,
      reason: ShareEndReasonSchema,
      message: z.string(),
    })
    .strict(),
  /** To a Viewer: where it stands with the slot. */
  z
    .object({
      type: z.literal("share-viewing"),
      mediaId: MediaId,
      viewing: ShareViewingSchema,
    })
    .strict(),
  /** The other end's payload: with `viewerId` to the Sharer, from that Viewer; without, to a Viewer from the Sharer. */
  z
    .object({
      type: z.literal("share-signal"),
      mediaId: MediaId,
      viewerId: z.string().optional(),
      payload: z.unknown(),
    })
    .strict(),
] as const;

/** What `shares.stop` replies with: the slot and who was sharing into it. */
export interface ShareStopResult {
  readonly mediaId: string;
  readonly sharer: string;
}
