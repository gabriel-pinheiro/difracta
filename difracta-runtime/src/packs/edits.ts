import type { PackEntry, PackManifest } from "@difracta/core";
import type { RuntimeRequestPayload } from "@difracta/protocol";

/**
 * Tags as the manifest keeps them: trimmed, without empties, one per
 * spelling ignoring case, each with the case it was first written in.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLowerCase();
    if (tag === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(tag);
  }
  return kept;
}

export type EntryUpdate = Omit<
  RuntimeRequestPayload<"media.update">,
  "packId" | "entryId"
>;

export type EditOutcome<TResult> =
  | { readonly ok: true; readonly result: TResult }
  | { readonly ok: false; readonly error: string };

/**
 * The manifest with `entryId` changed as `update` says: a name, the tags,
 * Beats (null removes them and the first beat), the first beat, the
 * thumbnail's time, and a measured width, height or duration. Fields the
 * update leaves out keep their value. Pure; the caller writes it.
 */
export function updateEntry(
  manifest: PackManifest,
  entryId: string,
  update: EntryUpdate,
): EditOutcome<{ manifest: PackManifest; entry: PackEntry }> {
  const index = manifest.entries.findIndex((entry) => entry.id === entryId);
  const current = manifest.entries[index];
  if (current === undefined)
    return {
      ok: false,
      error: `Pack “${manifest.name}” has no entry “${entryId}”.`,
    };
  if (update.firstBeat !== undefined && update.beats === null)
    return {
      ok: false,
      error: "A first beat needs Beats; removing them removes it too.",
    };
  const next: Record<string, unknown> = { ...current };
  if (update.name !== undefined) next.name = update.name;
  if (update.tags !== undefined) next.tags = normalizeTags(update.tags);
  if (update.beats === null) {
    delete next.beats;
    delete next.firstBeat;
  } else if (update.beats !== undefined) next.beats = update.beats;
  if (update.firstBeat !== undefined) {
    if (next.beats === undefined)
      return {
        ok: false,
        error: `“${current.name}” has no Beats; set them before the first beat.`,
      };
    if (update.firstBeat === 0) delete next.firstBeat;
    else next.firstBeat = update.firstBeat;
  }
  for (const key of ["thumbnailAt", "width", "height", "duration"] as const)
    if (update[key] !== undefined) next[key] = update[key];
  const entry = next as PackEntry;
  const entries = [...manifest.entries];
  entries[index] = entry;
  return { ok: true, result: { manifest: { ...manifest, entries }, entry } };
}

/** The manifest with its Pack renamed. */
export function renamePack(manifest: PackManifest, name: string): PackManifest {
  return { ...manifest, name };
}
