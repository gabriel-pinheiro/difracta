import { generateId, mediaTypeOf, type MediaType } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { useDocumentCommands } from "@/documents/document-commands";
import { catalog } from "@/lib/catalog";
import { showWarnings, useClient } from "@/lib/client";
import { firstMedia } from "@/library/media-search";

import { mediaTypeLabels } from "./media-icons";
import { requestMediaPath } from "./media-path-request";

export interface CreateMediaOptions {
  /** The type the caller can take; a file of the other type is added but not handed on. */
  readonly accepts?: MediaType | undefined;
  /** The Media Group to add into; the root when absent. */
  readonly parentId?: string | null | undefined;
  readonly onCreated?: ((id: string) => void) | undefined;
}

/** Why "Bundled…" is disabled: this build of Difracta has no Bundled Media. */
export const NO_BUNDLED_MEDIA =
  "No Bundled Media in this build: npm run media:fetch puts them in place.";

/** Whether the Catalog has Bundled Media (of the accepted type) to start a bundled item on. */
export function hasBundledMedia(accepts?: MediaType): boolean {
  return firstMedia(catalog.media(), accepts) !== undefined;
}

/**
 * Adds a Media file or a bundled item from wherever a "+" for one sits: the
 * Media section or a Media Group's row (into that Group), a Layer's media
 * row, a Macro action's. For a file, in Desktop the native picker opens
 * straight away and the item is named after the file by `media.create`; in
 * a browser the path is typed into `dialog`, which the caller renders. With
 * `accepts`, a file of the other type is added all the same but not handed
 * on, since the Parameter would refuse it, and a toast says so. A bundled
 * item starts on an entry of the accepted type, so it is always handed on.
 */
export function useCreateMedia(): {
  readonly create: (options?: CreateMediaOptions) => void;
  readonly createBundled: (options?: CreateMediaOptions) => void;
  readonly dialog: ReactNode;
} {
  const client = useClient();
  const { selected, view } = useDocumentCommands();
  const documentPath = selected?.path ?? null;
  const [request, setRequest] = useState<NameRequest | undefined>(undefined);
  const create = useCallback(
    (options?: CreateMediaOptions) => {
      if (view === undefined) return;
      requestMediaPath({
        purpose: "add",
        documentPath,
        showDialog: setRequest,
        onPath: (path) => {
          const id = generateId("media");
          client
            .command<CommandResult>(view.documentId, "media.create", {
              id,
              path,
              parentId: options?.parentId ?? null,
            })
            .then(
              (result) => {
                showWarnings(result.warnings ?? []);
                const type = mediaTypeOf(path);
                const accepts = options?.accepts;
                if (
                  accepts !== undefined &&
                  type !== undefined &&
                  type !== accepts
                ) {
                  toast.message(
                    `Added ${mediaTypeLabels[type]} “${path}” to Media; this Parameter takes ${accepts === "image" ? "an Image" : "a Video"}.`,
                  );
                  return;
                }
                options?.onCreated?.(id);
              },
              (failure: unknown) => {
                toast.error(
                  failure instanceof Error ? failure.message : String(failure),
                );
              },
            );
        },
      });
    },
    [client, view, documentPath],
  );
  /**
   * Adds a bundled item on the first entry the Library would show (of the
   * accepted type), named after it, so the Library can open on it at once.
   */
  const createBundled = useCallback(
    (options?: CreateMediaOptions) => {
      if (view === undefined) return;
      const entry = firstMedia(catalog.media(), options?.accepts);
      if (entry === undefined) {
        toast.error(NO_BUNDLED_MEDIA);
        return;
      }
      const id = generateId("media");
      client
        .command<CommandResult>(view.documentId, "media.create", {
          id,
          kind: "bundled",
          bundled: entry.id,
          parentId: options?.parentId ?? null,
        })
        .then(
          (result) => {
            showWarnings(result.warnings ?? []);
            options?.onCreated?.(id);
          },
          (failure: unknown) => {
            toast.error(
              failure instanceof Error ? failure.message : String(failure),
            );
          },
        );
    },
    [client, view],
  );
  return {
    create,
    createBundled,
    dialog: (
      <NameDialog request={request} onClose={() => setRequest(undefined)} />
    ),
  };
}
