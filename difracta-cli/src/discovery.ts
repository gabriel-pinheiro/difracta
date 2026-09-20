import type { DiscoveredRuntime } from "@difracta/client/discovery";

export function formatRuntimes(
  runtimes: readonly DiscoveredRuntime[],
  listenedMs: number,
): string {
  if (runtimes.length === 0)
    return `No runtime answered within ${String(listenedMs / 1000)} s. A network that blocks multicast hides them; --url <host:port> still reaches one.`;
  const rows = runtimes.map((runtime) => [
    runtime.name,
    `${runtime.address}:${String(runtime.port)}`,
    runtime.host,
    runtime.version ?? "?",
    runtime.document ?? "(no Installation)",
  ]);
  const widths = rows.reduce<number[]>(
    (all, row) => row.map((cell, i) => Math.max(all[i] ?? 0, cell.length)),
    [],
  );
  return rows
    .map((row) =>
      row
        .map((cell, i) => cell.padEnd(widths[i] ?? 0))
        .join("  ")
        .trimEnd(),
    )
    .join("\n");
}
