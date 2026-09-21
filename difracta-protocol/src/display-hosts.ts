import { z } from "zod";

/**
 * Display Hosts: connections of kind `desktop` that offer the Displays of
 * their machine for showing Outputs. A host sends `display-host` with what it
 * offers and what each Display shows; the runtime keeps one entry per host in
 * the live state and routes `displays.show` and `displays.hide` to the host's
 * connection as a `display-request`, which the host answers with a
 * `display-reply`. The host, not the runtime, says what a Display shows: it
 * reports again after it opened or closed something.
 */
const DisplayId = z.string().min(1).max(200);

/** A physical screen, as the operating system of the host describes it. */
export const DisplaySchema = z
  .object({
    /** Unique within its host; what `displays.show` takes. */
    id: DisplayId,
    /** The screen's name for a person choosing one, such as its model. */
    label: z.string().max(200),
    /** Where it sits on the host's desktop, in that desktop's points. */
    bounds: z
      .object({
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .strict(),
    /** Device pixels per point. */
    scaleFactor: z.number().positive(),
    primary: z.boolean(),
    /** Built into the machine, such as a laptop's own screen. */
    internal: z.boolean(),
  })
  .strict();
export type Display = z.infer<typeof DisplaySchema>;

/** Display id → the Output it shows; a Display showing nothing has no key. */
const ShowingSchema = z.record(DisplayId, z.string().min(1));

/** What a host says about itself; sent whole, the runtime replicates what changed. */
export const DisplayHostReportSchema = z
  .object({
    /** How people tell hosts apart, usually the machine's name. */
    name: z.string().trim().min(1).max(120),
    displays: z.array(DisplaySchema).max(32),
    showing: ShowingSchema,
  })
  .strict();
export type DisplayHostReport = z.infer<typeof DisplayHostReportSchema>;

/** One connected Display Host in the live state. */
export const DisplayHostLiveSchema = z
  .object({
    /**
     * The name as a slug (`stage-pc`), with `-2`, `-3`… while another
     * connected host holds the same one. Kept for the connection's lifetime.
     */
    id: z.string(),
    sessionId: z.string(),
    connectedAt: z.number(),
    name: z.string(),
    displays: z.array(DisplaySchema),
    showing: ShowingSchema,
  })
  .strict();
export type DisplayHostLive = z.infer<typeof DisplayHostLiveSchema>;

/** What the runtime asks of a host's connection. */
export const DisplayActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("show"),
      display: DisplayId,
      output: z.string().min(1),
    })
    .strict(),
  z.object({ action: z.literal("hide"), display: DisplayId }).strict(),
]);
export type DisplayAction = z.infer<typeof DisplayActionSchema>;

/** The host's answer: done, or why not in words a person can read. */
export const DisplayOutcomeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }).strict(),
  z.object({ ok: z.literal(false), error: z.string() }).strict(),
]);
export type DisplayOutcome = z.infer<typeof DisplayOutcomeSchema>;

/** What `displays.show` and `displays.hide` reply with: where the action landed. */
export interface DisplayActionResult {
  readonly host: string;
  readonly display: string;
  /** The Output now shown; absent after a hide. */
  readonly output?: string;
}
