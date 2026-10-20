import type { DocumentView } from "@difracta/client";
import type { Output, Slice, Table } from "@difracta/core";

import { useDocumentPath } from "@/lib/client";

import { knownFrameSize } from "./output-frame";
import { primarySession, sessionList, type SessionTable } from "./output-live";

/** Frame shape assumed until an Output Session reports its real resolution. */
export const DEFAULT_ASPECT = 16 / 9;

/**
 * The Output's Projection Frame shape: from its Slices when it has some,
 * else from the session that reports its resolution, else its Display size.
 */
export function useOutputAspect(view: DocumentView, outputId: string): number {
  const sessions = useDocumentPath<SessionTable>(view, [
    "live",
    "outputs",
    outputId,
    "sessions",
  ]);
  const output = useDocumentPath<Output>(view, ["outputs", outputId]);
  const slices = useDocumentPath<Table<Slice>>(view, ["slices"]) ?? {};
  const telemetry = primarySession(sessionList(sessions))?.telemetry;
  const size = knownFrameSize(output, slices, telemetry ?? undefined);
  return size === undefined ? DEFAULT_ASPECT : size.width / size.height;
}
