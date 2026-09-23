import type {
  DisplayAction,
  DisplayOutcome,
  DocumentSummary,
} from "@difracta/protocol";
import { powerSaveBlocker, screen, type BrowserWindow } from "electron";
import { hostname } from "node:os";

import { withDisplayMapping, type DesktopStateStore } from "./desktop-state.ts";
import {
  carriedOver,
  describeDisplay,
  redescribed,
  samePlacements,
  withoutPlacement,
  withPlacement,
  type DisplayMappings,
  type Placement,
} from "./display-mapping.ts";
import {
  planDisplays,
  showingReport,
  windowChanges,
  type DisplayWindowState,
} from "./display-plan.ts";
import { openDisplayWindow, outputPageUrl } from "./display-window.ts";
import type { RuntimeLink } from "./runtime-link.ts";
import {
  offerDisplays,
  type OfferedDisplay,
  type ScreenDisplay,
} from "./screen-displays.ts";

interface OpenWindow extends DisplayWindowState {
  readonly window: BrowserWindow;
}

function readScreens(): ScreenDisplay[] {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((display) => ({
    key: display.id,
    label: display.label,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
    primary: display.id === primary,
    internal: display.internal,
  }));
}

/**
 * Desktop as a Display Host, for as long as a session lasts: it offers this
 * computer's Displays over main's link, opens and closes Display windows
 * (`display-window.ts`) when the runtime asks, and says what each Display
 * shows after every change.
 *
 * Everything that happens (a request, Esc on a Display window, a Display
 * plugged or unplugged, another Installation) changes the placements or what
 * is known of the Displays and the Installation, and then `#settle` makes
 * the windows match (`display-plan.ts`). So an unplugged Display loses its
 * window rather than have the operating system move it to another, and gets
 * it back when it returns; and the placements, kept per Installation in
 * Desktop's state, light the Displays again at the next start, with or
 * without a Studio window. Only `hide` and Esc forget a placement.
 */
export class DisplayHost {
  readonly #link: RuntimeLink;
  readonly #state: DesktopStateStore;
  readonly #origin: string;
  #mappings: DisplayMappings = {};
  #screens: ScreenDisplay[] = [];
  #offered: OfferedDisplay[] = [];
  #installation: string | null = null;
  #outputs: string[] = [];
  #placements: Placement[] = [];
  readonly #windows = new Map<number, OpenWindow>();
  #blocker: number | undefined;
  /** Between `start` and `end`. */
  #offering = false;
  #stop: (() => void) | undefined;

  constructor(options: {
    readonly link: RuntimeLink;
    readonly state: DesktopStateStore;
    /** Where the Output page is loaded from: the session's runtime. */
    readonly origin: string;
  }) {
    this.#link = options.link;
    this.#state = options.state;
    this.#origin = options.origin;
  }

  /** How many Display windows are open. */
  get showing(): number {
    return this.#windows.size;
  }

