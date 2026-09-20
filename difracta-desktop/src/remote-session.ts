import { remoteLabel } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import { RuntimeLink } from "./runtime-link.ts";
import type { SessionStart } from "./session.ts";
import { createStudioWindow, followTitle } from "./studio-window.ts";

/**
 * Remote mode: no runtime of Desktop's own. The runtime at `origin` is asked
 * for `/health`, then its own Studio is loaded from it, as a browser on this
 * computer would. Its window gets the menu preload, so that Studio can show
 * its menu in the native bar, and nothing else: no document bridge, because a
 * path on this disk means nothing over there, and that Studio may be another
 * version than this Desktop. Closing asks nothing, because the Installation
 * lives in that runtime and stays open there.
 */
export async function startRemoteSession(options: {
  readonly origin: string;
  /** The Zeroconf instance name, when known. */
  readonly name: string | null;
  /** `menu-preload.cjs`. */
  readonly preload: string;
}): Promise<SessionStart> {
  const { origin, name } = options;
  const check = await checkRuntime(origin);
  if (!check.ok) return check;

  const where = remoteLabel(origin, name);
  const link = new RuntimeLink(origin);
  const window = createStudioWindow({
    origin,
    preload: options.preload,
    mayClose: () => Promise.resolve(true),
  });
  followTitle(window, link, { kind: "remote", label: where });

  return {
    ok: true,
    session: {
      where,
      origin,
      resume: { kind: "remote", origin, name },
      window,
      bridgeOrigin: undefined,
      currentFile: () => undefined,
      mayLeave: () => Promise.resolve(true),
      end: async () => link.close(),
    },
  };
}
