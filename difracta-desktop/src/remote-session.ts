import { mayLeaveRemote } from "./close-prompt.ts";
import type { DesktopStateStore } from "./desktop-state.ts";
import { DisplayHost } from "./display-host.ts";
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
 * version than this Desktop. Desktop is a Display Host of that runtime too
 * (`display-host.ts`), so this computer's Displays can show its Outputs.
 * Leaving stops nothing over there: the Installation lives in that runtime
 * and stays open, as do the Outputs it shows elsewhere. The one thing asked
 * is about the Outputs on this computer's Displays, which go dark.
 */
export async function startRemoteSession(options: {
  readonly origin: string;
  /** The Zeroconf instance name, when known. */
  readonly name: string | null;
  /** `menu-preload.cjs`. */
  readonly preload: string;
  readonly state: DesktopStateStore;
}): Promise<SessionStart> {
  const { origin, name, state } = options;
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

  const displays = new DisplayHost({ link, state, origin });
  await displays.start();

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
      mayLeave: (over, leaving) =>
        mayLeaveRemote({ over, leaving, showing: displays.showing }),
      end: () => {
        displays.end();
        link.close();
        return Promise.resolve();
      },
    },
  };
}
