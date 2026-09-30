import type {
  ScreenAccess,
  SharePicker,
  ShareSourceChoice,
  ShareSourceKind,
} from "./share-contract.ts";

/**
 * Which screen or window a capture gets, decided apart from Electron. On a
 * Wayland session the operating system asks: listing the sources raises its
 * dialog and returns the one the person chose, which is granted as it is.
 * Everywhere else the share window lists them and the person chooses there.
 */

/**
 * Who asks. A Wayland session is known by its environment, whatever
 * platform Desktop's own windows are on: Desktop runs on X11 there
 * (`ozone-platform.ts`) and the capture still goes through the system's
 * dialog.
 */
export function sharePicker(running: {
  readonly platform: NodeJS.Platform;
  readonly env: {
    readonly XDG_SESSION_TYPE?: string | undefined;
    readonly WAYLAND_DISPLAY?: string | undefined;
  };
}): SharePicker {
  if (running.platform !== "linux") return "own";
  const { XDG_SESSION_TYPE: session, WAYLAND_DISPLAY: display } = running.env;
  return session === "wayland" || (display !== undefined && display !== "")
    ? "system"
    : "own";
}

/** What a source is, from the id Electron gives it: `screen:0:0`, `window:123:0`. */
export function sourceKind(id: string): ShareSourceKind | undefined {
  if (id.startsWith("screen:")) return "screen";
  if (id.startsWith("window:")) return "window";
  return undefined;
}

/** A source as the operating system lists it. */
export interface ListedSource {
  readonly id: string;
  readonly name: string;
  readonly thumbnail: string | null;
}

/**
 * The sources of one kind as the picker shows them, in the system's order,
 * without the share window itself (`own`, its media source id): a picture
 * of the picker is nothing to share.
 */
export function sourceChoices(
  sources: readonly ListedSource[],
  kind: ShareSourceKind,
  own?: string,
): ShareSourceChoice[] {
  return sources
    .filter((source) => sourceKind(source.id) === kind && source.id !== own)
    .map(({ id, name, thumbnail }) => ({ id, kind, name, thumbnail }));
}

/**
 * The source a capture gets, or undefined to refuse it: with the system's
 * picker the one it returned, with Desktop's own the one the person chose
 * among those listed.
 */
export function sourceToGrant<TSource extends { readonly id: string }>(
  picker: SharePicker,
  sources: readonly TSource[],
  chosen: string | undefined,
): TSource | undefined {
  if (picker === "system") return sources[0];
  return chosen === undefined
    ? undefined
    : sources.find((source) => source.id === chosen);
}

/**
 * Whether the operating system lets Desktop capture, from what a Mac says
 * of its Screen Recording permission; no other system says.
 */
export function screenAccess(
  platform: NodeJS.Platform,
  status: string | undefined,
): ScreenAccess {
  if (platform !== "darwin") return "unknown";
  if (status === "granted") return "granted";
  return status === "denied" || status === "restricted" ? "denied" : "unknown";
}
