import { settings } from "@difracta/core";

export interface HealthWaitOptions {
  /** The runtime's `/health` URL. */
  readonly url: string;
  /** Why waiting is pointless (the runtime exited), or undefined to keep going. */
  readonly givenUp?: () => string | undefined;
  readonly timeoutMs?: number;
  // Injected by the tests; the defaults are the real ones.
  readonly fetch?: (url: string) => Promise<Response>;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export type HealthWaitResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Whether a `/health` answer is a Difracta runtime's, not some other server's on the port. */
async function isRuntime(response: Response): Promise<boolean> {
  if (!response.ok) return false;
  const body = (await response.json()) as unknown;
  return (
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    body.name === "Difracta Runtime"
  );
}

/**
 * Asks `/health` until the runtime answers: a forked runtime takes a moment to
 * open its file and listen, and a window loaded before that shows an error
 * page. Attempts start close together and back off, so a fast start is not
 * kept waiting and a slow one is not hammered.
 */
export async function waitForHealth(
  options: HealthWaitOptions,
): Promise<HealthWaitResult> {
  const fetchHealth = options.fetch ?? ((url: string) => fetch(url));
  const now = options.now ?? (() => Date.now());
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = options.timeoutMs ?? settings.desktop.runtimeStartTimeoutMs;

  const startedAt = now();
  let delay: number = settings.desktop.healthPollInitialMs;
  for (;;) {
    const reason = options.givenUp?.();
    if (reason !== undefined) return { ok: false, reason };
    try {
      if (await isRuntime(await fetchHealth(options.url))) return { ok: true };
    } catch {
      // Not listening yet.
    }
    if (now() - startedAt >= timeoutMs)
      return {
        ok: false,
        reason: `The runtime did not answer within ${String(Math.round(timeoutMs / 1000))} seconds.`,
      };
    await sleep(delay);
    delay = Math.min(delay * 2, settings.desktop.healthPollMaxMs);
  }
}
