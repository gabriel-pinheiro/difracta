/**
 * The HTTP origin of the runtime this page talks to, where its Media files
 * are fetched from: the origin of the `?runtime=` live socket URL when one
 * is given, `ws` read as `http` and `wss` as `https`, otherwise the page's
 * own, which serves or proxies the runtime's routes.
 */
export function runtimeOrigin(
  runtimeParam: string | null,
  pageOrigin: string,
): string {
  if (runtimeParam === null) return pageOrigin;
  try {
    const url = new URL(runtimeParam, pageOrigin);
    const protocol =
      url.protocol === "wss:"
        ? "https:"
        : url.protocol === "ws:"
          ? "http:"
          : url.protocol;
    return `${protocol}//${url.host}`;
  } catch {
    return pageOrigin;
  }
}
