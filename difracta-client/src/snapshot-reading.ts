import { DocumentSchema, emptyDocument, type Document } from "@difracta/core";
import {
  EMPTY_LIVE_STATE,
  LiveStateSchema,
  type LiveState,
} from "@difracta/protocol";

import type { DocumentView, SnapshotReading } from "./document-view.ts";

/** A part the runtime sent that this client could not read, with its first issue. */
export interface UnreadablePart {
  readonly part: string;
  readonly issue: string;
}

/** A snapshot's document or live state, read one part (a table, a live section) at a time. */
export type PartsRead<TValue> =
  | {
      readonly ok: true;
      readonly value: TValue;
      /** Parts that were sent but did not read; each holds its empty value instead. */
      readonly unreadable: readonly UnreadablePart[];
      /** Parts whose later patches are dropped: the unreadable ones and the ones this client does not know. */
      readonly skipped: ReadonlySet<string>;
    }
  | { readonly ok: false; readonly error: string };

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** The part of a Zod object schema this reading needs. */
interface PartedSchema {
  readonly shape: Readonly<
    Record<
      string,
      {
        safeParse(value: unknown):
          | { readonly success: true; readonly data: unknown }
          | {
              readonly success: false;
              readonly error: { readonly issues: readonly Issue[] };
            };
      }
    >
  >;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const firstIssue = (issues: readonly Issue[]): string => {
  const issue = issues[0];
  if (issue === undefined) return "invalid";
  const where = issue.path.map(String).join(".");
  return where === "" ? issue.message : `${where}: ${issue.message}`;
};

/**
 * Reads `raw` against `schema` part by part, so a runtime built from other
 * code than this client still reads: a part it lacks takes its value from
 * `fallback`, a part this client does not know is left out, and a part that
 * does not read takes its fallback and is named. A part without a fallback
 * must read, or the whole read fails.
 */
function readParts<TValue>(
  schema: PartedSchema,
  raw: unknown,
  fallback: Readonly<Record<string, unknown>>,
): PartsRead<TValue> {
  if (!isRecord(raw)) return { ok: false, error: "not an object" };
  const value: Record<string, unknown> = {};
  const unreadable: UnreadablePart[] = [];
  for (const [part, partSchema] of Object.entries(schema.shape)) {
    const sent = Object.hasOwn(raw, part);
    const read = sent ? partSchema.safeParse(raw[part]) : undefined;
    if (read?.success === true) {
      value[part] = read.data;
      continue;
    }
    const issue =
      read === undefined ? "missing" : firstIssue(read.error.issues);
    if (!Object.hasOwn(fallback, part))
      return { ok: false, error: `${part}: ${issue}` };
    value[part] = fallback[part];
    if (read !== undefined) unreadable.push({ part, issue });
  }
  const unknown = Object.keys(raw).filter(
    (part) => !Object.hasOwn(schema.shape, part),
  );
  return {
    ok: true,
    value: value as TValue,
    unreadable,
    skipped: new Set([...unreadable.map(({ part }) => part), ...unknown]),
  };
}

/** Every table and `operational` fall back to empty; the Installation itself must read. */
const { installation: _installation, ...documentFallback } = emptyDocument("");

/** A snapshot's document; see `readParts`. */
export function readSnapshotDocument(raw: unknown): PartsRead<Document> {
  return readParts<Document>(DocumentSchema, raw, documentFallback);
}

/** A snapshot's live state; every section falls back to empty. */
export function readSnapshotLive(raw: unknown): PartsRead<LiveState> {
  return readParts<LiveState>(LiveStateSchema, raw, EMPTY_LIVE_STATE);
}

const MISMATCH =
  "The runtime is likely built from other code than this client.";

/** What a person should hear about a snapshot this client could not read in full; undefined when it read. */
export function describeReading(reading: SnapshotReading): string | undefined {
  if (reading.failure !== undefined)
    return `This client could not read the runtime's Installation (${reading.failure}). ${MISMATCH}`;
  if (reading.unreadable.length === 0) return undefined;
  const named = reading.unreadable
    .map(({ part, issue }) => `${part} (${issue})`)
    .join(", ");
  return `This client could not read part of the runtime's Installation and shows it empty: ${named}. ${MISMATCH}`;
}

/**
 * Reads a `snapshot` message into `view`. Returns what the client should
 * report (`describeReading`) when it could not read it in full.
 */
export function receiveSnapshot(
  view: DocumentView,
  message: {
    readonly revision: number;
    readonly document: unknown;
    readonly live?: unknown;
  },
): string | undefined {
  const document = readSnapshotDocument(message.document);
  const live =
    message.live === undefined ? undefined : readSnapshotLive(message.live);
  if (!document.ok) view.refuseSnapshot(document.error);
  else if (live?.ok === false) view.refuseSnapshot(`live: ${live.error}`);
  else
    view.replaceSnapshot(document.value, message.revision, live?.value, {
      reading: {
        unreadable: [
          ...document.unreadable,
          ...(live?.unreadable ?? []).map(({ part, issue }) => ({
            part: `live/${part}`,
            issue,
          })),
        ],
      },
      skipped: document.skipped,
      liveSkipped: live?.skipped ?? new Set(),
    });
  return describeReading(view.reading.get());
}
