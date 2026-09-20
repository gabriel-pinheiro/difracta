import type { NameRequest } from "@/components/name-dialog";

/**
 * How Studio names a file on the runtime's machine: the absolute path, typed
 * into the name dialog. The runtime refuses a relative one and adds the
 * `.difracta` extension when it is missing.
 */
export function filePathRequest(
  purpose: "open" | "save",
  currentPath: string | null,
  onSubmit: (path: string) => void,
): NameRequest {
  return {
    title: purpose === "open" ? "Open Installation" : "Save Installation As",
    label: "Absolute path of the .difracta file, on the runtime's machine",
    initial: currentPath ?? "",
    submitLabel: purpose === "open" ? "Open" : "Save",
    onSubmit,
  };
}
