import type { DocumentView } from "@difracta/client";

import { useDocumentPath } from "@/lib/client";

import { primarySession, sessionList, type SessionTable } from "./output-live";

/** Frame shape assumed until an Output Session reports its real resolution. */
export const DEFAULT_ASPECT = 16 / 9;

/** The Output's Projection Frame shape, from the session that reports its resolution. */
export function useOutputAspect(view: DocumentView, outputId: string): number {
  const sessions = useDocumentPath<SessionTable>(view, [
    "live",
    "outputs",
    outputId,
    "sessions",
  ]);
  const telemetry = primarySession(sessionList(sessions))?.telemetry;
  return telemetry === undefined || telemetry === null
    ? DEFAULT_ASPECT
    : telemetry.width / telemetry.height;
}
