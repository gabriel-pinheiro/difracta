import type { DisplayHostLive, DocumentSummary } from "@difracta/protocol";

/**
 * The connected Display Hosts for a shell reader: a line per host with the
 * id `displays show` takes, then a line per Display with its id, label,
 * size, position on the host's desktop and the Output it shows. Outputs are
 * named from the open Installation's summary; one it does not have keeps
 * its id.
 */
export function formatDisplayHosts(
  hosts: readonly DisplayHostLive[],
  outputs: DocumentSummary["outputs"],
): string {
  if (hosts.length === 0) return "No Display Host is connected.";
  const lines: string[] = [];
  for (const host of hosts) {
    const count = host.displays.length;
    lines.push(
      `${host.id}  ${host.name}  ${count === 0 ? "no Displays" : count === 1 ? "1 Display" : `${String(count)} Displays`}`,
    );
    const rows = host.displays.map((display) => {
      const { x, y, width, height } = display.bounds;
      const shown = host.showing[display.id];
      const output = outputs.find((candidate) => candidate.id === shown);
      return [
        display.id,
        display.label === "" ? "(no label)" : display.label,
        `${String(width)}×${String(height)} at ${String(x)},${String(y)}`,
        `×${String(display.scaleFactor)}`,
        [display.primary ? "primary" : "", display.internal ? "internal" : ""]
          .filter((word) => word !== "")
          .join(" "),
        shown === undefined
          ? "shows nothing"
          : `shows ${output === undefined ? shown : `${output.name} (${shown})`}`,
      ];
    });
    const widths = rows.reduce<number[]>(
      (all, row) => row.map((cell, i) => Math.max(all[i] ?? 0, cell.length)),
      [],
    );
    for (const row of rows)
      lines.push(
        `  ${row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ")}`.trimEnd(),
      );
  }
  return lines.join("\n");
}
