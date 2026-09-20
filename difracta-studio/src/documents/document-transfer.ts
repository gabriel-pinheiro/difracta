import { settings } from "@difracta/core";

/**
 * The open Installation as a file, over the runtime's HTTP port: the browser
 * downloads a copy natively, and a file picked on this machine replaces the
 * document's content. No path on the runtime's disk is involved, so both work
 * on a pinned connection.
 */

/** Starts the browser's own download; the runtime names the file. */
export function downloadCopy(): void {
  const link = document.createElement("a");
  link.href = settings.runtime.documentPath;
  link.download = "";
  link.click();
}

/** Asks for one `.difracta` file on this machine; undefined when the picker is dismissed. */
export function pickDocumentFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".difracta,application/json";
    input.addEventListener("change", () => resolve(input.files?.[0]));
    input.addEventListener("cancel", () => resolve(undefined));
    input.click();
  });
}

/** Sends the file's text; a refusal rejects with the runtime's own words. */
export async function replaceFromFile(
  file: File,
  discard: boolean,
): Promise<void> {
  const response = await fetch(
    `${settings.runtime.documentPath}${discard ? "?discard=true" : ""}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: await file.text(),
    },
  );
  if (response.ok) return;
  const body = (await response.json().catch(() => undefined)) as
    { error?: unknown } | undefined;
  throw new Error(
    typeof body?.error === "string"
      ? body.error
      : `The runtime answered ${String(response.status)} ${response.statusText}.`,
  );
}
