/**
 * The origin Studio is loaded from: the runtime Desktop started, over
 * loopback. Loopback is what makes the runtime treat Studio as a client on
 * its own machine, allowed to open and save files by path.
 */
export function localOrigin(port: number): string {
  return `http://127.0.0.1:${String(port)}`;
}

/**
 * Whether a frame may use the bridge. Main checks every IPC message with
 * this: a message proves only that some frame in some window sent it, and
 * the file pickers hand out paths on this disk.
 */
export function isFromOrigin(
  frameUrl: string | undefined,
  origin: string,
): boolean {
  if (frameUrl === undefined) return false;
  try {
    return new URL(frameUrl).origin === origin;
  } catch {
    return false;
  }
}

/**
 * What to do with a link a page wants in a new window. The runtime's own
 * pages (an Output page opened from Studio) get an app window; web links go
 * to the person's browser; anything else (`file:`, `javascript:`) is dropped.
 */
export function linkTarget(
  url: string,
  origin: string,
): "window" | "browser" | "refused" {
  if (isFromOrigin(url, origin)) return "window";
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:"
      ? "browser"
      : "refused";
  } catch {
    return "refused";
  }
}
