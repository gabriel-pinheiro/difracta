import {
  installationFolder,
  normalizeMediaPath,
  relativeMediaPath,
} from "@difracta/core";

/**
 * The path a Media item stores for a file at `picked`: relative to the
 * Installation file's folder when the Installation has a file, else as it
 * came, which the runtime reads as `unsaved` until the Installation is saved
 * and the row explains. A relative path is already relative and stays so.
 */
export function storedMediaPath(
  picked: string,
  documentPath: string | null,
): string {
  return documentPath === null
    ? normalizeMediaPath(picked)
    : relativeMediaPath(picked, installationFolder(documentPath));
}
