import type { NameRequest } from "@/components/name-dialog";
import { desktopBridge } from "@/documents/desktop-bridge";

/**
 * How Studio names a Pack's folder on the runtime's machine. Inside
 * Difracta Desktop that is the native folder picker. In a browser on a free
 * runtime there is no such dialog for a folder on disk, so the absolute path
 * is typed into the name dialog. `folderGate` says whether either is
 * allowed here; this assumes it is.
 */
export function requestPackFolder(options: {
  readonly purpose: "add" | "locate";
  /** The Pack to locate, named in the dialog. */
  readonly packName?: string | undefined;
  /** Shows the typed-path dialog when there is no native one. */
  readonly showDialog: (request: NameRequest) => void;
  readonly onFolder: (folder: string) => void;
}): void {
  const { purpose, packName, onFolder } = options;
  const desktop = desktopBridge();
  if (desktop !== undefined) {
    void desktop.pickPackFolder().then((folder) => {
      if (folder !== null) onFolder(folder);
    });
    return;
  }
  options.showDialog({
    title:
      purpose === "add"
        ? "Add Pack from folder"
        : `Locate Pack “${packName ?? ""}”`,
    label: "Absolute path of the folder, on the runtime's machine",
    initial: "",
    submitLabel: purpose === "add" ? "Add" : "Locate",
    onSubmit: onFolder,
  });
}
