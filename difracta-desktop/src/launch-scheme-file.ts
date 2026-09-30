import path from "node:path";

import { DESKTOP_PAGES, launchSchemeUrl } from "./launch-scheme.ts";

/**
 * The file an `app://` request is answered with, or undefined for a 404.
 * Only Desktop's own pages (the launch page, the share window's) and the
 * built assets they load are served, never the rest of Studio, and whatever
 * the URL spells (`..`, `%2e%2e`, an encoded slash or backslash) the file
 * stays inside `studioDist`.
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
  const root = path.resolve(studioDist);
  const page = Object.hasOwn(DESKTOP_PAGES, pathname)
    ? DESKTOP_PAGES[pathname]
    : undefined;
  if (page !== undefined) return path.join(root, page);
  if (!pathname.startsWith("/studio/assets/")) return undefined;

  const file = path.resolve(root, `.${pathname.slice("/studio".length)}`);
  return file.startsWith(path.join(root, "assets") + path.sep)
    ? file
    : undefined;
}
