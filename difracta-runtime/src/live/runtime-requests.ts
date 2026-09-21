import { payloadIssues } from "@difracta/core";
import {
  RuntimeRequestSchemas,
  type RuntimeRequestName,
  type RuntimeRequestPayload,
} from "@difracta/protocol";
import type { ZodType } from "zod";

import type { DocumentStore } from "../documents/document-store.ts";
import type { ClientSession, ReplyOutcome } from "./client-session.ts";
import { pinnedRefusal } from "./documents-mode.ts";

/** What answers each of the named requests, given its validated payload. */
export type RequestHandlers<TName extends RuntimeRequestName> = {
  readonly [TKey in TName]: (
    payload: RuntimeRequestPayload<TKey>,
  ) => ReplyOutcome | Promise<ReplyOutcome>;
};

/**
 * Answers a `request`: the payload is checked against the request's schema
 * in `@difracta/protocol`, a pinned connection is refused what its mode
 * forbids, and the request's handler does the rest. A handler that throws
 * becomes a failed reply. Each feature brings its own handlers
 * (`document-requests.ts`, `catalog-requests.ts`, `display-requests.ts`);
 * the table's type makes a request without one a compile error.
 */
export class RuntimeRequests {
  readonly #store: DocumentStore;
  readonly #handlers: RequestHandlers<RuntimeRequestName>;

  constructor(
    store: DocumentStore,
    handlers: RequestHandlers<RuntimeRequestName>,
  ) {
    this.#store = store;
    this.#handlers = handlers;
  }

  /** A refusal that needs no handler is replied before this returns. */
  answer(
    session: ClientSession,
    name: string,
    payload: unknown,
    reply: (outcome: ReplyOutcome) => void,
  ): void {
    if (!Object.hasOwn(RuntimeRequestSchemas, name)) {
      reply({ ok: false, error: `Unknown request “${name}”.` });
      return;
    }
    const known = name as RuntimeRequestName;
    const schema: ZodType = RuntimeRequestSchemas[known];
    const parsed = schema.safeParse(payload ?? {});
    if (!parsed.success) {
      const issues = payloadIssues(parsed.error);
      reply({
        ok: false,
        error: `Invalid payload for “${name}”: ${issues.join("; ")}`,
        issues,
      });
      return;
    }
    const refusal =
      session.documents === "pinned"
        ? pinnedRefusal(this.#store, name, parsed.data)
        : undefined;
    if (refusal !== undefined) {
      reply({ ok: false, error: refusal });
      return;
    }
    const handler = this.#handlers[known] as (
      payload: unknown,
    ) => ReplyOutcome | Promise<ReplyOutcome>;
    void Promise.resolve(parsed.data)
      .then(handler)
      .catch((error: unknown): ReplyOutcome => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }))
      .then(reply);
  }
}
