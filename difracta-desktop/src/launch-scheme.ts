/**
 * The launch page is not served by any runtime: it is what chooses one. It
 * comes out of the copy of the built Studio inside Desktop, over a scheme of
 * Desktop's own. `file://` would do for one file, but Studio is built for
 * `/studio/` (its pages ask for `/studio/assets/…`), and a `file:` page has
 * no origin to check IPC senders against. Hence `app://desktop/studio/…`.
 * The share window's page (`share-window.ts`) is served the same way: the
 * scheme is secure, which a page needs to capture a screen, and no runtime
 * serves over one.
 */
export const LAUNCH_SCHEME = "app";
const LAUNCH_HOST = "desktop";
export const LAUNCH_PAGE_PATH = "/studio/launch.html";
export const LAUNCH_PAGE_URL = `${LAUNCH_SCHEME}://${LAUNCH_HOST}${LAUNCH_PAGE_PATH}`;
export const SHARE_PAGE_PATH = "/studio/share.html";
export const SHARE_PAGE_URL = `${LAUNCH_SCHEME}://${LAUNCH_HOST}${SHARE_PAGE_PATH}`;
/** The pages of Desktop's own the scheme serves, by path, with the file of the built Studio each is. */
export const DESKTOP_PAGES: Readonly<Record<string, string>> = {
  [LAUNCH_PAGE_PATH]: "launch.html",
  [SHARE_PAGE_PATH]: "share.html",
};

/** The URL when it is one of the launch scheme's, else undefined. */
export function launchSchemeUrl(url: string | undefined): URL | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    // Not `origin`: Node reports "null" for a scheme it does not know.
    return parsed.protocol === `${LAUNCH_SCHEME}:` &&
      parsed.host === LAUNCH_HOST
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a frame is the launch page. Main checks every launch IPC message
 * with this, as it checks Studio's with `isFromOrigin`: these messages start
 * runtimes and point Desktop at other machines.
 */
export function isLaunchPage(frameUrl: string | undefined): boolean {
  return launchSchemeUrl(frameUrl)?.pathname === LAUNCH_PAGE_PATH;
}

/**
 * Whether a frame is the share window's page. Main checks every share IPC
 * message and every request to capture with this: they list this computer's
 * windows and hand out its screen.
 */
export function isSharePage(frameUrl: string | undefined): boolean {
  return launchSchemeUrl(frameUrl)?.pathname === SHARE_PAGE_PATH;
}
