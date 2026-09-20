import { settings } from "@difracta/core";

import { addressLabel } from "./runtime-address.ts";

/** What `/health` says about a runtime, as far as Desktop reads it. */
export interface RuntimeHealth {
  readonly version: string | null;
}

/** A `/health` answer when it is a Difracta runtime's, not some other server's on the port. */
export async function readHealth(
  response: Response,
): Promise<RuntimeHealth | undefined> {
  if (!response.ok) return undefined;
  const body = (await response.json()) as unknown;
  if (
    typeof body !== "object" ||
    body === null ||
    !("name" in body) ||
    body.name !== "Difracta Runtime"
  )
    return undefined;
  return {
    version:
      "version" in body && typeof body.version === "string"
        ? body.version
        : null,
  };
}

export type RuntimeCheck =
  | { readonly ok: true; readonly health: RuntimeHealth }
  | { readonly ok: false; readonly reason: string };

/**
 * Asks a runtime somewhere else for `/health` once, before a window is pointed
 * at it: a wrong address would otherwise show as Chromium's error page, and
 * any web server at all would be loaded as if it were Studio.
 */
export async function checkRuntime(
  origin: string,
  options: {
    readonly timeoutMs?: number;
    // Injected by the tests; the default is the real one.
    readonly fetch?: (url: string, init: RequestInit) => Promise<Response>;
  } = {},
): Promise<RuntimeCheck> {
  const fetchHealth = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? settings.desktop.remoteCheckTimeoutMs;
  const where = addressLabel(origin);
  try {
    const health = await readHealth(
      await fetchHealth(`${origin}/health`, {
        signal: AbortSignal.timeout(timeoutMs),
      }),
    );
    return health === undefined
      ? {
          ok: false,
          reason: `${where} answered, but not as a Difracta Runtime.`,
        }
      : { ok: true, health };
  } catch {
    return {
      ok: false,
      reason: `No Runtime answered at ${where}. Check the address, that the Runtime is running, and that this computer is on its network.`,
    };
  }
}
