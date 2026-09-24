import type { Output, Table } from "@difracta/core";
import type { DisplayHostLive } from "@difracta/protocol";

/** One Display of a Display Host as the Open Output dialog lists it. */
export interface DisplayRow {
  readonly id: string;
  /** The Display's own label, or "Display <n>" by its place in the host's list when it reports none. */
  readonly label: string;
  /** Device pixels, as a projector's native resolution is quoted. */
  readonly resolution: string;
  /** "primary", "internal", or neither. */
  readonly marks: readonly string[];
  /** The Output it shows; one the Installation does not have keeps its id as its name. */
  readonly shows: { readonly id: string; readonly name: string } | undefined;
}

export interface DisplayHostRows {
  readonly id: string;
  readonly name: string;
  readonly displays: readonly DisplayRow[];
}

/** The connected Display Hosts, the one connected longest first, each with its Displays in the host's order. */
export function displayHostRows(
  hosts: Readonly<Record<string, DisplayHostLive>> | undefined,
  outputs: Table<Output>,
): DisplayHostRows[] {
  return Object.values(hosts ?? {})
    .sort((a, b) => a.connectedAt - b.connectedAt || a.id.localeCompare(b.id))
    .map((host) => ({
      id: host.id,
      name: host.name,
      displays: host.displays.map((display, index) => {
        const { width, height } = display.bounds;
        const shown = host.showing[display.id];
        return {
          id: display.id,
          label:
            display.label === ""
              ? `Display ${String(index + 1)}`
              : display.label,
          resolution: `${String(Math.round(width * display.scaleFactor))}×${String(Math.round(height * display.scaleFactor))}`,
          marks: [
            ...(display.primary ? ["primary"] : []),
            ...(display.internal ? ["internal"] : []),
          ],
          shows:
            shown === undefined
              ? undefined
              : { id: shown, name: outputs[shown]?.name ?? shown },
        };
      }),
    }));
}
