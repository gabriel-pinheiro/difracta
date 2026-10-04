/**
 * Where the Bundled Pack's files are: the folder `npm run media:fetch` fills
 * from the difracta-media release `settings.media.bundle` pins. The runtime
 * loads it as the read-only Pack `bundled`; the clips stay files here.
 */
export const bundledRoot = new URL("../../bundled/", import.meta.url);
