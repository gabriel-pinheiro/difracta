import type { DocumentsMode } from "@difracta/protocol";

import type { DocumentStore } from "../documents/document-store.ts";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/**
 * The document mode one connection gets. A free runtime is free only for
 * clients on its own machine: paths in `documents.open` and `documents.save`
 * name files on the runtime's disk, which a peer elsewhere on the network
 * has no business browsing or writing.
 */
export function documentsModeFor(
  runtime: DocumentsMode,
  remoteAddress: string | undefined,
): DocumentsMode {
  if (runtime === "pinned") return "pinned";
  return remoteAddress !== undefined && LOOPBACK.has(remoteAddress)
    ? "free"
    : "pinned";
}

/**
 * Why a pinned connection may not make this request, or undefined when it
 * may. Saving to the path the document already has is an ordinary save.
 */
export function pinnedRefusal(
  store: DocumentStore,
  name: string,
  payload: unknown,
): string | undefined {
  switch (name) {
    case "documents.new":
    case "documents.open":
    case "documents.close":
      return `This runtime is pinned to its Installation; “${name}” is only available to clients on the machine of a runtime started with --documents free.`;
    case "documents.save": {
      const { path } = payload as { path?: string };
      if (path === undefined) return undefined;
      const resolved = store.resolvePath(path);
      const current = store.currentSession()?.path ?? null;
      if (resolved.ok && resolved.result === current) return undefined;
      return "This runtime is pinned to its Installation; saving to another path is only available to clients on the machine of a runtime started with --documents free.";
    }
    default:
      return undefined;
  }
}
