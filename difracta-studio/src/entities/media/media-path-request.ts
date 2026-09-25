import type { NameRequest } from "@/components/name-dialog";
import { desktopBridge } from "@/documents/desktop-bridge";

import { storedMediaPath } from "./media-path";

/**
 * How Studio names a Media file on the runtime's machine. Inside Difracta
 * Desktop that is the native picker over the images and videos Difracta
 * shows, opened straight away. In a browser there is no such dialog for a
 * path on disk, so the path is typed. Either way what reaches `onPath` is
 * what the item stores.
 */
export function requestMediaPath(options: {
  readonly purpose: "add" | "change";
  /** The open Installation's file, which the stored path is relative to. */
  readonly documentPath: string | null;
  /** What the typed-path dialog starts with; the current path when changing it. */
  readonly initial?: string | undefined;
  /** Shows the typed-path dialog when there is no native one. */
  readonly showDialog: (request: NameRequest) => void;
  readonly onPath: (path: string) => void;
}): void {
  const { purpose, documentPath, onPath } = options;
  const desktop = desktopBridge();
  if (desktop !== undefined) {
    void desktop.pickMediaPath().then((picked) => {
      if (picked !== null) onPath(storedMediaPath(picked, documentPath));
    });
    return;
  }
  options.showDialog({
    title: purpose === "add" ? "Add Media" : "Change Media path",
    label:
      "Path of the image or video, relative to the Installation file's folder",
    initial: options.initial ?? "",
    submitLabel: purpose === "add" ? "Add" : "Change",
    onSubmit: (typed) => onPath(storedMediaPath(typed, documentPath)),
  });
}
