import type { DifractaClient, DocumentView } from "@difracta/client";
import { settings, type Document } from "@difracta/core";
import type { DocumentSummary } from "@difracta/protocol";
import type { Command } from "commander";

import { connect, currentDocument } from "./connection.ts";
import { normalizeUrl } from "./url.ts";

export interface GlobalOptions {
  readonly url: string;
  readonly json: boolean;
}

/** The open Installation's replica, with the live state around it. */
export interface Replica {
  readonly document: Document;
  readonly view: DocumentView;
}

/**
 * What every subcommand shares: the global options, one connection per
 * invocation, and printing that switches to JSON under `--json`.
 */
export class Cli {
  readonly #program: Command;

  constructor(program: Command) {
    this.#program = program;
  }

  options(): GlobalOptions {
    return this.#program.opts<GlobalOptions>();
  }

  print(value: unknown, human: () => string): void {
    console.log(this.options().json ? JSON.stringify(value, null, 2) : human());
  }

  async withClient<TResult>(
    action: (client: DifractaClient) => Promise<TResult>,
  ): Promise<TResult> {
    const client = await connect(normalizeUrl(this.options().url));
    try {
      return await action(client);
    } finally {
      client.close();
    }
  }

  withDocument<TResult>(
    action: (
      client: DifractaClient,
      summary: DocumentSummary,
    ) => Promise<TResult>,
  ): Promise<TResult> {
    return this.withClient((client) => action(client, currentDocument(client)));
  }

  /**
   * The replica once it holds `revision`, so a reply can be read against
   * the change it made; after the catch-up timeout, whatever it holds.
   */
  caughtUp(
    view: DocumentView,
    revision: number,
  ): Promise<Document | undefined> {
    return new Promise((resolve) => {
      if (view.revision.get() >= revision) {
        resolve(view.get());
        return;
      }
      const done = (): void => {
        clearTimeout(timer);
        unsubscribe();
        resolve(view.get());
      };
      const timer = setTimeout(done, settings.cli.replicaCatchUpTimeoutMs);
      const unsubscribe = view.revision.subscribe((current) => {
        if (current >= revision) done();
      });
    });
  }

  /** Subscribes with live state and resolves once the snapshot has landed. */
  replica(client: DifractaClient, documentId: string): Promise<Replica> {
    const view = client.openDocument(documentId, { live: true });
    return new Promise((resolve) => {
      const current = view.get();
      if (current !== undefined) {
        resolve({ document: current, view });
        return;
      }
      const unsubscribe = view.document.subscribe((document) => {
        if (document === undefined) return;
        unsubscribe();
        resolve({ document, view });
      });
    });
  }
}
