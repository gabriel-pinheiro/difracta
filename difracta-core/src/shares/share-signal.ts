import { z } from "zod";

/**
 * What a Sharer and one of its Viewers say to each other through the
 * runtime, which relays it without reading it: the WebRTC negotiation of
 * one peer connection. The Sharer offers, once per Viewer it is told of and
 * again whenever it is told of that Viewer again, under a `connection` id it
 * makes up; the Viewer answers under the same id, and both send their ICE
 * candidates under it as they find them, `null` after the last
 * (`shareCandidate` turns the browser's into one). A payload
 * under another id than the connection in hand belongs to one that was
 * replaced and is dropped.
 */
const Connection = z.string().min(1).max(64);

/** An ICE candidate as `RTCIceCandidate.toJSON()` gives it; a field left out reads as null. */
const Candidate = z
  .object({
    candidate: z.string(),
    sdpMid: z.string().nullable().default(null),
    sdpMLineIndex: z.number().int().nonnegative().nullable().default(null),
    usernameFragment: z.string().nullable().default(null),
  })
  .strict();
export type ShareCandidate = z.infer<typeof Candidate>;

export const ShareSignalSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("offer"),
      connection: Connection,
      sdp: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("answer"),
      connection: Connection,
      sdp: z.string(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ice"),
      connection: Connection,
      candidate: Candidate.nullable(),
    })
    .strict(),
]);
export type ShareSignal = z.infer<typeof ShareSignalSchema>;

/** The payload as a signal, or undefined for anything else. */
export function parseShareSignal(payload: unknown): ShareSignal | undefined {
  const parsed = ShareSignalSchema.safeParse(payload);
  return parsed.success ? parsed.data : undefined;
}

/** A candidate as the browser hands it to `onicecandidate`, as a signal carries it. */
export function shareCandidate(
  candidate: {
    readonly candidate?: string;
    readonly sdpMid?: string | null;
    readonly sdpMLineIndex?: number | null;
    readonly usernameFragment?: string | null;
  } | null,
): ShareCandidate | null {
  if (candidate === null) return null;
  return {
    candidate: candidate.candidate ?? "",
    sdpMid: candidate.sdpMid ?? null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
    usernameFragment: candidate.usernameFragment ?? null,
  };
}
