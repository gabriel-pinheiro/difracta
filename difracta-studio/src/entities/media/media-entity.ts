import type { EntityModule } from "@/entities";
import { groupParent } from "@/navigator/ancestor-rows";

import { MediaInspector } from "./media-inspector";
import { MediaSection } from "./media-section";

export const mediaEntity: EntityModule = {
  label: "Media",
  Section: MediaSection,
  Inspector: MediaInspector,
  removal: {
    noun: "Media",
    command: "media.remove",
    payload: (id) => ({ mediaId: id }),
    find: (document, id) => document.media[id],
  },
  parent: groupParent("media", (document) => document.media),
};
