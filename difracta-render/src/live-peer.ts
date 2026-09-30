import type { PreloadTimers } from "./media-preload-queue.ts";

/**
 * What the engine's Viewer needs from the page around it, each injected so
 * the Viewer is tested without a browser: the signalling, which
 * `client.viewing` of `@difracta/client` satisfies as it is, the peer
 * connections, the video elements and the timers.
 */
export type ShareViewingState =
  | { readonly status: "idle" }
  | { readonly status: "live" | "interrupted"; readonly share: string }
  | { readonly status: "refused"; readonly error: string };

export interface ShareSignalling {
  /** Views a slot; the runtime answers through `onViewing`. */
  view(mediaId: string): void;
  leave(mediaId: string): void;
  /** Asks the slot's Sharer for a new offer; also how a refused Viewer asks to view again. */
  requestOffer(mediaId: string): boolean;
  /** A payload for the slot's Sharer (`ShareSignal` in core). */
  signal(mediaId: string, payload: unknown): boolean;
  /** What the runtime last said about a slot, when it said anything. */
  state(mediaId: string): ShareViewingState | undefined;
  onViewing(
    listener: (mediaId: string, viewing: ShareViewingState) => void,
  ): () => void;
  onSignal(listener: (mediaId: string, payload: unknown) => void): () => void;
}

/** The part of `RTCPeerConnection` a Viewer uses. */
export type LivePeer = Pick<
  RTCPeerConnection,
  | "connectionState"
  | "onconnectionstatechange"
  | "onicecandidate"
  | "ontrack"
  | "setRemoteDescription"
  | "createAnswer"
  | "setLocalDescription"
  | "localDescription"
  | "addIceCandidate"
  | "close"
>;

export type LiveTimers = PreloadTimers;

export interface LiveViewerOptions {
  /** Without it nothing is viewed and every Screen Share stays empty. */
  readonly signalling?: ShareSignalling | undefined;
  readonly createPeer?: () => LivePeer;
  readonly createElement?: () => HTMLVideoElement;
  readonly timers?: LiveTimers;
}

/** Receive only, and no ICE servers: the Sharer is on the same network. */
export const browserPeer = (): LivePeer =>
  new RTCPeerConnection({ iceServers: [] });

/** Muted and inline, so it plays with no gesture; never in the page, only uploaded. */
export const browserElement = (): HTMLVideoElement => {
  const element = document.createElement("video");
  element.muted = true;
  element.playsInline = true;
  element.autoplay = true;
  return element;
};

export const BROWSER_TIMERS: LiveTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (timer) => {
    clearTimeout(timer as ReturnType<typeof setTimeout>);
  },
};
