import { settings } from "@difracta/core";

/** One entry of a native Open dialog's file type list, as Electron takes it. */
export interface DialogFilter {
  readonly name: string;
  readonly extensions: string[];
}

/**
 * What the Media picker lets through: every extension Difracta shows first,
 * so the dialog opens on all of them, then images and videos apart for
 * narrowing. Read from `settings.media`, the same list `media.create`
 * checks, so the dialog never offers a file the command refuses.
 */
export function mediaDialogFilters(): DialogFilter[] {
  const { imageExtensions, videoExtensions } = settings.media;
  return [
    {
      name: "Images and videos",
      extensions: [...imageExtensions, ...videoExtensions],
    },
    { name: "Images", extensions: [...imageExtensions] },
    { name: "Videos", extensions: [...videoExtensions] },
  ];
}
