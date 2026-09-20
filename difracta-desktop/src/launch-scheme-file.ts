import path from "node:path";

import { LAUNCH_PAGE_PATH, launchSchemeUrl } from "./launch-scheme.ts";

/**
 * The file an `app://` request is answered with, or undefined for a 404.
 * Only the launch page and the built assets it loads are served, never the
 * rest of Studio, and whatever the URL spells (`..`, `%2e%2e`, an encoded
 * slash or backslash) the file stays inside `studioDist`.
 */
export function launchSchemeFile(
  url: string,
  studioDist: string,
): string | undefined {
  const parsed = launchSchemeUrl(url);
  if (parsed === undefined) return undefined;
  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return undefined;
  }
  if (pathname.includes("\0") || pathname.includes("\\")) return undefined;
  if (pathname !== LAUNCH_PAGE_PATH && !pathname.startsWith("/studio/assets/"))
    return undefined;

  const root = path.resolve(studioDist);
  const file = path.resolve(root, `.${pathname.slice("/studio".length)}`);
  const served =
    file === path.join(root, "launch.html") ||
    file.startsWith(path.join(root, "assets") + path.sep);
  return served ? file : undefined;
}
