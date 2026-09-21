/**
 * Difracta Desktop's main process: the Node side of the Electron app. It owns
 * what a web page cannot: the runtime child process, windows, native dialogs
 * and the app's life cycle. Each concern has its own file; this one is the
 * order things happen in.
 *
 *   launch → single-instance lock → what to start with (`start-up-mode.ts`)
 *     a file, or local last time → fork the runtime → wait for /health
 *                                  → connect as a client → Studio window,
 *                                  unless started without it (`--no-studio`)
 *     remote last time           → ask its /health → connect → its Studio
 *     first launch, or a failure → the launch page, which starts one of those
 *   quit   → unsaved changes? → Outputs showing? → windows close
 *          → runtime stops → exit
 *
 * `desktop-modes.ts` holds the moves between those; File ▸ Connect to... opens
 * the launch page again, over the session. `application-menu.ts` is the native
 * menu bar, which in Desktop shows Studio's own File and Edit items.
 */
import { watchRuntimes } from "@difracta/client/discovery";
import { app, nativeTheme } from "electron";
import { hostname, networkInterfaces } from "node:os";

import { DesktopModes } from "./desktop-modes.ts";
import { DesktopStateStore } from "./desktop-state.ts";
import { LaunchRuntimes } from "./launch-runtimes.ts";
import { registerLaunchScheme, serveLaunchScheme } from "./launch-window.ts";
import { runtimeLocations, runtimePort } from "./runtime-launch.ts";
import { RuntimeProcess } from "./runtime-process.ts";
import { documentFileFromArgv } from "./start-up-file.ts";
import {
  ignoredNoStudio,
  noStudioFromArgv,
  startUpMode,
  studioUrlFromArgv,
} from "./start-up-mode.ts";

// `scripts/build.mjs` puts everything the app runs from next to this file.
const distDir = import.meta.dirname;

let modes: DesktopModes | undefined;
/** A file the OS asked for before main was ready to open anything. */
let requestedFile = documentFileFromArgv(process.argv, process.cwd());

function openFromOs(file: string): void {
  if (modes === undefined) requestedFile = file;
  else modes.openFromOs(file);
}

async function start(): Promise<void> {
  const locations = runtimeLocations(distDir);
  serveLaunchScheme(locations.studioDist);
  const state = new DesktopStateStore(app.getPath("userData"));
  const runtime = new RuntimeProcess({
    port: runtimePort(process.env),
    locations,
  });
  const runtimes = new LaunchRuntimes({
    // `DIFRACTA_NO_DISCOVERY` keeps Desktop off multicast as it does the runtime.
    watch:
      process.env.DIFRACTA_NO_DISCOVERY === "1"
        ? () => () => undefined
        : watchRuntimes,
    machine: () => ({
      hostname: hostname(),
      addresses: Object.values(networkInterfaces()).flatMap((addresses) =>
        (addresses ?? []).map((entry) => entry.address),
      ),
    }),
  });
  modes = new DesktopModes({ distDir, runtime, state, runtimes });

  // Every quit, whatever asked for it (the menu, the Studio window closing, a
  // signal, the OS session ending), asks the session's questions first.
  app.on("before-quit", (event) => modes?.beforeQuit(event));
  // The last thing before exit, after every window has closed: stop the
  // runtime and wait for it, then quit for real. With no runtime to stop
  // (the launch page, remote mode) that wait is over at once, still inside
  // the quit being cancelled, where Electron ignores a new one; hence
  // `setImmediate`.
  let ended = false;
  app.on("will-quit", (event) => {
    if (ended) return;
    event.preventDefault();
    void modes?.end().finally(() => {
      ended = true;
      setImmediate(() => app.quit());
    });
  });
  // Quitting is decided where windows close (`studio-visit.ts`, the launch
  // page in `desktop-modes.ts`): between a session and the launch page there
  // is a moment with no window at all, a session started with `--no-studio`
  // has none for as long as it likes, and Electron's default would take
  // either for the end.
  app.on("window-all-closed", () => undefined);

  const file = requestedFile;
  requestedFile = undefined;
  const known = await state.read();
  const noStudioFlag = noStudioFromArgv(process.argv);
  const mode = startUpMode({
    requestedFile: file,
    studioUrl: studioUrlFromArgv(process.argv),
    lastMode: known.lastMode,
    noStudioFlag,
    startWithoutStudio: known.startWithoutStudio === true,
  });
  if (ignoredNoStudio(mode, noStudioFlag))
    console.log(
      "[Difracta Desktop] --no-studio ignored: only a Runtime on this computer runs without the Studio window.",
    );
  await modes.startUp(mode);
}

// A custom scheme has to be declared before the app is ready.
registerLaunchScheme();

// Studio is dark only, and in Desktop the native menu bar is Studio's menu, so
// the bar and the native dialogs are dark too, whatever the OS theme is.
nativeTheme.themeSource = "dark";

// One Desktop per machine: the runtime's port is fixed, so a second launch
// could not start one. The second instance gets no lock and quits, and
// Electron hands its command line to the first as "second-instance".
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv, workingDirectory) => {
    const file = documentFileFromArgv(argv, workingDirectory);
    if (file !== undefined) openFromOs(file);
    // Started again by hand: the way to Studio when Desktop runs without its
    // window. Started again with `--no-studio` (a login entry firing twice)
    // there is nobody to show anything to.
    else if (!noStudioFromArgv(argv)) modes?.focus();
  });
  // macOS: a click on the Dock icon, which is all a Desktop without windows shows there.
  app.on("activate", () => modes?.focus());
  // macOS opens a document with this event instead of a command line.
  app.on("open-file", (event, file) => {
    event.preventDefault();
    openFromOs(file);
  });
  void app.whenReady().then(start);
}
