import type { DocumentView } from "@difracta/client";
import type { VisualLayer } from "@difracta/core";
import type { ComponentType } from "react";

import { LiveCropEditor } from "./live-crop/crop-editor";

/**
 * What a Visual shows in a Layer's inspector besides its Parameter rows,
 * by Visual id, drawn at the top of the Parameters section: an editor for
 * several Parameters at once where a picture says more than the rows. The
 * rows stay below it, so everything it writes is an Address like any
 * other. Live's crop editor is the one there is.
 */
export const visualPanels: Readonly<
  Record<
    string,
    ComponentType<{
      readonly view: DocumentView;
      readonly layer: VisualLayer;
    }>
  >
> = {
  live: LiveCropEditor,
};
