import { settings } from "@difracta/core";

export type RestartDecision =
  | { readonly kind: "restart"; readonly delayMs: number }
  | { readonly kind: "give-up" };

/**
 * What to do about a runtime that exited by itself, from when it was
 * restarted before. Each restart still inside
 * `settings.desktop.runtimeRestartWindowMs` doubles the wait, and
 * `runtimeRestartLimit` of them mean it is not going to stay up: a runtime
 * that dies on the Installation it reopens would otherwise be restarted for
 * ever. One that ran well for longer than the window starts from the
 * beginning.
 */
export function restartDecision(
  restartedAt: readonly number[],
  now: number,
): RestartDecision {
  const { runtimeRestartWindowMs, runtimeRestartLimit } = settings.desktop;
  const recent = restartedAt.filter(
    (at) => now - at < runtimeRestartWindowMs,
  ).length;
  return recent >= runtimeRestartLimit
    ? { kind: "give-up" }
    : {
        kind: "restart",
        delayMs: settings.desktop.runtimeRestartInitialDelayMs * 2 ** recent,
      };
}

export interface RuntimeRestartsOptions {
  /** Starts the runtime again with this file open; `{ ok: false }` when it did not come up. */
  readonly start: (
    file: string | undefined,
  ) => Promise<{ readonly ok: boolean }>;
  /** Stops whatever `start` left running. */
  readonly stop: () => Promise<void>;
  /** The path of the Installation that was open, from the last summary main saw. */
  readonly currentFile: () => string | undefined;
  /** The runtime is back and answering. */
  readonly restarted: () => void;
  readonly gaveUp: () => void;
  readonly log: (line: string) => void;
  readonly now?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
}

/**
 * Keeps a local session's runtime running: when the child exits without
 * having been asked to (a crash, the OS killing it for memory), it is started
 * again with the Installation that was open, not the one Desktop started
 * with. The runtime loads an autosave newer than the file, so unsaved work
 * comes back with it. Studio, the Output pages and main's own link all
 * reconnect by themselves, as they do to any runtime that was away.
 *
 * It is made once the first start has succeeded, and told when the session
 * ends, so neither a failed first start (the launch page reports that) nor a
 * stop Desktop asked for is ever answered with a restart.
 */
export class RuntimeRestarts {
  readonly #options: RuntimeRestartsOptions;
  readonly #restartedAt: number[] = [];
  #ended = false;
  #restarting = false;

  constructor(options: RuntimeRestartsOptions) {
    this.#options = options;
  }

  /** The session is over: nothing is restarted from here on. */
  end(): void {
    this.#ended = true;
  }

  /** The runtime child exited. `expected` says Desktop had asked it to. */
  async exited(code: number, expected: boolean): Promise<void> {
    // An exit during a restart is that restart failing, which `#restart` sees.
    if (expected || this.#ended || this.#restarting) return;
    this.#restarting = true;
    try {
      await this.#restart(`exited by itself (exit code ${String(code)})`);
    } finally {
      this.#restarting = false;
    }
  }

  async #restart(why: string): Promise<void> {
    const { log, start, stop, currentFile } = this.#options;
    const now = this.#options.now ?? Date.now;
    const wait =
      this.#options.wait ??
      ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let reason = why;

    for (;;) {
      const decision = restartDecision(this.#restartedAt, now());
      if (decision.kind === "give-up") {
        log(
          `The runtime ${reason}. It was restarted ${String(settings.desktop.runtimeRestartLimit)} times within ${String(settings.desktop.runtimeRestartWindowMs / 1000)} s, so Desktop stops trying.`,
        );
        this.#options.gaveUp();
        return;
      }
      const file = currentFile();
      log(
        `The runtime ${reason}. Restarting it in ${String(decision.delayMs)} ms with ${file ?? "no Installation"}.`,
      );
      await wait(decision.delayMs);
      if (this.#ended) return;
      this.#restartedAt.push(now());
      const started = await start(file);
      if (this.#ended || !started.ok) await stop();
      if (this.#ended) return;
      if (started.ok) {
        this.#options.restarted();
        return;
      }
      reason = "did not come up again";
    }
  }
}
