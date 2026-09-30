import { Signal } from "@difracta/client";
import { settings, type ShareQuality } from "@difracta/core";
import type { ShareDeclaration, ShareEndReason } from "@difracta/protocol";

import {
  ShareSending,
  type Captured,
  type SendingContext,
} from "./share-sending";

/** The Sharer side of a connection to the runtime, which `client.sharing` of `@difracta/client` is. */
export interface SharingClient {
  share(mediaId: string, declaration: ShareDeclaration): void;
  stop(mediaId: string): void;
  signal(mediaId: string, viewerId: string, payload: unknown): boolean;
  onViewer(
    listener: (change: {
      readonly mediaId: string;
      readonly viewerId: string;
      readonly joined: boolean;
    }) => void,
  ): () => void;
  onSignal(
    listener: (mediaId: string, viewerId: string, payload: unknown) => void,
  ): () => void;
  onEnded(
    listener: (end: {
      readonly mediaId: string;
      readonly reason: ShareEndReason;
      readonly message: string;
    }) => void,
  ): () => void;
}

/** What a person picked when starting a share. */
export interface ShareChoices {
  readonly quality: ShareQuality;
  readonly cursor: boolean;
}

/** A share this computer runs, as the share window lists it. */
export interface RunningShare extends ShareChoices {
  /** The slot: the Screen Share's Media id. */
  readonly mediaId: string;
  readonly stream: MediaStream;
  readonly source: ShareDeclaration["source"];
  /**
   * Whether the cursor is in the picture, as the capture says. A system
   * that draws it into every capture shows it whatever was chosen.
   */
  readonly cursorShown: boolean;
  /** The Viewers a connection was made for, and the ones whose picture arrives. */
  readonly offered: number;
  readonly connected: number;
}

/** A share that ended without the person stopping it, and why, until dismissed. */
export interface EndedShare {
  readonly mediaId: string;
  readonly message: string;
}

export const CAPTURE_ENDED =
  "What was shared closed, or the system stopped the capture.";

interface Running {
  readonly captured: Captured;
  readonly sending: ShareSending;
  readonly source: ShareDeclaration["source"];
  readonly cursorShown: boolean;
  readonly choices: ShareChoices;
}

/** A screen or a window, from what the capture says it is; a browser tab counts as a window. */
export function capturedSource(
  track: Pick<MediaStreamTrack, "getSettings">,
): ShareDeclaration["source"] {
  return track.getSettings().displaySurface === "monitor" ? "screen" : "window";
}

/**
 * Whether the cursor is in the picture: what the capture says of itself,
 * and what was asked for where it says nothing.
 */
export function capturedCursor(
  track: Pick<MediaStreamTrack, "getSettings">,
  asked: boolean,
): boolean {
  const { cursor } = track.getSettings() as { readonly cursor?: string };
  return cursor === undefined ? asked : cursor !== "never";
}

/**
 * This computer as a Sharer: the shares it runs, keyed by slot, each a
 * capture and the connections to its Viewers (`share-sending.ts`). It
 * declares a share to the runtime with this computer's name and whether a
 * screen or a window is shared, and nothing else about the source. A share
 * started into a slot this computer already shares into takes its place,
 * as a share that is new to the runtime, so every Viewer is announced
 * again.
 *
 * A share ends when the person stops it, when the capture ends (the shared
 * window closed) and when the runtime says so (replaced, stopped by another
 * client, the slot removed, refused); the last two leave a line saying why.
 */
export class Sharer {
  readonly shares = new Signal<readonly RunningShare[]>([]);
  readonly ended = new Signal<readonly EndedShare[]>([]);
  readonly #client: SharingClient;
  readonly #name: string;
  readonly #sending: Pick<
    SendingContext,
    "createPeer" | "codecs" | "connectionId"
  >;
  readonly #running = new Map<string, Running>();
  readonly #unsubscribe: readonly (() => void)[];

  constructor(options: {
    readonly client: SharingClient;
    /** This computer's name as a Sharer. */
    readonly name: string;
    readonly sending: Pick<
      SendingContext,
      "createPeer" | "codecs" | "connectionId"
    >;
  }) {
    this.#client = options.client;
    this.#name = options.name;
    this.#sending = options.sending;
    const { client } = options;
    this.#unsubscribe = [
      client.onViewer(({ mediaId, viewerId, joined }) => {
        const sending = this.#running.get(mediaId)?.sending;
        if (joined) sending?.joined(viewerId);
        else sending?.left(viewerId);
      }),
      client.onSignal((mediaId, viewerId, payload) =>
        this.#running.get(mediaId)?.sending.signal(viewerId, payload),
      ),
      client.onEnded(({ mediaId, message }) => {
        if (this.#release(mediaId)) this.#say(mediaId, message);
      }),
    ];
  }

  /** Shares `captured` into the slot, as the person chose. */
  start(mediaId: string, captured: Captured, choices: ShareChoices): void {
    if (this.#running.has(mediaId)) this.stop(mediaId);
    const { track } = captured;
    track.contentHint =
      settings.shares.sharer.qualities[choices.quality].contentHint;
    const running: Running = {
      captured,
      choices,
      source: capturedSource(track),
      cursorShown: capturedCursor(track, choices.cursor),
      sending: new ShareSending(captured, choices.quality, {
        ...this.#sending,
        signal: (viewerId, signal) =>
          this.#client.signal(mediaId, viewerId, signal),
        changed: () => this.#publish(),
      }),
    };
    this.#running.set(mediaId, running);
    track.onended = () => {
      if (this.#running.get(mediaId) !== running) return;
      this.stop(mediaId);
      this.#say(mediaId, CAPTURE_ENDED);
    };
    this.dismiss(mediaId);
    this.#client.share(mediaId, { sharer: this.#name, source: running.source });
    this.#publish();
  }

  /** Stops sharing into the slot; the runtime tells its Viewers. */
  stop(mediaId: string): void {
    if (!this.#release(mediaId)) return;
    this.#client.stop(mediaId);
  }

  stopAll(): void {
    for (const mediaId of [...this.#running.keys()]) this.stop(mediaId);
  }

  /** Forgets why the slot's share ended. */
  dismiss(mediaId: string): void {
    const ended = this.ended.get();
    if (ended.some((entry) => entry.mediaId === mediaId))
      this.ended.set(ended.filter((entry) => entry.mediaId !== mediaId));
  }

  dispose(): void {
    this.stopAll();
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
  }

  /** Ends the capture and the connections; false when nothing was shared into the slot. */
  #release(mediaId: string): boolean {
    const running = this.#running.get(mediaId);
    if (running === undefined) return false;
    this.#running.delete(mediaId);
    running.sending.close();
    running.captured.track.onended = null;
    for (const track of running.captured.stream.getTracks()) track.stop();
    this.#publish();
    return true;
  }

  #say(mediaId: string, message: string): void {
    this.ended.set([
      ...this.ended.get().filter((entry) => entry.mediaId !== mediaId),
      { mediaId, message },
    ]);
  }

  #publish(): void {
    this.shares.set(
      [...this.#running].map(([mediaId, running]) => ({
        mediaId,
        stream: running.captured.stream,
        source: running.source,
        cursorShown: running.cursorShown,
        ...running.choices,
        ...running.sending.viewers(),
      })),
    );
  }
}
