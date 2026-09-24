import type { DocumentStore } from "../documents/document-store.ts";
import type { RequestHandlers } from "./runtime-requests.ts";

/**
 * The requests that manage which document the runtime has open. Whether the
 * connection may make them at all is decided before they get here
 * (`documents-mode.ts`).
 */
export function documentRequests(
  store: DocumentStore,
): RequestHandlers<
  | "documents.new"
  | "documents.open"
  | "documents.save"
  | "documents.revert"
  | "documents.close"
> {
  return {
    "documents.new": ({ name, discard, blank }) =>
      store.create(name, {
        discard: discard ?? false,
        blank: blank ?? false,
      }),
    "documents.open": ({ path, discard }) => store.open(path, discard ?? false),
    "documents.save": ({ documentId, path }) => store.save(documentId, path),
    "documents.revert": ({ documentId }) => store.revert(documentId),
    "documents.close": ({ documentId, discard }) =>
      store.close(documentId, discard ?? false),
  };
}
