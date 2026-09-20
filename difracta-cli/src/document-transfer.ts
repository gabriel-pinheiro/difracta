import { settings } from "@difracta/core";
import type { DocumentSummary } from "@difracta/protocol";
import { basename } from "node:path";

/**
 * The open Installation as a file, over the runtime's HTTP port rather than
 * the live socket: GET downloads a copy, PUT replaces its content. Both work
 * on a pinned runtime and from any machine, since no path on the runtime's
 * disk is named.
 */

/** Where the document travels, for a normalized live URL (see `url.ts`). */
export function documentUrl(liveUrl: string): string {
  const url = new URL(liveUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  const { livePath, documentPath } = settings.runtime;
  url.pathname = url.pathname.endsWith(livePath)
    ? `${url.pathname.slice(0, -livePath.length)}${documentPath}`
    : documentPath;
  return url.toString();
}

/** The file name a `Content-Disposition` header carries, never a path. */
export function dispositionFileName(header: string | null): string | undefined {
  if (header === null) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  const plain = /filename="([^"]*)"/i.exec(header)?.[1];
  let name = plain;
  if (encoded !== undefined) {
    try {
      name = decodeURIComponent(encoded);
    } catch {
      // The plain name stands in for one that does not decode.
    }
  }
  if (name === undefined) return undefined;
  const base = basename(name.replaceAll("\\", "/"));
  return base === "" || base === "." || base === ".." ? undefined : base;
}

async function send(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(
      `Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}. Is the runtime running there?`,
      { cause: error },
    );
  }
  if (response.ok) return response;
  const body = (await response.json().catch(() => undefined)) as
    { error?: unknown } | undefined;
  throw new Error(
    typeof body?.error === "string"
      ? body.error
      : `${url} answered ${String(response.status)} ${response.statusText}.`,
  );
}

export async function downloadDocument(
  liveUrl: string,
): Promise<{ readonly fileName: string; readonly text: string }> {
  const response = await send(documentUrl(liveUrl));
  return {
    fileName:
      dispositionFileName(response.headers.get("content-disposition")) ??
      "Installation.difracta",
    text: await response.text(),
  };
}

export async function replaceDocument(
  liveUrl: string,
  text: string,
  discard: boolean,
): Promise<DocumentSummary> {
  const response = await send(
    `${documentUrl(liveUrl)}${discard ? "?discard=true" : ""}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: text,
    },
  );
  return (await response.json()) as DocumentSummary;
}
