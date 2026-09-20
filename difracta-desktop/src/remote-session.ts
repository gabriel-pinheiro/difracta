import { remoteLabel } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import { RuntimeLink } from "./runtime-link.ts";
import type { SessionStart } from "./session.ts";
import { createStudioWindow } from "./studio-window.ts";

/**
 * Remote mode: no runtime of Desktop's own. The runtime at `origin` is asked
 * for `/health`, then its own Studio is loaded from it, as a browser on this
 * computer would. The window has no preload, so no bridge: a path on this
 * disk means nothing over there, and that Studio may be another version than
 * this Desktop. Closing asks nothing, because the Installation lives in that
 * runtime and stays open there.
 */
export async function startRemoteSession(options: {
  readonly origin: string;
  /** The Zeroconf instance name, when known. */
  readonly name: string | null;
}): Promise<SessionStart> {
  const { origin, name } = options;
  const check = await checkRuntime(origin);
  if (!check.ok) return check;

  const where = remoteLabel(origin, name);
  const link = new RuntimeLink(origin);
  const window = createStudioWindow({
    origin,
    preload: undefined,
    mayClose: () => Promise.resolve(true),
  });
  // The title says which runtime this is, which the page cannot know: main
  // writes it from its own link's document summary instead of taking the
  // page's.
  window.on("page-title-updated", (event) => event.preventDefault());
  link.onDocumentChange((summary) => {
    if (window.isDestroyed()) return;
    const document =
      summary === null ? "" : `${summary.name}${summary.dirty ? "*" : ""} – `;
    window.setTitle(`${document}${where} – Difracta`);
  });

  return {
    ok: true,
    session: {
      where,
      resume: { kind: "remote", origin, name },
      window,
      bridgeOrigin: undefined,
      currentFile: () => undefined,
      mayLeave: () => Promise.resolve(true),
      end: async () => link.close(),
    },
  };
}
