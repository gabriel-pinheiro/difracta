import { z } from "zod";

import type { ScreenDisplay } from "./screen-displays.ts";

/**
 * What tells a Display apart after a restart, when the ids Electron and this
 * Display Host gave it are gone: the operating system's name for it (often
 * the model, sometimes empty), whether it is built into the machine, and
 * where it sits on the desktop.
 */
const DisplayDescriptionSchema = z.object({
  label: z.string(),
  internal: z.boolean(),
  bounds: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
});
export type DisplayDescription = z.infer<typeof DisplayDescriptionSchema>;

/** One Output a person put on one Display of this computer. */
const PlacementSchema = z.object({
  output: z.string().min(1),
  display: DisplayDescriptionSchema,
});
export type Placement = z.infer<typeof PlacementSchema>;

/**
 * Installation id → its placements on this computer, a Display in at most
 * one of them. Which Display shows which Output belongs to the machine, not
 * to the Installation, so it is kept in Desktop's state and not in the file.
 */
export const DisplayMappingsSchema = z.record(
  z.string(),
  z.array(PlacementSchema),
);
export type DisplayMappings = z.infer<typeof DisplayMappingsSchema>;

export function describeDisplay(screen: ScreenDisplay): DisplayDescription {
  return {
    label: screen.label.trim(),
    internal: screen.internal,
    bounds: { ...screen.bounds },
  };
}

function sameBounds(a: DisplayDescription, b: DisplayDescription): boolean {
  return (
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  );
}

export function sameDisplay(
  a: DisplayDescription,
  b: DisplayDescription,
): boolean {
  return a.label === b.label && a.internal === b.internal && sameBounds(a, b);
}

export function samePlacements(
  a: readonly Placement[],
  b: readonly Placement[],
): boolean {
  return (
    a.length === b.length &&
    a.every((entry, index) => {
      const other = b[index];
      return (
        other?.output === entry.output &&
        sameDisplay(other.display, entry.display)
      );
    })
  );
}

/** `output` on the Display described, in place of what that Display had. */
export function withPlacement(
  placements: readonly Placement[],
  output: string,
  display: DisplayDescription,
): Placement[] {
  return [...withoutPlacement(placements, display), { output, display }];
}

export function withoutPlacement(
  placements: readonly Placement[],
  display: DisplayDescription,
): Placement[] {
  return placements.filter((entry) => !sameDisplay(entry.display, display));
}

/** A Display whose description changed under a placement (another resolution, moved on the desktop) keeps it. */
export function redescribed(
  placements: readonly Placement[],
  before: DisplayDescription,
  after: DisplayDescription,
): Placement[] {
  return placements.map((entry) =>
    sameDisplay(entry.display, before) ? { ...entry, display: after } : entry,
  );
}

/**
 * What another Installation starts with: its own placements, and those of
 * the Installation before it whose Output it has too (a copy of the same
 * show), so a Display that can stay lit does. Its own win a Display.
 */
export function carriedOver(
  before: readonly Placement[],
  own: readonly Placement[],
  outputs: readonly string[],
): Placement[] {
  return own.reduce(
    (all, entry) => withPlacement(all, entry.output, entry.display),
    before.filter((entry) => outputs.includes(entry.output)),
  );
}

function distance(a: DisplayDescription, b: DisplayDescription): number {
  return Math.hypot(a.bounds.x - b.bounds.x, a.bounds.y - b.bounds.y);
}

function sameSize(a: DisplayDescription, b: DisplayDescription): boolean {
  return (
    a.bounds.width === b.bounds.width && a.bounds.height === b.bounds.height
  );
}

/**
 * Finds each placement's Display among the ones connected now. A Display is
 * taken once, and the surest matches choose first:
 *
 *   1. the same label in the same place;
 *   2. the same label elsewhere (the Displays were rearranged, or its
 *      resolution changed): the one of the same size first, then the nearest;
 *   3. exactly the same place, when one of the two has no label to compare
 *      (an operating system that names its Displays only some of the time).
 *
 * A Display built into the machine never stands in for one that is not, nor
 * the other way round. A placement that finds none stays without: its
 * Display is unplugged, and an Output must never land on whatever Display
 * happens to be left, such as the laptop's own, which takes an unplugged
 * projector's place on the desktop. Returns `screen.key → placement`.
 */
export function matchPlacements(
  placements: readonly Placement[],
  screens: readonly ScreenDisplay[],
): Map<number, Placement> {
  const matched = new Map<number, Placement>();
  const candidates = screens.map((screen) => ({
    key: screen.key,
    ...describeDisplay(screen),
  }));
  let waiting = [...placements];
  const free = (wanted: DisplayDescription): typeof candidates =>
    candidates.filter(
      (screen) =>
        !matched.has(screen.key) && screen.internal === wanted.internal,
    );

  const pass = (
    choose: (wanted: DisplayDescription) => { key: number } | undefined,
  ): void => {
    waiting = waiting.filter((entry) => {
      const screen = choose(entry.display);
      if (screen === undefined) return true;
      matched.set(screen.key, entry);
      return false;
    });
  };

  pass((wanted) => free(wanted).find((screen) => sameDisplay(screen, wanted)));
  pass((wanted) =>
    wanted.label === ""
      ? undefined
      : free(wanted)
          .filter((screen) => screen.label === wanted.label)
          .sort(
            (a, b) =>
              Number(sameSize(b, wanted)) - Number(sameSize(a, wanted)) ||
              distance(a, wanted) - distance(b, wanted),
          )[0],
  );
  pass((wanted) =>
    free(wanted).find(
      (screen) =>
        (screen.label === "" || wanted.label === "") &&
        sameBounds(screen, wanted),
    ),
  );
  return matched;
}
