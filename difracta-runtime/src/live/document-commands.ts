import type { CommandResult } from "@difracta/protocol";

import type {
  DocumentSession,
  SessionCommandResult,
} from "../documents/document-session.ts";
import type { ReplyOutcome } from "./client-session.ts";

/**
 * Runs a command on the document, turning an exception inside it into a
 * failed result: a reducer that throws must not take the socket, let alone
 * the show, down with it.
 */
export function executeCommand(
  documentSession: DocumentSession,
  name: string,
  payload: unknown,
  actor: string,
  log: (message: string) => void,
): SessionCommandResult {
  try {
    return documentSession.execute(name, payload, actor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`command “${name}” threw: ${message}`);
    return {
      ok: false,
      error: `Command “${name}” failed inside the runtime: ${message}`,
    };
  }
}

/** The reply for a session result; the result keeps only the fields it has. */
export function commandOutcome(result: SessionCommandResult): ReplyOutcome {
  if (!result.ok)
    return {
      ok: false,
      error: result.error,
      ...(result.issues === undefined ? {} : { issues: [...result.issues] }),
    };
  const reply: CommandResult = {
    revision: result.revision,
    changed: result.changed,
  };
  if (result.label !== undefined) reply.label = result.label;
  if (result.warnings !== undefined) reply.warnings = [...result.warnings];
  if (result.created !== undefined) reply.created = [...result.created];
  if (result.run !== undefined) reply.run = result.run;
  return { ok: true, result: reply };
}
