/** The longest name the protocol takes for a Display Host and for a Sharer. */
const NAME_LIMIT = 120;

/**
 * The name this computer goes by in a runtime, as a Display Host and as a
 * Sharer: its hostname, cut to what the protocol takes, or Desktop's own
 * name when the operating system has none for it.
 */
export function hostName(hostname: string): string {
  return hostname.trim().slice(0, NAME_LIMIT).trim() || "Difracta Desktop";
}
