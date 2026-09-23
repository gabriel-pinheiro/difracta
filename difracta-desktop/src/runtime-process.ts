import { settings } from "@difracta/core";
import { app, utilityProcess, type UtilityProcess } from "electron";
import { createWriteStream, type WriteStream } from "node:fs";
import { appendFile, mkdir, rename } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { finished } from "node:stream/promises";

import { waitForHealth } from "./health-wait.ts";
import { localOrigin } from "./local-origin.ts";
import {
  runtimeArguments,
  runtimeEnvironment,
  type RuntimeLocations,
} from "./runtime-launch.ts";

export type RuntimeStart =
  { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Whether nothing listens on `port` yet, found out by listening there for a moment. */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen({ port, host: settings.runtime.host }, () => {
      probe.close(() => resolve(true));
    });
  });
}

/**
 * Ends `log` once the child's pipes have closed, or after
 * `settings.desktop.runtimeLogDrainMs` when they do not: on Linux the zygote
 * that forks utility processes can keep a pipe's write end, so the read end
 * sees no end of file until the app itself exits. Resolves once the file has
 * everything.
 */
async function endLog(
  log: WriteStream,
  pipes: readonly (NodeJS.ReadableStream | null)[],
): Promise<void> {
  const drained = Promise.all(
    pipes
      .filter((pipe) => pipe !== null)
      .map((pipe) => finished(pipe).catch(() => undefined)),
  );
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    drained,
    new Promise((resolve) => {
      timer = setTimeout(resolve, settings.desktop.runtimeLogDrainMs);
    }),
  ]);
  clearTimeout(timer);
  await new Promise<void>((resolve) => log.end(resolve));
}

/**
 * The runtime Desktop runs on this machine: the same program as
 * `difracta-runtime`, bundled into one file and forked as a child.
 *
 * `utilityProcess` is Electron's `child_process.fork`: a Node process started
 * from Electron's own binary, so a packaged app needs no Node installed. A
 * child rather than code inside main, so a runtime busy with a large
 * Installation never freezes the window, and a crash in either leaves the
 * other's log readable.
 */
export class RuntimeProcess {
  readonly port: number;
  readonly origin: string;
  readonly logFile: string;
  readonly #locations: RuntimeLocations;
  #child: UtilityProcess | undefined;
  #exit: Promise<void> = Promise.resolve();
  #exitCode: number | undefined;
  /** Desktop asked the child to stop, so its exit is no accident. */
  #stopping = false;
  #exitListener: ((code: number, expected: boolean) => void) | undefined;

  constructor(options: {
    readonly port: number;
    readonly locations: RuntimeLocations;
  }) {
    this.port = options.port;
    this.origin = localOrigin(options.port);
    this.#locations = options.locations;
    this.logFile = path.join(app.getPath("logs"), "runtime.log");
  }

  /** Whether the runtime's port is free to start on; also asked before a session elsewhere is left for this computer. */
  async checkPort(): Promise<RuntimeStart> {
    return (await portIsFree(this.port))
      ? { ok: true }
      : {
          ok: false,
          reason: `Port ${String(this.port)} is already in use, probably by another Difracta runtime on this machine. Stop it, then start Difracta again.`,
        };
  }

  /** Who hears of the child's exits, and whether Desktop had asked for each; one listener, or none. */
  watchExit(
    listener: ((code: number, expected: boolean) => void) | undefined,
  ): void {
    this.#exitListener = listener;
  }

  /** A line of Desktop's own among the runtime's in `runtime.log`, and on the terminal. */
  async note(line: string): Promise<void> {
    console.log(`[Difracta Desktop] ${line}`);
    await mkdir(path.dirname(this.logFile), { recursive: true });
    await appendFile(
      this.logFile,
      `[Difracta Desktop ${new Date().toISOString()}] ${line}\n`,
    ).catch(() => undefined);
  }

  /**
   * Forks the runtime and resolves once it answers `/health`, or says why it
   * will not. `keepLog` is for starting it again after it exited by itself:
   * the log goes on, so what it said before it died stays readable.
   */
  async start(
    file: string | undefined,
    options: { readonly keepLog?: boolean } = {},
  ): Promise<RuntimeStart> {
    // Asked first, because a `/health` answered by some other runtime already
    // on the port would pass for ours.
    const port = await this.checkPort();
    if (!port.ok) return port;

    // A runtime is started again after a switch away and back.
    this.#exitCode = undefined;
    this.#stopping = false;
    const log = await this.#openLog(options.keepLog === true);
    const child = utilityProcess.fork(
      this.#locations.script,
      runtimeArguments({ port: this.port, file }),
      {
        serviceName: "Difracta Runtime",
        // Piped, so what the runtime prints lands in the log file.
        stdio: "pipe",
        env: runtimeEnvironment(process.env, this.#locations),
      },
    );
    this.#child = child;
    for (const stream of [child.stdout, child.stderr])
      stream?.on("data", (chunk: Buffer) => {
        log.write(chunk);
        // Run from a terminal, the runtime's lines show there as well.
        if (!app.isPackaged) process.stdout.write(chunk);
      });
    this.#exit = new Promise((resolve) => {
      child.once("exit", (code) => {
        this.#exitCode = code;
        this.#child = undefined;
        // Its last lines can still be in the pipes at its exit, and in the
        // stream's buffer once read: the exit counts when the file has them,
        // so a quit that waits for the stop does not lose them.
        void endLog(log, [child.stdout, child.stderr]).then(() => {
          resolve();
          this.#exitListener?.(code, this.#stopping);
        });
      });
    });

    return waitForHealth({
      url: `${this.origin}/health`,
      givenUp: () =>
        this.#exitCode === undefined
          ? undefined
          : `The runtime stopped while starting (exit code ${String(this.#exitCode)}). Its log is at ${this.logFile}.`,
    });
  }

  /**
   * Asks the runtime to stop and waits for it to exit. It flushes the autosave
   * of unsaved changes on the way out, so it is asked (a message its `main.ts`
   * listens for, which works on every OS, where a signal does not) and only
   * killed when it takes longer than `settings.desktop.runtimeStopTimeoutMs`.
   */
  async stop(): Promise<void> {
    const child = this.#child;
    if (child === undefined) return;
    this.#stopping = true;
    child.postMessage("shutdown");
    const timer = setTimeout(
      () => child.kill(),
      settings.desktop.runtimeStopTimeoutMs,
    );
    await this.#exit;
    clearTimeout(timer);
  }

  /** A fresh log per launch; the launch before it stays as `runtime.previous.log`. */
  async #openLog(keep: boolean): Promise<WriteStream> {
    await mkdir(path.dirname(this.logFile), { recursive: true });
    if (keep) return createWriteStream(this.logFile, { flags: "a" });
    await rename(
      this.logFile,
      this.logFile.replace(/\.log$/, ".previous.log"),
    ).catch(() => undefined);
    return createWriteStream(this.logFile);
  }
}
