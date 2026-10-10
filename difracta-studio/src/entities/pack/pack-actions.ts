import type { DocumentView } from "@difracta/client";
import { settings } from "@difracta/core";
import type { KnownPack } from "@difracta/protocol";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { desktopBridge } from "@/documents/desktop-bridge";
import { useDocumentCommands } from "@/documents/document-commands";
import { useClient, useCommand } from "@/lib/client";
import { useBrowser } from "@/library/browser-state";
import { useRemoveEntity } from "@/selection/remove-selection";
import { useSelection } from "@/selection/selection";

import { requestPackFolder } from "./pack-folder-request";
import { folderGate } from "./pack-gate";

/**
 * Everything a person does to a Pack from Studio, wherever the button sits
 * (the Media section's "+", a row's menu, the Pack's inspector, a media
 * chip): add one from a folder, attach one the runtime's machine knows,
 * locate one after moving it, rescan, rename, detach, which asks first as every
 * Remove of a Pack does. `gate` is why naming a folder is refused here, or undefined
 * when it is allowed. Requests go to the runtime; failures are toasts.
 */
export interface PackActions {
  readonly gate: string | undefined;
  readonly addFromFolder: () => void;
  readonly attachKnown: (pack: KnownPack) => void;
  readonly locate: (packId: string, name: string) => void;
  readonly rescan: (packId: string) => void;
  readonly rename: (packId: string, name: string) => void;
  /** Asks, counting what uses the Pack, then detaches it. */
  readonly detach: (packId: string) => void;
}

/**
 * Resolves once `view` holds the attachment of `packId`: the runtime's
 * reply to a request that attached it can arrive before the document delta
 * does, so what follows waits for the replica rather than the reply. A
 * delta that never comes resolves after a short wait all the same.
 */
function whenAttached(view: DocumentView, packId: string): Promise<void> {
  if (view.valueAt(["packs", packId]) !== undefined) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => {
      unsubscribe();
      clearTimeout(timer);
      resolve();
    };
    const unsubscribe = view.subscribePath(["packs", packId], () => {
      if (view.valueAt(["packs", packId]) !== undefined) done();
    });
    // The same wait the CLI gives its own replica before naming what it made.
    const timer = setTimeout(done, settings.cli.replicaCatchUpTimeoutMs);
  });
}

export function usePackActions(view: DocumentView): PackActions {
  const client = useClient();
  const command = useCommand(view);
  const { free, askName } = useDocumentCommands();
  const { openPack } = useBrowser();
  const { select } = useSelection();
  const removeEntity = useRemoveEntity();
  const gate = folderGate(desktopBridge() !== undefined, free);

  const failing = useCallback((action: () => Promise<unknown>): void => {
    void action().catch((failure: unknown) => {
      toast.error(failure instanceof Error ? failure.message : String(failure));
    });
  }, []);
  /** Selects a Pack and opens the Library on it, once the Installation has it. */
  const show = useCallback(
    (packId: string): void => {
      void whenAttached(view, packId).then(() => {
        select({ kind: "pack", id: packId });
        openPack(packId);
      });
    },
    [view, select, openPack],
  );

  return useMemo<PackActions>(
    () => ({
      gate,
      addFromFolder: () => {
        if (gate !== undefined) return;
        requestPackFolder({
          purpose: "add",
          showDialog: askName,
          onFolder: (folder) =>
            failing(async () => {
              const { packId, name } = await client.request<{
                packId: string;
                name: string;
              }>("packs.add", { folder });
              toast.success(`Added Pack “${name}”.`);
              show(packId);
            }),
        });
      },
      attachKnown: (pack) =>
        void command("packs.attach", { packId: pack.id, name: pack.name }).then(
          () => show(pack.id),
        ),
      locate: (packId, name) => {
        if (gate !== undefined) return;
        requestPackFolder({
          purpose: "locate",
          packName: name,
          showDialog: askName,
          onFolder: (folder) =>
            failing(() => client.request("packs.locate", { packId, folder })),
        });
      },
      rescan: (packId) =>
        failing(() => client.request("packs.rescan", { packId })),
      rename: (packId, name) =>
        failing(() => client.request("packs.rename", { packId, name })),
      detach: (packId) => removeEntity("pack", packId),
    }),
    [gate, askName, failing, client, show, command, removeEntity],
  );
}
