import { sameName, type Catalog, type MediaDefinition } from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { formatTable } from "./read.ts";

/**
 * The Bundled Media entry `text` names: an entry id, or the name of exactly
 * one entry, compared ignoring case and surrounding whitespace. Anything
 * else is an error pointing at `difracta media bundled`.
 */
export function resolveBundled(catalog: Catalog, text: string): string {
  if (catalog.mediaEntry(text) !== undefined) return text;
  const matches = catalog.media().filter((entry) => sameName(entry.name, text));
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return only.id;
  if (matches.length > 1)
    throw new Error(
      `“${text}” matches ${matches.length} Bundled Media entries: ${matches.map((entry) => entry.id).join(", ")}`,
    );
  throw new Error(
    `No Bundled Media entry is called or identified “${text}”. \`difracta media bundled\` lists them.`,
  );
}

/** The commands whose `bundled` field names a Bundled Media entry. */
const BUNDLED_COMMANDS: readonly string[] = ["media.create", "media.bundled"];

/**
 * A `run` payload with its `bundled` field, for the commands that have one,
 * turned from an entry's name into its id. The Catalog is fetched only when
 * there is a name to resolve.
 */
export async function resolveBundledPayload(
  command: string,
  payload: unknown,
  catalog: () => Promise<Catalog>,
): Promise<unknown> {
  if (!BUNDLED_COMMANDS.includes(command)) return payload;
  if (typeof payload !== "object" || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  if (typeof record.bundled !== "string") return payload;
  return {
    ...record,
    bundled: resolveBundled(await catalog(), record.bundled),
  };
}

/** Recommended, Loop and Hit as short words, for listings. */
export function bundledFlags(entry: MediaDefinition): string {
  return [
    entry.recommended === true ? "recommended" : undefined,
    entry.loop === true ? "loop" : undefined,
    entry.hit === true ? "hit" : undefined,
  ]
    .filter((flag) => flag !== undefined)
    .join(", ");
}

/** One row per entry: id, name, type, then the word of each flag it has (loop, hit, recommended) in its own column. */
export function formatBundled(entries: readonly MediaDefinition[]): string {
  if (entries.length === 0)
    return "This runtime has no Bundled Media. `npm run media:fetch` puts it in place.";
  const mark = (flag: boolean | undefined, word: string): string =>
    flag === true ? word : "";
  return formatTable(
    entries.map((entry) => [
      entry.id,
      entry.name,
      entry.type,
      mark(entry.loop, "loop"),
      mark(entry.hit, "hit"),
      mark(entry.recommended, "recommended"),
    ]),
  );
}

/** `catalog <id>` for a Bundled Media entry: what a person reads before using it. */
export function describeBundled(entry: MediaDefinition): string {
  const flags = bundledFlags(entry);
  const size = `${String(entry.width)}x${String(entry.height)}`;
  const length =
    entry.duration === undefined ? "" : `, ${String(entry.duration)} s`;
  const lines = [
    `${entry.name}  (Bundled Media, ${entry.type}${flags === "" ? "" : `, ${flags}`})  id: ${entry.id}`,
    entry.description,
    `${size}${length}`,
  ];
  if (entry.notes !== undefined) lines.push("", entry.notes);
  lines.push(
    "",
    `Add it with \`difracta media add --bundled ${entry.id}\`; a Visual's media Parameter then takes the item.`,
  );
  return lines.join("\n");
}

export function registerMediaBundled(media: Command, cli: Cli): void {
  media
    .command("bundled")
    .description(
      "List the Bundled Media, the clips this runtime ships: id, name, type and the Loop (loops without a seam), Hit (a one-shot on a beat) and Recommended flags. `media add --bundled <id|name>` adds one; `catalog <id>` describes one.",
    )
    .action(() =>
      cli.withClient(async (client) => {
        const entries = (await fetchCatalog(client)).media();
        cli.print(entries, () => formatBundled(entries));
      }),
    );
}