  async start(): Promise<void> {
    this.#mappings = (await this.#state.read()).displayMappings ?? {};
    this.#screens = readScreens();
    this.#offering = true;
    this.#link.onDisplayAction((action) => this.#act(action));

    const changed = (): void => this.#screensChanged();
    screen.on("display-added", changed);
    screen.on("display-removed", changed);
    screen.on("display-metrics-changed", changed);
    const unfollow = this.#link.onDocumentChange((summary) =>
      this.#documentChanged(summary),
    );
    this.#stop = () => {
      screen.off("display-added", changed);
      screen.off("display-removed", changed);
      screen.off("display-metrics-changed", changed);
      unfollow();
    };
  }

  /** Steps down and closes the Display windows; the placements stay for the next start. */
  end(): void {
    this.#offering = false;
    this.#stop?.();
    this.#stop = undefined;
    this.#link.withdrawDisplays();
    for (const key of [...this.#windows.keys()]) this.#close(key);
    this.#power();
  }

  #act(action: DisplayAction): DisplayOutcome {
    const offered = this.#offered.find(
      (entry) => entry.display.id === action.display,
    );
    const screenDisplay = this.#screens.find(
      (entry) => entry.key === offered?.key,
    );
    if (screenDisplay === undefined)
      return {
        ok: false,
        error: `This computer has no Display ${action.display}.`,
      };
    const display = describeDisplay(screenDisplay);
    if (action.action === "hide") {
      this.#place(withoutPlacement(this.#placements, display));
      return { ok: true };
    }
    if (this.#installation === null)
      return { ok: false, error: "No Installation is open." };
    // The runtime checked the Output; its summary may be a moment behind here.
    if (!this.#outputs.includes(action.output))
      this.#outputs.push(action.output);
    this.#place(withPlacement(this.#placements, action.output, display));
    if (this.#windows.get(screenDisplay.key)?.output === action.output)
      return { ok: true };
    this.#place(withoutPlacement(this.#placements, display));
    return { ok: false, error: "The window could not be opened." };
  }

  #place(placements: Placement[]): void {
    this.#placements = placements;
    this.#settle();
  }

  /**
   * A null summary is left alone: the runtime is between two Installations
   * or being started again, and the Displays stay lit meanwhile.
   */
  #documentChanged(summary: DocumentSummary | null): void {
    // Nothing open is said once at start-up too: the Displays are offered all the same.
    if (summary === null) {
      if (this.#installation === null) this.#settle();
      return;
    }
    const outputs = summary.outputs.map((output) => output.id);
    if (summary.id !== this.#installation) {
      this.#placements = carriedOver(
        this.#placements,
        this.#mappings[summary.id] ?? [],
        outputs,
      );
      this.#installation = summary.id;
    }
    this.#outputs = outputs;
    this.#settle();
  }

  #screensChanged(): void {
    this.#screens = readScreens();
    // A covered Display that changed keeps its placement whatever it is called.
    for (const open of this.#windows.values()) {
      const now = this.#screens.find((entry) => entry.key === open.key);
      if (now !== undefined)
        this.#placements = redescribed(
          this.#placements,
          open.display,
          describeDisplay(now),
        );
    }
    this.#settle();
  }

  /** Makes the windows, the saved placements and the runtime's picture match what is wanted now. */
  #settle(): void {
    this.#offered = offerDisplays(this.#screens);
    const plan = planDisplays(this.#placements, this.#screens, this.#outputs);
    this.#placements = plan.placements;
    const changes = windowChanges([...this.#windows.values()], plan.windows);
    for (const key of changes.close) this.#close(key);
    for (const next of changes.load) {
      const open = this.#windows.get(next.key);
      if (open === undefined) continue;
      this.#windows.set(next.key, { ...next, window: open.window });
      void open.window
        .loadURL(outputPageUrl(this.#origin, next.output))
        .catch(() => undefined);
    }
    for (const next of changes.open) this.#open(next);
    this.#power();
    this.#remember();
    this.#report();
  }

  #open(next: DisplayWindowState): void {
    let window: BrowserWindow;
    try {
      window = openDisplayWindow({
        origin: this.#origin,
        output: next.output,
        display: next.display,
        onEscape: () =>
          this.#place(withoutPlacement(this.#placements, next.display)),
      });
    } catch {
      return;
    }
    this.#windows.set(next.key, { ...next, window });
    // Closed by something other than this host (the quit, the session left,
    // the window manager): the placement stays, the runtime hears of it.
    window.on("closed", () => {
      if (this.#windows.get(next.key)?.window !== window) return;
      this.#windows.delete(next.key);
      this.#power();
      this.#report();
    });
  }

  #close(key: number): void {
    const open = this.#windows.get(key);
    if (open === undefined) return;
    this.#windows.delete(key);
    if (!open.window.isDestroyed()) open.window.destroy();
  }

  /** Keeps the Displays awake while a window covers one. */
  #power(): void {
    if (this.#windows.size > 0)
      this.#blocker ??= powerSaveBlocker.start("prevent-display-sleep");
    else if (this.#blocker !== undefined) {
      powerSaveBlocker.stop(this.#blocker);
      this.#blocker = undefined;
    }
  }

  #remember(): void {
    const id = this.#installation;
    if (id === null) return;
    if (samePlacements(this.#mappings[id] ?? [], this.#placements)) return;
    const placements = this.#placements;
    this.#mappings = { ...this.#mappings, [id]: placements };
    void this.#state
      .update((state) => withDisplayMapping(state, id, placements))
      .catch(() => undefined);
  }

  #report(): void {
    if (!this.#offering) return;
    this.#link.offerDisplays({
      // The protocol's limits on a host's name.
      name: hostname().trim().slice(0, 120) || "Difracta Desktop",
      displays: this.#offered.map((entry) => entry.display),
      showing: showingReport([...this.#windows.values()], this.#offered),
    });
  }
}
