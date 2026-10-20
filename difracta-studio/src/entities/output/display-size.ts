import { settings, type DisplaySize } from "@difracta/core";
import type { DisplayHostLive, OutputSessionLive } from "@difracta/protocol";

import { primarySession } from "./output-live";

/** Where a Display size Studio offers comes from, for its label. */
export type DisplaySizeSource =
  | { readonly kind: "display"; readonly label: string }
  | { readonly kind: "session" }
  | { readonly kind: "fallback" };

export interface OfferedDisplaySize {
  readonly size: DisplaySize;
  readonly source: DisplaySizeSource;
}

/**
 * A Display showing the Output, as a Display Host reports it: its size in
 * device pixels (bounds × scale factor) and its label. The host connected
 * longest wins when several show the Output.
 */
export function showingDisplay(
  hosts: Readonly<Record<string, DisplayHostLive>> | undefined,
  outputId: string,
): { readonly label: string; readonly size: DisplaySize } | undefined {
  const ordered = Object.values(hosts ?? {}).sort(
    (a, b) => a.connectedAt - b.connectedAt || a.id.localeCompare(b.id),
  );
  for (const host of ordered)
    for (const [index, display] of host.displays.entries()) {
      if (host.showing[display.id] !== outputId) continue;
      return {
        label:
          display.label === "" ? `Display ${String(index + 1)}` : display.label,
        size: {
          width: Math.round(display.bounds.width * display.scaleFactor),
          height: Math.round(display.bounds.height * display.scaleFactor),
        },
      };
    }
  return undefined;
}

/**
 * The Display size Studio fills in for an Output: a Display showing it,
 * else what its freshest Output Session reports, else the fallback.
 */
export function offeredDisplaySize(
  hosts: Readonly<Record<string, DisplayHostLive>> | undefined,
  sessions: readonly OutputSessionLive[],
  outputId: string,
): OfferedDisplaySize {
  const display = showingDisplay(hosts, outputId);
  if (display !== undefined)
    return {
      size: display.size,
      source: { kind: "display", label: display.label },
    };
  const telemetry = primarySession(sessions)?.telemetry;
  if (telemetry != null)
    return {
      size: { width: telemetry.width, height: telemetry.height },
      source: { kind: "session" },
    };
  return {
    size: settings.slices.fallbackDisplaySize,
    source: { kind: "fallback" },
  };
}

export function formatSize(size: DisplaySize): string {
  return `${String(size.width)}×${String(size.height)}`;
}

export function sameSize(
  first: DisplaySize | null | undefined,
  second: DisplaySize | null | undefined,
): boolean {
  return (
    first?.width === second?.width &&
    first?.height === second?.height &&
    first != null
  );
}
