import { mediaDefinitionsFromManifest } from "@difracta/core";

import manifest from "../../bundled/manifest.json" with { type: "json" };

/**
 * The Bundled Media: the entries of the manifest `npm run media:fetch` put
 * in `bundled/`, validated when this module loads, so a bad manifest fails
 * the build and the tests, never a show. Bundlers inline the JSON; the
 * clips and thumbnails stay files under `bundledRoot`.
 */
export const bundledMedia = mediaDefinitionsFromManifest(manifest);

/** Where the bundle's files are: `manifest.json`, `clips/` and `thumbnails/`. */
export const bundledRoot = new URL("../../bundled/", import.meta.url);
