import {
  describeDisplay,
  matchPlacements,
  sameDisplay,
  type DisplayDescription,
  type Placement,
} from "./display-mapping.ts";
import type { OfferedDisplay, ScreenDisplay } from "./screen-displays.ts";

/** One Display window: the Display it covers (`ScreenDisplay.key`), as described when it opened, and the Output in it. */
export interface DisplayWindowState {
  readonly key: number;
  readonly output: string;
  readonly display: DisplayDescription;
}

export interface DisplayPlan {
  /** The placements, those that found their Display described as it is now. */
  readonly placements: Placement[];
  /** The Display windows there should be. */
  readonly windows: DisplayWindowState[];
}

/**
 * Which Display windows this computer should have open: one per placement
 * that finds its Display connected and its Output in the open Installation.
 * A placement without either is kept and waits: the Display may be plugged
 * in again, and removing an Output can be undone.
 */
export function planDisplays(
  placements: readonly Placement[],
  screens: readonly ScreenDisplay[],
  outputs: readonly string[],
): DisplayPlan {
  const matched = matchPlacements(placements, screens);
  const found = new Map<Placement, ScreenDisplay>();
  for (const screen of screens) {
    const placement = matched.get(screen.key);
    if (placement !== undefined) found.set(placement, screen);
  }
  const settled = placements.map((entry) => {
    const screen = found.get(entry);
    return screen === undefined
      ? { entry, key: undefined }
      : {
          entry: { ...entry, display: describeDisplay(screen) },
          key: screen.key,
        };
  });
  return {
    placements: settled.map(({ entry }) => entry),
    windows: settled.flatMap(({ entry, key }) =>
      key === undefined || !outputs.includes(entry.output)
        ? []
        : [{ key, output: entry.output, display: entry.display }],
    ),
  };
}

export interface WindowChanges {
  /** Keys of windows to close. */
  readonly close: number[];
  /** Windows that stay and load another Output. */
  readonly load: DisplayWindowState[];
  readonly open: DisplayWindowState[];
}

/**
 * The way from the windows that are open to the ones wanted. A Display whose
 * description changed under its window (another resolution, another place on
 * the desktop) gets a new window on its new bounds.
 */
export function windowChanges(
  open: readonly DisplayWindowState[],
  wanted: readonly DisplayWindowState[],
): WindowChanges {
  const stays = (window: DisplayWindowState): DisplayWindowState | undefined =>
    wanted.find(
      (other) =>
        other.key === window.key && sameDisplay(other.display, window.display),
    );
  const staying = open.filter((window) => stays(window) !== undefined);
  return {
    close: open
      .filter((window) => !staying.includes(window))
      .map((window) => window.key),
    load: staying.flatMap((window) => {
      const next = stays(window);
      return next === undefined || next.output === window.output ? [] : [next];
    }),
    open: wanted.filter(
      (window) => !staying.some((other) => other.key === window.key),
    ),
  };
}

/** `showing` as the runtime is told: the offered id of each covered Display → its Output. */
export function showingReport(
  open: readonly DisplayWindowState[],
  offered: readonly OfferedDisplay[],
): Record<string, string> {
  const showing: Record<string, string> = {};
  for (const window of open) {
    const id = offered.find((entry) => entry.key === window.key)?.display.id;
    if (id !== undefined) showing[id] = window.output;
  }
  return showing;
}
