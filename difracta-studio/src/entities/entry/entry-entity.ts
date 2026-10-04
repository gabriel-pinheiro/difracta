import { parseMediaReference } from "@difracta/core";

import type { EntityModule } from "@/entities";

import { EntryInspector } from "./entry-inspector";

/**
 * A Pack entry, selected by its Media reference from a Library tile while
 * browsing its Pack. It has no row of its own: its Pack's row stands for it
 * in the navigator, shown as holding the selection. Nothing removes an
 * entry, since a Pack keeps every entry it ever scanned, so Remove does
 * nothing on one.
 */
export const entryEntity: EntityModule = {
  label: "Media",
  Inspector: EntryInspector,
  parent: (_document, id) => {
    const reference = parseMediaReference(id);
    return reference === undefined
      ? undefined
      : { kind: "pack", id: reference.packId };
  },
};
