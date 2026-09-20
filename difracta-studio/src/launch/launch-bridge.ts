/**
 * What Difracta Desktop hands its launch page as `window.difractaLaunch`: the
 * choice of where Studio comes from. Desktop's side of it, and the reason it
 * is apart from `window.difractaDesktop`, is
 * `difracta-desktop/src/launch-contract.ts`; keep the two in step.
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

export type LaunchResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface DifractaLaunch {
  /** Why Desktop shows this page instead of resuming, or null. */
  problem(): Promise<string | null>;
  /** Starts a runtime on this computer; resolves once it is up, or with why it is not. */
  runLocal(): Promise<LaunchResult>;
  /** Opens the Studio of the runtime at `host`, `host:port` or a URL. */
  connect(address: string): Promise<LaunchResult>;
  runtimes(): Promise<LaunchRuntime[]>;
  /** Calls back with the whole list whenever it changes. Returns the unsubscribe. */
  onRuntimesChanged(callback: (runtimes: LaunchRuntime[]) => void): () => void;
  remembered(): Promise<LaunchRemembered[]>;
  /** Forgets one; resolves with who is still remembered. */
  forget(address: string): Promise<LaunchRemembered[]>;
}

declare global {
  interface Window {
    readonly difractaLaunch?: DifractaLaunch;
  }
}

export function launchBridge(): DifractaLaunch | undefined {
  return window.difractaLaunch;
}
