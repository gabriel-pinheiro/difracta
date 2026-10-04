import type { PackLive } from "@difracta/protocol";

/**
 * A Pack's state in the words the navigator row and its inspector use,
 * from its entry under `["live", "packs", id]`. Loading while the runtime
 * scans the folder, missing while nothing on this machine is the Pack,
 * preparing while thumbnails and proxies bake, else ready and silent.
 */
export type PackRowStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "missing" }
  | {
      readonly kind: "preparing";
      readonly done: number;
      readonly total: number;
    }
  | { readonly kind: "ready" };

export function packRowStatus(live: PackLive | undefined): PackRowStatus {
  if (live === undefined || live.status === "loading")
    return { kind: "loading" };
  if (live.status === "missing") return { kind: "missing" };
  const { done, total } = live.prepared;
  return done < total ? { kind: "preparing", done, total } : { kind: "ready" };
}

/** What a missing Pack's row and inspector say. */
export const MISSING_EXPLANATION =
  "No folder on the runtime's machine is this Pack. Locate… names where it is; until then the Layers using its entries show nothing.";

/** The hint for a Pack whose runtime has no ffmpeg. */
export const FFMPEG_MISSING =
  "ffmpeg was not found on the runtime's machine, so this Pack gets no thumbnails or previews and its sizes are read as the files load. Install ffmpeg and ffprobe, or point DIFRACTA_FFMPEG and DIFRACTA_FFPROBE at them, then Rescan.";

/** Why a row carries a warning icon: a limit the scan hit, or no ffmpeg; undefined for none. */
export function packWarning(live: PackLive | undefined): string | undefined {
  if (live?.status !== "ok") return undefined;
  if (live.warning !== undefined) return live.warning;
  return live.ffmpeg ? undefined : FFMPEG_MISSING;
}

/** "42 of 310 prepared", or "Prepared" once every entry has its files. */
export function preparedText(prepared: PackLive["prepared"]): string {
  if (prepared.done >= prepared.total) return "Prepared";
  return `${String(prepared.done)} of ${String(prepared.total)} prepared`;
}

/** "310 entries, 2 missing"; "1 entry"; "No entries". */
export function entriesText(entries: PackLive["entries"]): string {
  const all = Object.values(entries);
  if (all.length === 0) return "No entries";
  const missing = all.filter((entry) => entry.status === "missing").length;
  const count = `${String(all.length)} ${all.length === 1 ? "entry" : "entries"}`;
  return missing === 0 ? count : `${count}, ${String(missing)} missing`;
}
