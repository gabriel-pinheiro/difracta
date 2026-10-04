import {
  BUNDLED_PACK_ID,
  isSlug,
  mediaReference,
  parseMediaReference,
  sameName,
  withoutExtension,
  type Document,
} from "@difracta/core";
import type { LiveState, PackEntryLive } from "@difracta/protocol";

/**
 * Media references at the shell. A `media` Parameter holds
 * `<packId>/<entryId>`, but a person types what they see: a Pack's name in
 * place of its id, and an entry's path inside the Pack (`clips/tunnel.mp4`,
 * with or without the extension) in place of its id. Both are resolved
 * against the `packs` live slice the replica holds and the Installation's
 * `packs` table; what leaves here is ids. A reference whose Pack the
 * runtime has not loaded (missing, or not attached) is kept as typed when
 * it is already well-formed, since the Installation may hold it on purpose.
 */
export type Packs = LiveState["packs"];

interface PackCandidate {
  readonly id: string;
  readonly name: string;
}

/** Every Pack the shell can name: the loaded ones and the attached ones, each once. */
function packCandidates(
  document: Pick<Document, "packs">,
  packs: Packs,
): PackCandidate[] {
  const byId = new Map<string, PackCandidate>();
  for (const [id, pack] of Object.entries(packs))
    byId.set(id, { id, name: pack.name });
  for (const [id, attachment] of Object.entries(document.packs))
    if (!byId.has(id)) byId.set(id, { id, name: attachment.name });
  if (!byId.has(BUNDLED_PACK_ID))
    byId.set(BUNDLED_PACK_ID, { id: BUNDLED_PACK_ID, name: "Bundled" });
  return [...byId.values()];
}

/**
 * The id of the Pack `text` names: itself when it is a Pack's id, else the
 * one Pack with that name. Several Packs with the name are an error listing
 * each with its id; none is an error too.
 */
export function resolvePackId(
  document: Pick<Document, "packs">,
  packs: Packs,
  text: string,
): string {
  const candidates = packCandidates(document, packs);
  if (candidates.some((pack) => pack.id === text)) return text;
  const matches = candidates.filter((pack) => sameName(pack.name, text));
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return only.id;
  if (matches.length > 1)
    throw new Error(
      `“${text}” matches ${String(matches.length)} Packs: ${matches
        .map((pack) => `${pack.name} (${pack.id})`)
        .join(", ")}.`,
    );
  throw new Error(
    `No Pack is called or identified “${text}”; \`difracta packs list\` shows the attached ones, \`difracta packs known\` the ones this machine knows.`,
  );
}

/** `pack.name` with its id when the two differ, for messages. */
function describePack(packs: Packs, packId: string): string {
  const name = packs[packId]?.name;
  return name === undefined || name === packId ? packId : `${name} (${packId})`;
}

/**
 * The id of the entry `text` names in a loaded Pack: itself when it is an
 * entry's id, else the one entry whose file path inside the Pack, with or
 * without its extension, is `text`, compared ignoring case. Several are an
 * error listing each; none is an error naming the Pack.
 */
function resolveEntryId(
  packs: Packs,
  packId: string,
  entries: Readonly<Record<string, PackEntryLive>>,
  text: string,
): string {
  if (text in entries) return text;
  const wanted = text.replaceAll("\\", "/").replace(/^\/+/, "");
  const matches = Object.values(entries).filter(
    (entry) =>
      sameName(entry.file, wanted) ||
      sameName(withoutExtension(entry.file), wanted),
  );
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return only.id;
  if (matches.length > 1)
    throw new Error(
      `“${text}” matches ${String(matches.length)} entries of Pack ${describePack(packs, packId)}: ${matches
        .map((entry) => `${entry.file} (${entry.id})`)
        .join(", ")}.`,
    );
  throw new Error(
    `No entry of Pack ${describePack(packs, packId)} is identified “${text}” or has that path; \`difracta media list ${packId}\` lists them.`,
  );
}

/**
 * A Pack entry reference as typed turned into `<packId>/<entryId>`: the
 * part before the first slash names the Pack, the rest the entry. A
 * reference into a Pack the runtime has not loaded is kept when both
 * halves are already slugs; `""` stays none. Text without a slash is not a
 * Pack entry reference and is returned as typed for the caller to judge.
 */
export function resolveMediaReference(
  document: Pick<Document, "packs">,
  packs: Packs,
  text: string,
): string {
  const slash = text.indexOf("/");
  if (text === "" || slash <= 0 || slash === text.length - 1) return text;
  const packId = resolvePackId(document, packs, text.slice(0, slash));
  const entryText = text.slice(slash + 1);
  const pack = packs[packId];
  if (pack === undefined || Object.keys(pack.entries).length === 0) {
    if (isSlug(entryText)) return mediaReference(packId, entryText);
    throw new Error(
      `Pack ${describePack(packs, packId)} is not loaded here, so “${entryText}” cannot be looked up by path; use the entry's id.`,
    );
  }
  return mediaReference(
    packId,
    resolveEntryId(packs, packId, pack.entries, entryText),
  );
}

/** The Pack and entry a well-formed reference names, or an error asking for one. */
export function splitReference(reference: string): {
  readonly packId: string;
  readonly entryId: string;
} {
  const parsed = parseMediaReference(reference);
  if (parsed === undefined)
    throw new Error(
      `“${reference}” is not a Pack entry reference; write <pack>/<entry>, by id or by the Pack's name and the file's path inside it.`,
    );
  return parsed;
}

/** The loaded entry a reference names, or an error saying which half is unknown. */
export function entryOf(
  packs: Packs,
  reference: string,
): { readonly packId: string; readonly entry: PackEntryLive } {
  const { packId, entryId } = splitReference(reference);
  const pack = packs[packId];
  if (pack === undefined)
    throw new Error(
      `Pack “${packId}” is not loaded by this runtime; \`difracta packs list\` shows the attached ones.`,
    );
  const entry = pack.entries[entryId];
  if (entry === undefined)
    throw new Error(
      `Pack ${describePack(packs, packId)} has no entry “${entryId}”; \`difracta media list ${packId}\` lists them.`,
    );
  return { packId, entry };
}
