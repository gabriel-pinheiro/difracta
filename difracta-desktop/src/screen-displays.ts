import type { Display } from "@difracta/protocol";

/** A Display as Electron's `screen` describes it, reduced to what Desktop uses. */
export interface ScreenDisplay {
  /**
   * Electron's own id for it. It tells Displays apart while Desktop runs and
   * means nothing after, so it is never offered and never saved.
   */
  readonly key: number;
  /** The operating system's name for it, often the model; may be empty. */
  readonly label: string;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly scaleFactor: number;
  readonly primary: boolean;
  readonly internal: boolean;
}

/** A Display as this Display Host offers it, next to the one of `screen` it stands for. */
export interface OfferedDisplay {
  readonly key: number;
  readonly display: Display;
}

/** The protocol's limits on what a host may offer. */
const DISPLAYS_LIMIT = 32;
const LABEL_LIMIT = 200;

/**
 * The Displays of this computer as offered to the runtime. Their ids are
 * `1`, `2`… from left to right, then top to bottom: short enough to type
 * after `difracta displays show`, and the same from one launch to the next
 * for as long as the Displays stay arranged as they are. A Display the
 * operating system has no name for is labelled by its id.
 */
export function offerDisplays(
  screens: readonly ScreenDisplay[],
): OfferedDisplay[] {
  return screens
    .filter(
      (screen) =>
        screen.bounds.width > 0 &&
        screen.bounds.height > 0 &&
        screen.scaleFactor > 0,
    )
    .sort(
      (a, b) =>
        a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y || a.key - b.key,
    )
    .slice(0, DISPLAYS_LIMIT)
    .map((screen, index) => {
      const id = String(index + 1);
      const label = screen.label.trim().slice(0, LABEL_LIMIT);
      return {
        key: screen.key,
        display: {
          id,
          label: label === "" ? `Display ${id}` : label,
          bounds: { ...screen.bounds },
          scaleFactor: screen.scaleFactor,
          primary: screen.primary,
          internal: screen.internal,
        },
      };
    });
}
