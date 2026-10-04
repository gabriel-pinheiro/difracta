import { BUNDLED_PACK_ID, sameName, type Document } from "@difracta/core";
import type { KnownPack, LiveState, PackStatus } from "@difracta/protocol";

import { formatTable } from "./read.ts";

/** One Pack as `packs list` shows it: the Bundled Pack, then the attached ones by name. */
export interface PackListing {
  readonly id: string;
  readonly name: string;
  /** `bundled` for the Bundled Pack, else `attached`. */
  readonly attachment: "bundled" | "attached";
  readonly readOnly: boolean;
  /** Undefined while the runtime has not said anything about the Pack. */
  readonly status: PackStatus | undefined;
  /** Where it is on the runtime's disk; empty while missing or unknown. */
  readonly folder: string;
  /** The Installation's hint to the Pack, when it carries one. */
  readonly relativePath: string | undefined;
  /** Entries with a thumbnail and, for a video, a proxy, out of the ones with a file. */
  readonly prepared: { readonly done: number; readonly total: number } | null;
  readonly entries: number | null;
  readonly warning: string | undefined;
  readonly ffmpeg: boolean | null;
}

export function listPacks(
  document: Pick<Document, "packs">,
  live: LiveState["packs"],
): PackListing[] {
  const bundled = live[BUNDLED_PACK_ID];
  const rows: PackListing[] = [
    {
      id: BUNDLED_PACK_ID,
      name: bundled?.name ?? "Bundled",
      attachment: "bundled",
      readOnly: true,
      status: bundled?.status,
      folder: bundled?.folder ?? "",
      relativePath: undefined,
      prepared: bundled?.prepared ?? null,
      entries:
        bundled === undefined ? null : Object.keys(bundled.entries).length,
      warning: bundled?.warning,
      ffmpeg: bundled?.ffmpeg ?? null,
    },
  ];
  const attached = Object.values(document.packs).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "accent" }),
  );
  for (const attachment of attached) {
    const pack = live[attachment.id];
    rows.push({
      id: attachment.id,
      name: pack?.name ?? attachment.name,
      attachment: "attached",
      readOnly: pack?.readOnly ?? false,
      status: pack?.status,
      folder: pack?.folder ?? "",
      relativePath: attachment.relativePath,
      prepared: pack?.prepared ?? null,
      entries: pack === undefined ? null : Object.keys(pack.entries).length,
      warning: pack?.warning,
      ffmpeg: pack?.ffmpeg ?? null,
    });
  }
  return rows;
}

/** `ok`, `preparing 42/310`, `missing`, `loading`, or `…` while the runtime has not said. */
export function describePackState(pack: PackListing): string {
  if (pack.status === undefined) return "…";
  if (pack.status !== "ok") return pack.status;
  if (pack.prepared !== null && pack.prepared.done < pack.prepared.total)
    return `preparing ${String(pack.prepared.done)}/${String(pack.prepared.total)}`;
  return "ok";
}

/** One row per Pack: name, id, state, entry count, read-only, folder (or the hint), then a warning line when there is one. */
export function formatPacks(packs: readonly PackListing[]): string {
  const table = formatTable(
    packs.map((pack) => [
      pack.name,
      pack.id,
      describePackState(pack),
      pack.entries === null
        ? ""
        : `${String(pack.entries)} ${pack.entries === 1 ? "entry" : "entries"}`,
      pack.readOnly ? "read-only" : "",
      pack.folder !== ""
        ? pack.folder
        : pack.relativePath === undefined
          ? ""
          : `hint ${pack.relativePath}`,
    ]),
  );
  const warnings = packs.flatMap((pack) => [
    ...(pack.warning === undefined
      ? []
      : [`  warning: ${pack.name}: ${pack.warning}`]),
    ...(pack.ffmpeg === false && pack.status === "ok" && !pack.readOnly
      ? [
          `  warning: ${pack.name}: ffmpeg is not installed on the runtime's machine, so it has no thumbnails or proxies`,
        ]
      : []),
  ]);
  return [table, ...warnings].join("\n");
}

/** One row per known Pack: name, id, loaded or not, folder. */
export function formatKnownPacks(known: readonly KnownPack[]): string {
  if (known.length === 0)
    return "This machine knows no Packs yet. `difracta packs add <folder>` makes one from a folder of images and videos.";
  return formatTable(
    known.map((pack) => [
      pack.name,
      pack.id,
      pack.loaded ? "loaded" : "",
      pack.folder,
    ]),
  );
}

/**
 * The known Pack `text` names, by id or by a name only one carries; an
 * ambiguous or unknown one is an error naming the candidates.
 */
export function findKnownPack(
  known: readonly KnownPack[],
  text: string,
): KnownPack {
  const byId = known.find((pack) => pack.id === text);
  if (byId !== undefined) return byId;
  const matches = known.filter((pack) => sameName(pack.name, text));
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return only;
  if (matches.length > 1)
    throw new Error(
      `“${text}” matches ${String(matches.length)} known Packs: ${matches
        .map((pack) => `${pack.name} (${pack.id}, ${pack.folder})`)
        .join(", ")}.`,
    );
  throw new Error(
    `This machine knows no Pack called or identified “${text}”; \`difracta packs known\` lists them, \`difracta packs add <folder>\` makes one.`,
  );
}
