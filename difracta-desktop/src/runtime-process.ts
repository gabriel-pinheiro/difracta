import { settings } from "@difracta/core";
import { app, utilityProcess, type UtilityProcess } from "electron";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

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

  constructor(options: {
    readonly port: number;
    readonly locations: RuntimeLocations;
  }) {
    this.port = options.port;
    this.origin = localOrigin(options.port);
    this.#locations = options.locations;
    this.logFile = path.join(app.getPath("logs"), "runtime.log");
  }

  /** Forks the runtime and resolves once it answers `/health`, or says why it will not. */
  async start(file: string | undefined): Promise<RuntimeStart> {
    // Asked first, because a `/health` answered by some other runtime already
    // on the port would pass for ours.
    if (!(await portIsFree(this.port)))
      return {
        ok: false,
        reason: `Port ${String(this.port)} is already in use, probably by another Difracta runtime on this machine. Stop it, then start Difracta again.`,
      };

    // A runtime is started again after a switch away and back.
    this.#exitCode = undefined;
    const log = await this.#openLog();
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
        log.end();
        resolve();
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
    child.postMessage("shutdown");
    const timer = setTimeout(
      () => child.kill(),
      settings.desktop.runtimeStopTimeoutMs,
    );
    await this.#exit;
    clearTimeout(timer);
  }

  /** A fresh log per launch; the launch before it stays as `runtime.previous.log`. */
  async #openLog(): Promise<WriteStream> {
    await mkdir(path.dirname(this.logFile), { recursive: true });
    await rename(
      this.logFile,
      this.logFile.replace(/\.log$/, ".previous.log"),
    ).catch(() => undefined);
    return createWriteStream(this.logFile);
  }
}
