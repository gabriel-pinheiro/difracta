import { settings } from "@difracta/core";

/**
 * The live URL for whatever a person types after `--url`: a full
 * `ws(s)://host:port/live`, the runtime's `http(s)://host:port` (the scheme
 * becomes `ws(s)` and the path `/live`), or a bare `host:port` or `host`
 * (the default port fills in). A path other than `/` is kept as typed.
 */
export function normalizeUrl(input: string): string {
  const text = input.trim();
  if (text === "") throw new Error("The runtime URL is empty.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : `ws://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new Error(`Not a runtime URL: “${input}”.`);
  }
  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  const schemes: Record<string, string> = {
    ws: "ws",
    wss: "wss",
    http: "ws",
    https: "wss",
  };
  const protocol = schemes[scheme];
  if (protocol === undefined)
    throw new Error(
      `Not a runtime URL: “${input}”. Use ws://host:port/live or http://host:port.`,
    );
  const port = url.port === "" ? String(settings.runtime.port) : url.port;
  const path =
    url.pathname === "" || url.pathname === "/"
      ? settings.runtime.livePath
      : url.pathname;
  return `${protocol}://${url.hostname}:${port}${path}`;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Whether a normalized live URL names this machine: then a folder or file
 * path typed at this shell is a path on the runtime's disk too, and the CLI
 * resolves it against its own working directory before sending it.
 */
export function isLocalUrl(normalized: string): boolean {
  return LOOPBACK_HOSTS.has(new URL(normalized).hostname.toLowerCase());
}
