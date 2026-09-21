import { remoteLabel } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import { RuntimeLink } from "./runtime-link.ts";
import type { SessionStart } from "./session.ts";
import { SessionStudio } from "./studio-window.ts";

/**
 * Remote mode: no runtime of Desktop's own. The runtime at `origin` is asked
 * for `/health`, then its own Studio is loaded from it, as a browser on this
 * computer would. Its window gets the menu preload, so that Studio can show
 * its menu in the native bar, and nothing else: no document bridge, because a
 * path on this disk means nothing over there, and that Studio may be another
 * version than this Desktop. Leaving asks nothing, because the Installation
 * lives in that runtime and stays open there, as do the Outputs it shows.
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
  const studio = new SessionStudio({
    origin,
    preload: options.preload,
    link,
    title: { kind: "remote", label: where },
  });

  return {
    ok: true,
    session: {
      where,
      origin,
      resume: { kind: "remote", origin, name },
      // A runtime elsewhere is there to be looked at, so always with Studio.
      withoutStudio: false,
      get window() {
        return studio.window;
      },
      showWindow: (mayClose) => studio.show(mayClose),
      bridgeOrigin: undefined,
      currentFile: () => undefined,
      openWithoutStudio: () => Promise.resolve(false),
      // Leaving stops nothing over there, so there is nothing to ask.
      mayLeave: () => Promise.resolve(true),
      end: async () => link.close(),
    },
  };
}
