import {
  parseMediaReference,
  type PackAttachment,
  type Table,
} from "@difracta/core";
import type { LiveState, PackEntryLive } from "@difracta/protocol";

/**
 * What a media chip shows for the value a media Address holds. Empty for
 * `""`; invalid for a value that is not a Media reference, such as the id
 * of a Media item an older Installation held; a missing Pack when the
 * reference's Pack is neither loaded nor attached, or the runtime says it
 * is missing, named from the Installation's copy of its name; a missing
 * entry when the Pack has no such entry; else the entry, with whether its
 * own file is there.
 */
export type ChipState =
  | { readonly kind: "empty" }
  | { readonly kind: "invalid"; readonly value: string }
  | {
      readonly kind: "missing-pack";
      readonly packId: string;
      readonly packName: string;
    }
  | {
      readonly kind: "missing-entry";
      readonly packId: string;
      readonly packName: string;
      readonly entryId: string;
    }
  | {
      readonly kind: "entry";
      readonly reference: string;
      readonly packId: string;
      readonly packName: string;
      readonly entry: PackEntryLive;
    };

export function chipState(
  value: unknown,
  packs: LiveState["packs"],
  attached: Table<PackAttachment>,
): ChipState {
  if (value === "" || value === undefined || value === null)
    return { kind: "empty" };
  if (typeof value !== "string")
    return { kind: "invalid", value: JSON.stringify(value) ?? "" };
  const text = value;
  const parsed = parseMediaReference(text);
  if (parsed === undefined) return { kind: "invalid", value: text };
  const { packId, entryId } = parsed;
  const live = packs[packId];
  const packName =
    live?.name ??
    attached[packId]?.name ??
    (packId === "bundled" ? "Bundled" : packId);
  if (live === undefined || live.status === "missing")
    return { kind: "missing-pack", packId, packName };
  const entry = live.entries[entryId];
  if (entry === undefined)
    return { kind: "missing-entry", packId, packName, entryId };
  return { kind: "entry", reference: text, packId, packName, entry };
}
