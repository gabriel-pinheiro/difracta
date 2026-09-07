import type { DocumentView } from "@difracta/client";
import type { DocumentSummary, FileEntry } from "@difracta/protocol";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { useClient, useSignal } from "@/lib/client";

import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { OpenFileDialog } from "./open-file-dialog";

/**
 * Every document-level action Studio exposes (menu items, shortcuts): new,
 * open, save, save as, revert, close, undo, redo. Owns the dialogs those
 * actions need and reports failures as toasts. The runtime holds one
 * Installation; `selected` is its summary and `view` its live document,
 * opened with live state so the Outputs monitor sees sessions.
 */
export interface DocumentCommands {
  readonly selected: DocumentSummary | undefined;
  readonly view: DocumentView | undefined;
  readonly create: () => void;
  readonly open: () => void;
  readonly save: () => void;
  readonly saveAs: () => void;
  readonly revert: () => void;
  readonly close: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

const Context = createContext<DocumentCommands | undefined>(undefined);

type Dialog =
  | { kind: "name"; request: NameRequest }
  | { kind: "confirm"; request: ConfirmRequest }
  | { kind: "open" };

export function DocumentCommandsProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const client = useClient();
  const selected = useSignal(client.document) ?? undefined;
  const [dialog, setDialog] = useState<Dialog | undefined>(undefined);

  const commands = useMemo<DocumentCommands>(() => {
    const run = (action: () => Promise<unknown>): void => {
      void action().catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
    };
    const saveTo = (documentId: string, path?: string): void =>
      run(() =>
        client.request(
          "documents.save",
          path === undefined ? { documentId } : { documentId, path },
        ),
      );
    const closeDocument = (documentId: string, discard: boolean): void =>
      run(() => client.request("documents.close", { documentId, discard }));
    /** Runs `proceed` at once, or after confirming that unsaved changes may go. */
    const afterDiscardCheck = (
      what: string,
      proceed: (discard: boolean) => void,
    ): void => {
      if (selected?.dirty !== true) {
        proceed(false);
        return;
      }
      setDialog({
        kind: "confirm",
        request: {
          title: "Discard unsaved changes?",
          description: `“${selected.name}” has changes that were not saved. ${what} replaces it.`,
          actionLabel: "Discard and continue",
          onConfirm: () => proceed(true),
        },
      });
    };
    const history = (name: "history.undo" | "history.redo"): void => {
      if (selected === undefined) return;
      void client.command(selected.id, name, {}).catch(() => undefined);
    };

    return {
      selected,
      view:
        selected === undefined
          ? undefined
          : client.openDocument(selected.id, { live: true }),
      create: () =>
        afterDiscardCheck("A new Installation", (discard) =>
          setDialog({
            kind: "name",
            request: {
              title: "New Installation",
              label: "Name",
              initial: "Untitled",
              submitLabel: "Create",
              onSubmit: (name) =>
                run(() => client.request("documents.new", { name, discard })),
            },
          }),
        ),
      open: () =>
        afterDiscardCheck("Opening another Installation", () =>
          setDialog({ kind: "open" }),
        ),
      save: () => {
        if (selected === undefined) return;
        if (selected.path === null) commands.saveAs();
        else saveTo(selected.id);
      },
      saveAs: () => {
        if (selected === undefined) return;
        setDialog({
          kind: "name",
          request: {
            title: "Save Installation As",
            label: "File name, inside the runtime's projects folder",
            initial: selected.name,
            submitLabel: "Save",
            onSubmit: (path) => saveTo(selected.id, path),
          },
        });
      },
      revert: () => {
        if (selected === undefined) return;
        if (selected.path === null) return;
        setDialog({
          kind: "confirm",
          request: {
            title: "Revert to saved?",
            description:
              "Unsaved changes are discarded and the file is reloaded as last saved.",
            actionLabel: "Revert",
            onConfirm: () =>
              run(() =>
                client.request("documents.revert", { documentId: selected.id }),
              ),
          },
        });
      },
      close: () => {
        if (selected === undefined) return;
        if (!selected.dirty) {
          closeDocument(selected.id, false);
          return;
        }
        setDialog({
          kind: "confirm",
          request: {
            title: "Discard unsaved changes?",
            description: `“${selected.name}” has changes that were not saved.`,
            actionLabel: "Discard and close",
            onConfirm: () => closeDocument(selected.id, true),
          },
        });
      },
      undo: () => history("history.undo"),
      redo: () => history("history.redo"),
    };
  }, [client, selected]);

  function openFile(entry: FileEntry): void {
    setDialog(undefined);
    // The discard check ran before the dialog opened.
    void client
      .request("documents.open", {
        path: entry.path,
        discard: selected?.dirty === true,
      })
      .catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      });
  }

  const closeDialog = (): void => setDialog(undefined);
  return (
    <Context.Provider value={commands}>
      {children}
      <NameDialog
        request={dialog?.kind === "name" ? dialog.request : undefined}
        onClose={closeDialog}
      />
      <ConfirmDialog
        request={dialog?.kind === "confirm" ? dialog.request : undefined}
        onClose={closeDialog}
      />
      <OpenFileDialog
        open={dialog?.kind === "open"}
        currentPath={selected?.path ?? null}
        onOpen={openFile}
        onClose={closeDialog}
      />
    </Context.Provider>
  );
}

export function useDocumentCommands(): DocumentCommands {
  const commands = useContext(Context);
  if (commands === undefined)
    throw new Error("useDocumentCommands needs a DocumentCommandsProvider.");
  return commands;
}
