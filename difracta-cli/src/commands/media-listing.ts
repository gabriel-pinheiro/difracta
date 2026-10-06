import {
  BUNDLED_PACK_ID,
  describeBeats,
  mediaReference,
  type Document,
  type FileMediaType,
} from "@difracta/core";
import type { EntryStatus, LiveState, PackLive } from "@difracta/protocol";

import { formatTable } from "./read.ts";

/** One Pack entry as `media list` shows it. */
export interface EntryListing {
  /** `<packId>/<entryId>`: what a media Parameter takes. */
  readonly reference: string;
  readonly packId: string;
  readonly id: string;
  readonly name: string;
  /** The file's path inside the Pack. */
  readonly file: string;
  readonly type: FileMediaType;
  readonly width: number | null;
  readonly height: number | null;
  /** Seconds; null for an image or one not measured yet. */
  readonly duration: number | null;
  readonly beats: number | null;
  readonly firstBeat: number | null;
  readonly tags: readonly string[];
  readonly status: EntryStatus;
  readonly thumbnail: boolean;
  /** The heights the entry's proxy is baked at, smallest first; none for an image. */
  readonly proxies: readonly number[];
}

/** One Pack's entries, in path order, each as a listing row. */
export function listEntries(packId: string, pack: PackLive): EntryListing[] {
  return Object.values(pack.entries)
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((entry) => ({
      reference: mediaReference(packId, entry.id),
      packId,
      id: entry.id,
      name: entry.name,
      file: entry.file,
      type: entry.type,
      width: entry.width ?? null,
      height: entry.height ?? null,
      duration: entry.duration ?? null,
      beats: entry.beats ?? null,
      firstBeat: entry.beats === undefined ? null : (entry.firstBeat ?? 0),
      tags: entry.tags,
      status: entry.status,
      thumbnail: entry.hasThumbnail,
      proxies: entry.proxies,
    }));
}

/** `1920×1080` or empty while unmeasured. */
function describeSize(entry: EntryListing): string {
  return entry.width === null || entry.height === null
    ? ""
    : `${String(entry.width)}×${String(entry.height)}`;
}

/** `7.1 s` or empty for an image. */
function describeDuration(entry: EntryListing): string {
  return entry.duration === null
    ? ""
    : `${String(Math.round(entry.duration * 10) / 10)} s`;
}

/** `16 beats, 135.2 BPM`, with `from 0.5 s` when the first beat is off zero. */
function describeEntryBeats(entry: EntryListing): string {
  if (entry.beats === null) return "";
  const beats = describeBeats(entry.beats, entry.duration ?? undefined);
  return entry.firstBeat !== null && entry.firstBeat > 0
    ? `${beats}, from ${String(entry.firstBeat)} s`
    : beats;
}

/** `proxies 480p, 1080p`, `no proxy` for a video with none baked yet, empty for an image. */
function describeProxies(entry: EntryListing): string {
  if (entry.type !== "video") return "";
  if (entry.proxies.length === 0) return "no proxy";
  return `proxies ${entry.proxies.map((height) => `${String(height)}p`).join(", ")}`;
}

/** One row per entry: reference, path, type, size, duration, beats, baked proxies, tags, and `missing` when the file is gone. */
export function formatEntries(entries: readonly EntryListing[]): string {
  if (entries.length === 0) return "  No entries.";
  return formatTable(
    entries.map((entry) => [
      entry.reference,
      entry.file,
      entry.type,
      describeSize(entry),
      describeDuration(entry),
      describeEntryBeats(entry),
      describeProxies(entry),
      entry.tags.join(", "),
      entry.status === "missing" ? "missing" : "",
    ]),
  );
}

/** Which Packs `media list` walks: Bundled first, then the attached ones by name; missing ones named with no entries. */
export function listingPacks(
  document: Pick<Document, "packs">,
  live: LiveState["packs"],
): {
  readonly packId: string;
  readonly name: string;
  readonly pack?: PackLive;
}[] {
  const attached = Object.entries(document.packs).sort(([, a], [, b]) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "accent" }),
  );
  return [
    {
      packId: BUNDLED_PACK_ID,
      name: live[BUNDLED_PACK_ID]?.name ?? "Bundled",
      ...(live[BUNDLED_PACK_ID] === undefined
        ? {}
        : { pack: live[BUNDLED_PACK_ID] }),
    },
    ...attached.map(([packId, attachment]) => ({
      packId,
      name: live[packId]?.name ?? attachment.name,
      ...(live[packId] === undefined ? {} : { pack: live[packId] }),
    })),
  ];
}

/** Every Pack's entries under a heading naming the Pack; a Pack the runtime lacks says so. */
export function formatPackEntries(
  groups: readonly {
    readonly packId: string;
    readonly name: string;
    readonly pack?: PackLive;
  }[],
): string {
  return groups
    .map(({ packId, name, pack }) => {
      const heading = `${name}  ${packId}${pack === undefined ? "  not loaded" : pack.status === "missing" ? "  missing" : ""}`;
      const body =
        pack === undefined || pack.status === "missing"
          ? "  No entries here; `difracta packs locate` says where the Pack is."
          : formatEntries(listEntries(packId, pack))
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n");
      return `${heading}\n${body}`;
    })
    .join("\n\n");
}
