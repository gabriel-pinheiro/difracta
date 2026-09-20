import { app } from "electron";
import { access } from "node:fs/promises";

import { mayClose } from "./close-prompt.ts";
import type { DesktopStateStore } from "./desktop-state.ts";
import { addressLabel } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import { RuntimeLink } from "./runtime-link.ts";
import type { RuntimeProcess } from "./runtime-process.ts";
import type { SessionStart } from "./session.ts";
import { startUpFile } from "./start-up-file.ts";
import { createStudioWindow, requestOpen } from "./studio-window.ts";

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/**
 * Local mode: fork the runtime, wait for `/health`, connect as a client, open
 * the Studio window with the document bridge.
 *
 * With `devOrigin` (`--studio-url`, development only) nothing is forked: the
 * Studio dev server there stands in, proxying to a runtime already running on
 * this computer, and everything else is the same, bridge included.
 */
export async function startLocalSession(options: {
  readonly runtime: RuntimeProcess;
  readonly state: DesktopStateStore;
  readonly preload: string;
  /** A file the OS asked for; undefined reopens the last one. */
  readonly file: string | undefined;
  readonly devOrigin?: string;
}): Promise<SessionStart> {
  const { runtime, state, devOrigin } = options;
  let lastFile = (await state.read()).lastFile;

  const started =
    devOrigin === undefined
      ? await runtime.start(
          await startUpFile({
            requested: options.file,
            last: lastFile,
            exists,
          }),
        )
      : await checkRuntime(devOrigin);
  if (!started.ok) {
    await runtime.stop();
    return started;
  }
  const origin = devOrigin ?? runtime.origin;

  const link = new RuntimeLink(origin);
  await link.ensureDocument();
  link.onPathChange((file) => {
    lastFile = file;
    app.addRecentDocument(file);
    void state.update((known) => ({ ...known, lastFile: file }));
  });

  const window = createStudioWindow({
    origin,
    preload: options.preload,
    mayClose: (closing) => mayClose(closing, link),
  });
  // The dev server's runtime was running before this file was asked for.
  if (devOrigin !== undefined && options.file !== undefined)
    requestOpen(window, options.file);

  return {
    ok: true,
    session: {
      where:
        devOrigin === undefined
          ? "This computer"
          : `Studio dev server — ${addressLabel(devOrigin)}`,
      resume: devOrigin === undefined ? { kind: "local" } : undefined,
      window,
      bridgeOrigin: origin,
      currentFile: () => link.document()?.path ?? lastFile,
      mayLeave: () => mayClose(window, link),
      end: async () => {
        link.close();
        await runtime.stop();
      },
    },
  };
}
