/**
 * Whether Desktop may quit, decided once for every way of quitting: File ▸
 * Quit, closing the Studio window, a signal, the OS session ending. They all
 * arrive as the app's `before-quit`, which comes before any window closes and
 * can be cancelled. The answer needs dialogs, so the first `before-quit` is
 * always cancelled, and the quit is asked for again once the answer is yes;
 * that second one, and any after it, passes.
 */
export class QuitGate {
  readonly #mayQuit: () => Promise<boolean>;
  #state: "closed" | "asking" | "open" = "closed";

  constructor(mayQuit: () => Promise<boolean>) {
    this.#mayQuit = mayQuit;
  }

  /** The person agreed to quit, or nothing needed asking: windows close without questions now. */
  get agreed(): boolean {
    return this.#state === "open";
  }

  /** The app's `before-quit`. `quit` asks the app to quit again. */
  beforeQuit(event: { preventDefault(): void }, quit: () => void): void {
    if (this.#state === "open") return;
    event.preventDefault();
    if (this.#state === "asking") return;
    this.#state = "asking";
    void this.#mayQuit()
      // A check that breaks must not be what keeps Desktop from quitting.
      .catch(() => true)
      .then((yes) => {
        this.#state = yes ? "open" : "closed";
        if (yes) quit();
      });
  }
}
