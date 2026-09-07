import {
  DocumentSchema,
  defaultOperational,
  type Document,
} from "@difracta/core";
import { mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * The `.difracta` file: one Installation, versioned JSON with sorted keys so
 * diffs stay readable. Operational state is never written.
 *
 * A dirty document is autosaved to a sibling
 * `<name>.<timestamp>.autosave.difracta`, timestamped in ISO 8601 basic
 * format (`20260906T223933Z`) because the extended form's colons are not
 * legal in file names everywhere. At most one sidecar per file is kept.
 */
export const DOCUMENT_FILE_EXTENSION = ".difracta";
export const AUTOSAVE_EXTENSION = ".autosave.difracta";
const FILE_KIND = "difracta-installation";
const FORMAT_VERSION = 1;

const DocumentFileSchema = z
  .object({
    kind: z.literal(FILE_KIND),
    formatVersion: z.literal(FORMAT_VERSION),
    installation: DocumentSchema.shape.installation,
    outputs: DocumentSchema.shape.outputs,
  })
  .strict();

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortKeys(entry)]),
  );
}

export function serializeDocument(document: Document): string {
  const file = {
    kind: FILE_KIND,
    formatVersion: FORMAT_VERSION,
    installation: document.installation,
    outputs: document.outputs,
  };
  return `${JSON.stringify(sortKeys(file), null, 2)}\n`;
}

export type ParsedDocumentFile =
  | { readonly ok: true; readonly document: Document }
  | { readonly ok: false; readonly error: string };

export function parseDocumentFile(text: string): ParsedDocumentFile {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${String(error)}` };
  }
  const parsed = DocumentFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error:
        `Not a Difracta Installation file: ${issue?.path.join(".") ?? ""} ${issue?.message ?? ""}`.trim(),
    };
  }
  return {
    ok: true,
    document: {
      installation: parsed.data.installation as Document["installation"],
      outputs: parsed.data.outputs as Document["outputs"],
      operational: defaultOperational,
    },
  };
}

export function isAutosavePath(filePath: string): boolean {
  return filePath.endsWith(AUTOSAVE_EXTENSION);
}

export function ensureExtension(filePath: string): string {
  return filePath.endsWith(DOCUMENT_FILE_EXTENSION)
    ? filePath
    : `${filePath}${DOCUMENT_FILE_EXTENSION}`;
}

function fileStem(filePath: string): string {
  return path.basename(filePath, DOCUMENT_FILE_EXTENSION);
}

function timestampForFileName(at: Date): string {
  return at.toISOString().replace(/[-:]|\.\d{3}/g, "");
}

export function autosavePathFor(filePath: string, at = new Date()): string {
  return path.join(
    path.dirname(filePath),
    `${fileStem(filePath)}.${timestampForFileName(at)}${AUTOSAVE_EXTENSION}`,
  );
}

/** Every autosave sidecar for `filePath`, newest first by the timestamp in its name. */
export async function listAutosaves(
  filePath: string,
): Promise<readonly string[]> {
  const prefix = `${fileStem(filePath)}.`;
  let names: string[];
  try {
    names = await readdir(path.dirname(filePath));
  } catch {
    return [];
  }
  return names
    .filter(
      (name) =>
        name.startsWith(prefix) &&
        name.endsWith(AUTOSAVE_EXTENSION) &&
        /^\d{8}T\d{6}Z$/.test(
          name.slice(prefix.length, -AUTOSAVE_EXTENSION.length),
        ),
    )
    .sort()
    .reverse()
    .map((name) => path.join(path.dirname(filePath), name));
}

export async function newestAutosave(
  filePath: string,
): Promise<string | undefined> {
  return (await listAutosaves(filePath))[0];
}

/** Deletes every sidecar of `filePath` except `keep`. */
export async function removeAutosaves(
  filePath: string,
  keep?: string,
): Promise<void> {
  for (const sidecar of await listAutosaves(filePath)) {
    if (sidecar !== keep) await removeIfExists(sidecar);
  }
}

/**
 * Writes through a sibling temporary file, flushed to disk, then renamed over
 * the target. The previous file is never removed first, so a crash or power
 * loss leaves either the old file or the complete new one.
 */
export async function writeFileAtomically(
  filePath: string,
  contents: string,
): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  const handle = await open(temporary, "w");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
}

export async function removeIfExists(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function modifiedAt(
  filePath: string,
): Promise<number | undefined> {
  try {
    return (await stat(filePath)).mtimeMs;
  } catch {
    return undefined;
  }
}

/** The newest autosave sidecar when it is younger than the file itself. */
export async function newerAutosave(
  filePath: string,
): Promise<string | undefined> {
  const newest = await newestAutosave(filePath);
  if (newest === undefined) return undefined;
  const [file, sidecar] = await Promise.all([
    modifiedAt(filePath),
    modifiedAt(newest),
  ]);
  return sidecar !== undefined && (file === undefined || sidecar > file)
    ? newest
    : undefined;
}

/** True when an autosave sidecar exists and is newer than the file. */
export async function recoveryAvailable(filePath: string): Promise<boolean> {
  return (await newerAutosave(filePath)) !== undefined;
}
