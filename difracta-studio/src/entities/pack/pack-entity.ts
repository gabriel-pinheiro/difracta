import { BUNDLED_PACK_ID } from "@difracta/core";

import type { EntityModule } from "@/entities";
import { MediaSection } from "@/entities/media/media-section";
import { catalog } from "@/lib/catalog";

import { PackInspector } from "./pack-inspector";
import { detachDescription, packUses } from "./pack-removal";

/**
 * Packs share the Media section with the Screen Shares. Remove detaches the
 * Pack from the Installation after a question that counts what uses its
 * entries; the Bundled Pack is never detached.
 */
export const packEntity: EntityModule = {
  label: "Media",
  Section: MediaSection,
  Inspector: PackInspector,
  removal: {
    noun: "Pack",
    command: "packs.detach",
    payload: (id) => ({ packId: id }),
    find: (document, id) =>
      id === BUNDLED_PACK_ID ? { name: "Bundled" } : document.packs[id],
    refusal: (_document, id) =>
      id === BUNDLED_PACK_ID
        ? "The Bundled Pack is attached to every Installation and cannot be removed."
        : undefined,
    confirm: (document, id) =>
      detachDescription(
        document.packs[id]?.name ?? id,
        packUses(document, catalog, id),
      ),
  },
};
