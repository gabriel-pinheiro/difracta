import { settings } from "@difracta/core";
import { app, dialog, type BrowserWindow } from "electron";
import { access } from "node:fs/promises";
import { homedir } from "node:os";

import { mayLeaveLocal } from "./close-prompt.ts";
import type { DesktopStateStore } from "./desktop-state.ts";
import { DisplayHost } from "./display-host.ts";
import { addressLabel } from "./runtime-address.ts";
import { checkRuntime } from "./runtime-health.ts";
import { RuntimeLink } from "./runtime-link.ts";
import type { RuntimeProcess } from "./runtime-process.ts";
import { RuntimeRestarts } from "./runtime-restarts.ts";
import type { SessionStart } from "./session.ts";
import { startUpFile } from "./start-up-file.ts";
import { requestOpen, SessionStudio } from "./studio-window.ts";

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

/** Said once, when the runtime will not stay up; Studio's own "disconnected" stays as it is behind it. */
function sayRuntimeGaveUp(
  over: BrowserWindow | undefined,
  logFile: string,
): void {
  const options = {
    type: "error" as const,
    message: "The Runtime on this computer keeps stopping.",
    detail: `Difracta started it again ${String(settings.desktop.runtimeRestartLimit)} times and has stopped trying. Its log is at ${logFile}. Quit Difracta and start it again to try once more.`,
    buttons: ["OK"],
  };
  void (over === undefined
    ? dialog.showMessageBox(options)
    : dialog.showMessageBox(over, options));
}

/**
 * Local mode: fork the runtime, wait for `/health`, connect as a client. The
 * Studio window it then gets has the document bridge and the menu bridge, and
 * Desktop becomes a Display Host of that runtime (`display-host.ts`).
 * From here on the runtime is kept running (`runtime-restarts.ts`) until the
 * session ends.
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
  /** False for `--no-studio` and its setting. */
  readonly studioWindow: boolean;
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
  let pending = options.file;

  const link = new RuntimeLink(origin);
  // A runtime that dies this early is still a start that failed, which the
  // launch page reports; the link alone would wait for it for ever.
  const died = new Promise<never>((_resolve, reject) => {
    runtime.watchExit((code) => {
      reject(
        new Error(
          `The runtime stopped while starting (exit code ${String(code)}). Its log is at ${runtime.logFile}.`,
        ),
      );
    });
  });
  try {
    await Promise.race([link.ensureDocument(), died]);
  } catch (error) {
    runtime.watchExit(undefined);
    link.close();
    await runtime.stop();
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  runtime.watchExit(undefined);
  link.onPathChange((file) => {
    lastFile = file;
    app.addRecentDocument(file);
    void state.update((known) => ({ ...known, lastFile: file }));
  });

  const studio = new SessionStudio({
    origin,
    preload: options.preload,
    link,
    title: { kind: "local", home: homedir() },
  });

  // This computer's Displays are offered from here on, Studio window or not,
  // and the ones that showed this Installation's Outputs light up again.
  const displays = new DisplayHost({ link, state, origin });
  await displays.start();

  const restarts = new RuntimeRestarts({
    // The Installation that is open now; one never saved has no path.
    currentFile: () => link.document()?.path ?? undefined,
    start: (file) => runtime.start(file, { keepLog: true }),
    stop: () => runtime.stop(),
    // Main's link finds the new runtime by itself; one that came up with
    // nothing open gets an Installation, as at start-up.
    restarted: () => void link.ensureDocument().catch(() => undefined),
    gaveUp: () => sayRuntimeGaveUp(studio.window, runtime.logFile),
    log: (line) => void runtime.note(line),
  });
  if (devOrigin === undefined)
    runtime.watchExit((code, expected) => void restarts.exited(code, expected));

  return {
    ok: true,
    session: {
      where:
        devOrigin === undefined
          ? "This computer"
          : `Studio dev server (${addressLabel(devOrigin)})`,
      origin,
      resume: devOrigin === undefined ? { kind: "local" } : undefined,
      withoutStudio: !options.studioWindow,
      get window() {
        return studio.window;
      },
      showWindow: (mayClose) => {
        const open = studio.window;
        const window = studio.show(mayClose);
        // The dev server's runtime was running before this file was asked for.
        if (
          open === undefined &&
          devOrigin !== undefined &&
          pending !== undefined
        )
          requestOpen(window, pending);
        pending = undefined;
        return window;
      },
      bridgeOrigin: origin,
      currentFile: () => link.document()?.path ?? lastFile,
      openWithoutStudio: async (file) => {
        // Unsaved changes are never dropped for a file that arrived: Studio's
        // own Open asks about them, so the file goes there with its window.
        if (link.document()?.dirty === true) return false;
        return link.open(file).then(
          () => true,
          () => false,
        );
      },
      mayLeave: (over, leaving) =>
        mayLeaveLocal({
          link,
          over,
          leaving,
          attended: over !== undefined,
          showing: displays.showing,
        }),
      end: async () => {
        displays.end();
        restarts.end();
        runtime.watchExit(undefined);
        link.close();
        await runtime.stop();
      },
    },
  };
}
