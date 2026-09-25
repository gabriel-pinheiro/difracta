import { generateId, mediaKindOf, type MediaKind } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import { useCallback, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { useDocumentCommands } from "@/documents/document-commands";
import { showWarnings, useClient } from "@/lib/client";

import { mediaKindLabels } from "./media-icons";
import { requestMediaPath } from "./media-path-request";

export interface CreateMediaOptions {
  /** The kind the caller can take; an item of the other kind is added but not handed on. */
  readonly accepts?: MediaKind | undefined;
  readonly onCreated?: ((id: string) => void) | undefined;
}

/**
 * Adds a Media item from wherever a "+" for one sits: the Media section, a
 * Layer's media row, a Macro action's. In Desktop the native picker opens
 * straight away and the item is named after the file by `media.create`; in
 * a browser the path is typed into `dialog`, which the caller renders. With
 * `accepts`, a file of the other kind is added all the same but not handed
 * on, since the Parameter would refuse it, and a toast says so.
 */
export function useCreateMedia(): {
  readonly create: (options?: CreateMediaOptions) => void;
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
            })
            .then(
              (result) => {
                showWarnings(result.warnings ?? []);
                const kind = mediaKindOf(path);
                const accepts = options?.accepts;
                if (
                  accepts !== undefined &&
                  kind !== undefined &&
                  kind !== accepts
                ) {
                  toast.message(
                    `Added ${mediaKindLabels[kind]} “${path}” to Media; this Parameter takes ${accepts === "image" ? "an Image" : "a Video"}.`,
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
  return {
    create,
    dialog: (
      <NameDialog request={request} onClose={() => setRequest(undefined)} />
    ),
  };
}
