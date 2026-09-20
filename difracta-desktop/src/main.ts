/**
 * Difracta Desktop's main process: the Node side of the Electron app. It owns
 * what a web page cannot: the runtime child process, windows, native dialogs
 * and the app's life cycle. Each concern has its own file; this one is the
 * order things happen in.
 *
 *   launch → single-instance lock → pick the start-up file → fork the runtime
 *   → wait for /health → connect as a client → Studio window
 *   quit   → unsaved-changes prompt → windows close → runtime stops → exit
 */
import { app, dialog, type BrowserWindow } from "electron";
import { access } from "node:fs/promises";
import path from "node:path";

import { installApplicationMenu } from "./application-menu.ts";
import { mayClose } from "./close-prompt.ts";
import { registerFileDialogs } from "./file-dialogs.ts";
import { LastFileStore } from "./last-file.ts";
import { runtimeLocations, runtimePort } from "./runtime-launch.ts";
import { RuntimeLink } from "./runtime-link.ts";
import { RuntimeProcess } from "./runtime-process.ts";
import { documentFileFromArgv, startUpFile } from "./start-up-file.ts";
import { createStudioWindow, requestOpen } from "./studio-window.ts";

// `scripts/build.mjs` puts everything the app runs from next to this file.
const distDir = import.meta.dirname;

let studio: BrowserWindow | undefined;
/** A file the OS asked for before there was a window to hand it to. */
let requestedFile = documentFileFromArgv(process.argv, process.cwd());

/** A file the OS wants open: Studio's own Open when it is up, else the start-up file. */
function openFromOs(file: string): void {
  if (studio === undefined) requestedFile = file;
  else requestOpen(studio, file);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function start(): Promise<void> {
  const lastFile = new LastFileStore(app.getPath("userData"));
  const runtime = new RuntimeProcess({
    port: runtimePort(process.env),
    locations: runtimeLocations(distDir),
  });
  installApplicationMenu({ runtimeLog: runtime.logFile });

  let remembered = await lastFile.read();
  const started = await runtime.start(
    await startUpFile({ requested: requestedFile, last: remembered, exists }),
  );
  if (!started.ok) {
    dialog.showErrorBox("Difracta could not start", started.reason);
    await runtime.stop();
    app.exit(1);
    return;
  }

  const link = new RuntimeLink(runtime.port);
  await link.ensureDocument();
  link.onPathChange((file) => {
    remembered = file;
    app.addRecentDocument(file);
    void lastFile.write(file);
  });

  registerFileDialogs({
    origin: runtime.origin,
    window: () => studio,
    currentFile: () => link.document()?.path ?? remembered,
  });
  studio = createStudioWindow({
    origin: runtime.origin,
    preload: path.join(distDir, "preload.cjs"),
    mayClose: (window) => mayClose(window, link),
  });
  // Without its Studio window the runtime would keep serving with nothing to
  // show for it, so closing Studio quits, on macOS too.
  studio.on("closed", () => {
    studio = undefined;
    app.quit();
  });

  // The last thing before exit, after every window has closed: stop the
  // runtime and wait for it, then quit for real.
  let runtimeStopped = false;
  app.on("will-quit", (event) => {
    if (runtimeStopped) return;
    event.preventDefault();
    link.close();
    void runtime.stop().finally(() => {
      runtimeStopped = true;
      app.quit();
    });
  });
}

// One Desktop per machine: the runtime's port is fixed, so a second launch
// could not start one. The second instance gets no lock and quits, and
// Electron hands its command line to the first as "second-instance".
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    const file = documentFileFromArgv(argv, workingDirectory);
    if (file !== undefined) openFromOs(file);
    else if (studio !== undefined) {
      if (studio.isMinimized()) studio.restore();
      studio.focus();
    }
  });
  // macOS opens a document with this event instead of a command line.
  app.on("open-file", (event, file) => {
    event.preventDefault();
    openFromOs(file);
  });
  void app.whenReady().then(start);
}
