/**
 * What the launch preload exposes to the launch page as
 * `window.difractaLaunch`, and the IPC channels behind it. A bridge of its
 * own, apart from `window.difractaDesktop`: the launch page chooses where
 * Desktop goes, Studio never may, so neither page can reach the other's
 * functions.
 *
 * The page declares the same shape in
 * `difracta-studio/src/launch/launch-bridge.ts`; keep the two in step.
 */

/** A runtime found on the network right now. */
export interface LaunchRuntime {
  /** The announced instance, "Difracta on <hostname>". */
  readonly name: string;
  readonly host: string;
  /** `address:port`, which is also what `connect` takes. */
  readonly address: string;
  readonly version: string | null;
  /** The open Installation's name; null when nothing is open. */
  readonly document: string | null;
}

/** A runtime Desktop connected to before, found on the network or not. */
export interface LaunchRemembered {
  readonly address: string;
  /** The name it announced when it was picked from the list; null for a typed address. */
  readonly name: string | null;
}

/**
 * What Desktop is showing while the launch page is open over it (File ▸
 * Connect to...): the runtime on this computer, or the one at `address`.
 */
export type LaunchCurrent =
  | { readonly kind: "local" }
  | { readonly kind: "remote"; readonly address: string };

export type LaunchResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface DifractaLaunch {
  /** Why Desktop shows this page instead of resuming (a runtime that did not answer), or null. */
  problem(): Promise<string | null>;
  /**
   * The runtime in use, which the page marks instead of offering; null when
   * the page is all there is (the first launch, a resume that failed).
   * Choosing it anyway only closes the page.
   */
  current(): Promise<LaunchCurrent | null>;
  /**
   * Starts a runtime on this computer and opens its Studio. Resolves once it
   * is up, which takes a moment, or with the reason it is not (the port is
   * taken).
   */
  runLocal(): Promise<LaunchResult>;
  /**
   * Opens the Studio of the runtime at `host`, `host:port` or a URL, once
   * its `/health` says it is a Difracta runtime.
   */
  connect(address: string): Promise<LaunchResult>;
  runtimes(): Promise<LaunchRuntime[]>;
  /** Calls back with the whole list whenever it changes. Returns the unsubscribe. */
  onRuntimesChanged(callback: (runtimes: LaunchRuntime[]) => void): () => void;
  remembered(): Promise<LaunchRemembered[]>;
  /** Forgets one; resolves with who is still remembered. */
  forget(address: string): Promise<LaunchRemembered[]>;
}

export const launchChannels = {
  problem: "difracta-launch:problem",
  current: "difracta-launch:current",
  runLocal: "difracta-launch:run-local",
  connect: "difracta-launch:connect",
  runtimes: "difracta-launch:runtimes",
  runtimesChanged: "difracta-launch:runtimes-changed",
  remembered: "difracta-launch:remembered",
  forget: "difracta-launch:forget",
} as const;
