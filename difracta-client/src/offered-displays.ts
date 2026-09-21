import type {
  ClientMessage,
  DisplayAction,
  DisplayHostReport,
  DisplayOutcome,
  ServerMessage,
} from "@difracta/protocol";

/** Shows or hides an Output on a Display of this machine and says how it went. */
export type DisplayActionHandler = (
  action: DisplayAction,
) => DisplayOutcome | Promise<DisplayOutcome>;

/**
 * The Display Host side of a connection of kind `desktop`: what this machine
 * offers, and the answer to the runtime's `display-request`s. `offer` both
 * registers the host and updates it; the runtime replicates what changed.
 * The host says what its Displays show, so after an action it offers again
 * with the new `showing`. The offer is sent again after every reconnect.
 */
export class OfferedDisplays {
  readonly #send: (message: ClientMessage) => boolean;
  #report: DisplayHostReport | null = null;
  #handler: DisplayActionHandler | undefined;

  constructor(send: (message: ClientMessage) => boolean) {
    this.#send = send;
  }

  /** Registers this connection as a Display Host, or updates what it said before. */
  offer(report: DisplayHostReport): void {
    this.#report = report;
    this.#send({ type: "display-host", host: report });
  }

  /** Stops being a Display Host; the connection stays. */
  withdraw(): void {
    if (this.#report === null) return;
    this.#report = null;
    this.#send({ type: "display-host", host: null });
  }

  /** Who carries out `displays.show` and `displays.hide` here; one handler, the last set. */
  onAction(handler: DisplayActionHandler): void {
    this.#handler = handler;
  }

  /** The client calls this after `welcome`. */
  resend(): void {
    if (this.#report !== null)
      this.#send({ type: "display-host", host: this.#report });
  }

  /** The client calls this with a `display-request`; a handler that throws answers with its message. */
  async receive(
    message: ServerMessage & { type: "display-request" },
  ): Promise<void> {
    let outcome: DisplayOutcome;
    try {
      outcome =
        this.#handler === undefined
          ? { ok: false, error: "This Display Host does not show Outputs." }
          : await this.#handler(message.request);
    } catch (error) {
      outcome = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    this.#send({
      type: "display-reply",
      requestId: message.requestId,
      outcome,
    });
  }
}
