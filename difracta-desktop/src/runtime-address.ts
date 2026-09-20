import { settings } from "@difracta/core";

export type ParsedAddress =
  | { readonly ok: true; readonly origin: string }
  | { readonly ok: false; readonly reason: string };

const SCHEMES: Record<string, "http" | "https"> = {
  http: "http",
  ws: "http",
  https: "https",
  wss: "https",
};

/**
 * The origin of the runtime a person typed: `host`, `host:port`, or a URL of
 * it (`http://host:port/studio/`, or the `ws://host:port/live` the CLI takes).
 * The default port fills in when none is typed. An origin, because that is
 * what everything after this needs: `/health`, `/studio/` and the live socket
 * all hang off it, and it is what a window is confined to.
 */
export function parseRuntimeAddress(input: string): ParsedAddress {
  const text = input.trim();
  if (text === "") return { ok: false, reason: "Type an address first." };
  const refused: ParsedAddress = {
    ok: false,
    reason: `“${text}” is not an address. Use host, host:port or http://host:port.`,
  };
  if (/\s/.test(text)) return refused;

  const typedScheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(text)?.[1];
  const scheme =
    typedScheme === undefined ? "http" : SCHEMES[typedScheme.toLowerCase()];
  if (scheme === undefined) return refused;
  const rest =
    typedScheme === undefined ? text : text.slice(typedScheme.length + 3);
  // Read from the text, not from `URL.port`: that one is empty for a typed
  // `:80`, which would silently become the default port.
  const authority = rest.split(/[/?#]/, 1)[0] ?? "";
  if (authority.includes("@")) return refused;
  const typedPort = /:(\d+)$/.exec(authority)?.[1];
  const port =
    typedPort === undefined
      ? settings.runtime.port
      : Number.parseInt(typedPort, 10);
  if (port < 1 || port > 65_535)
    return { ok: false, reason: `${typedPort ?? ""} is not a port.` };

  try {
    const { hostname } = new URL(`${scheme}://${authority}`);
    if (hostname === "") return refused;
    return { ok: true, origin: `${scheme}://${hostname}:${String(port)}` };
  } catch {
    return refused;
  }
}

/** An origin as a person reads it: `10.0.0.5:4800`, the scheme shown only when it is not plain http. */
export function addressLabel(origin: string): string {
  return origin.replace(/^http:\/\//, "");
}

/**
 * A runtime elsewhere as the Runtime menu and the window title name it,
 * "stage-pc — 10.0.0.5:4800": the machine out of the announced name
 * ("Difracta on stage-pc") when there is one, and always the address.
 */
export function remoteLabel(origin: string, name: string | null): string {
  const machine = name?.replace(`${settings.discovery.name} on `, "");
  const address = addressLabel(origin);
  return machine === undefined || machine === ""
    ? address
    : `${machine} — ${address}`;
}

/** The live socket of the runtime at `origin`. */
export function liveUrl(origin: string): string {
  return `${origin.replace(/^http/, "ws")}${settings.runtime.livePath}`;
}
