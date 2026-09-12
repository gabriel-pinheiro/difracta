export interface AutosaveOptions {
  /** How long after the last change the write happens. */
  readonly delayMs: number;
  /** A run of changes never postpones the write longer than this. */
  readonly maxWaitMs: number;
  /** Writes the sidecar; resolves true when it landed. Must not reject. */
  readonly write: () => Promise<boolean>;
}

/**
 * When the autosave sidecar of one document is written. Each change restarts
 * the delay, so the sidecar trails the document by at most that; a run of
 * changes longer than the max wait writes anyway, so an hour of OSC input
 * still leaves a fresh sidecar behind. Writes run one after another, and
 * `flush` writes only when a change is still unwritten.
 */
export class Autosave {
  readonly #options: AutosaveOptions;
  #timer: NodeJS.Timeout | undefined;
  /** When the pending write is due at the latest, whatever else changes. */
  #deadline: number | undefined;
  /** Changes seen, and how many the newest write holds. */
  #changes = 0;
  #written = -1;
  #writing: Promise<void> = Promise.resolve();

  constructor(options: AutosaveOptions) {
    this.#options = options;
  }

  /** A change landed: a write is due within the delay. */
  changed(): void {
    this.#changes += 1;
    this.schedule();
  }

  /** Restarts the delay, capped so the deadline set by the first change holds. */
  schedule(): void {
    const now = Date.now();
    this.#deadline ??= now + this.#options.maxWaitMs;
    const delay = Math.min(
      this.#options.delayMs,
      Math.max(0, this.#deadline - now),
    );
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    const timer = setTimeout(() => {
      void this.flush();
    }, delay);
    timer.unref();
    this.#timer = timer;
  }

  /** Drops the pending write; a later change arms it again. */
  cancel(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#deadline = undefined;
  }

  /** Waits for a write in flight without starting one. */
  settle(): Promise<void> {
    return this.#writing;
  }

  /** Writes now unless the newest write already holds every change. */
  flush(): Promise<void> {
    this.cancel();
    this.#writing = this.#writing.then(() => this.#run());
    return this.#writing;
  }

  async #run(): Promise<void> {
    if (this.#written === this.#changes) return;
    const changes = this.#changes;
    if (await this.#options.write()) this.#written = changes;
  }
}
