import type { DocumentStore } from "../documents/document-store.ts";
import {
  addPack,
  locatePack,
  prepareProxy,
  renamePackEverywhere,
  rescanPack,
  updatePackEntry,
} from "../packs/pack-operations.ts";
import type { PackStore } from "../packs/pack-store.ts";
import type { ClientSession, ReplyOutcome } from "./client-session.ts";
import { executeCommand } from "./document-commands.ts";
import type { RequestHandlers } from "./runtime-requests.ts";

export type PackRequestName =
  | "packs.add"
  | "packs.known"
  | "packs.locate"
  | "packs.rescan"
  | "packs.rename"
  | "media.update"
  | "media.prepare";

/**
 * The Pack requests: each changes the disk or the Registry through the Pack
 * store (`packs/pack-operations.ts`), then, where the Installation keeps a
 * copy, applies the document command that follows: `packs.add` attaches the
 * new Pack, `packs.rename` renames its attachment. Whether a connection may
 * name folders at all (`packs.add`, `packs.locate`) is decided before these
 * run (`documents-mode.ts`); `media.prepare` is any connection's, an Output
 * on another machine included. Without a Pack store every request is
 * refused.
 */
export function packRequests(
  packs: PackStore | undefined,
  store: DocumentStore,
  log: (message: string) => void,
): RequestHandlers<PackRequestName> {
  if (packs === undefined) {
    const refused = (): ReplyOutcome => ({
      ok: false,
      error: "This runtime has no Pack store.",
    });
    return {
      "packs.add": refused,
      "packs.known": () => ({ ok: true, result: [] }),
      "packs.locate": refused,
      "packs.rescan": refused,
      "packs.rename": refused,
      "media.update": refused,
      "media.prepare": refused,
    };
  }
  const command = (
    session: ClientSession,
    name: string,
    payload: unknown,
  ): ReplyOutcome | undefined => {
    const documentSession = store.currentSession();
    if (documentSession === undefined) return undefined;
    const result = executeCommand(
      documentSession,
      name,
      payload,
      session.actor,
      log,
    );
    return result.ok ? undefined : { ok: false, error: result.error };
  };
  return {
    "packs.add": async ({ folder }, session) => {
      const added = await addPack(packs, folder);
      if (!added.ok) return added;
      const refused = command(session, "packs.attach", added.result);
      if (refused !== undefined) {
        packs.follow(packSource(store));
        return refused;
      }
      return {
        ok: true,
        result: { packId: added.result.packId, name: added.result.name },
      };
    },
    "packs.known": () => ({ ok: true, result: packs.known() }),
    "packs.locate": ({ packId, folder }) => locatePack(packs, packId, folder),
    "packs.rescan": ({ packId }) => rescanPack(packs, packId),
    "packs.rename": async ({ packId, name }, session) => {
      const renamed = await renamePackEverywhere(packs, packId, name);
      if (!renamed.ok) return renamed;
      if (store.currentSession()?.document.packs[packId] !== undefined) {
        const refused = command(session, "packs.rename", { packId, name });
        if (refused !== undefined) return refused;
      }
      return renamed;
    },
    "media.update": ({ packId, entryId, ...update }) =>
      updatePackEntry(packs, packId, entryId, update),
    "media.prepare": ({ packId, entryId, height }) =>
      prepareProxy(packs, packId, entryId, height),
  };
}

/** What the Pack store follows of the open Installation. */
export function packSource(store: DocumentStore) {
  const session = store.currentSession();
  return session === undefined
    ? undefined
    : { document: session.document, path: session.path };
}
