import { relativeMediaPath } from "@difracta/core";
import type { DocumentSummary } from "@difracta/protocol";
import { dirname, resolve } from "node:path";

/**
 * A Media path typed at the shell names a file on this machine, so it is
 * resolved against the shell's working directory and stored relative to the
 * open Installation file's folder, the way the document keeps it. An
 * Installation that has no file yet has nothing for a path to be relative to.
 */
export const NO_DOCUMENT_FOLDER =
  "The open Installation has no file yet, so a Media path has nothing to be relative to. Save it first: `difracta documents save <path>`.";

/** The folder the open Installation's Media paths are relative to. */
export function documentFolder(summary: Pick<DocumentSummary, "path">): string {
  if (summary.path === null) throw new Error(NO_DOCUMENT_FOLDER);
  return dirname(summary.path);
}

/** The path to store for `typed`, a file path as typed at this shell. */
export function storedMediaPath(
  summary: Pick<DocumentSummary, "path">,
  typed: string,
  cwd = process.cwd(),
): string {
  return relativeMediaPath(resolve(cwd, typed), documentFolder(summary));
}

/** The commands whose `path` field names a file at this shell. */
const PATH_COMMANDS = new Set(["media.create", "media.path"]);

/** A command payload with its Media `path`, when it has one, made relative to the Installation's folder. */
export function relativizeMediaPayload(
  summary: Pick<DocumentSummary, "path">,
  command: string,
  payload: unknown,
  cwd = process.cwd(),
): unknown {
  if (!PATH_COMMANDS.has(command)) return payload;
  if (typeof payload !== "object" || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  if (typeof record.path !== "string") return payload;
  return { ...record, path: storedMediaPath(summary, record.path, cwd) };
}
