import type { NameRequest } from "@/components/name-dialog";

import { desktopBridge } from "./desktop-bridge";

/**
 * How Studio names a file on the runtime's machine. Inside Difracta Desktop
 * that is a native Open or Save dialog. In a browser on a free runtime there
 * is no such dialog for a path on disk, so the absolute path is typed into
 * the name dialog; the runtime refuses a relative one and adds the
 * `.difracta` extension when it is missing.
 */
export function requestFilePath(options: {
  readonly purpose: "open" | "save";
  /** The open Installation, to start from its file or suggest its name. */
  readonly current:
    { readonly path: string | null; readonly name: string } | undefined;
  /** Shows the typed-path dialog when there is no native one. */
  readonly showDialog: (request: NameRequest) => void;
  readonly onPath: (path: string) => void;
}): void {
  const { purpose, current, onPath } = options;
  const desktop = desktopBridge();
  if (desktop !== undefined) {
    const picked =
      purpose === "open"
        ? desktop.pickOpenPath()
        : desktop.pickSavePath(current?.name);
    void picked.then((path) => {
      if (path !== null) onPath(path);
    });
    return;
  }
  options.showDialog({
    title: purpose === "open" ? "Open Installation" : "Save Installation As",
    label: "Absolute path of the .difracta file, on the runtime's machine",
    initial: current?.path ?? "",
    submitLabel: purpose === "open" ? "Open" : "Save",
    onSubmit: onPath,
  });
}
