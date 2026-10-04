import type { DocumentView } from "@difracta/client";

import type { LibraryBinding } from "./browser-state";
import { LayerLibraryView } from "./layer-library";
import { MediaLibraryView } from "./media-library";

/**
 * The Library for what it is bound to: the Catalog for a Visual or Filter
 * Layer, or the Packs' entries, browsing one Pack or picking an image or
 * video for a media Address.
 */
export function LibraryView({
  view,
  binding,
}: {
  readonly view: DocumentView;
  readonly binding: LibraryBinding;
}) {
  if (binding.kind === "layer")
    return <LayerLibraryView view={view} layerId={binding.id} />;
  return <MediaLibraryView view={view} binding={binding} />;
}
