import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { formatLiveStatus, liveStatus } from "../live-status.ts";

export function registerStatus(program: Command, cli: Cli): void {
  program
    .command("health")
    .description(
      "Show the runtime, its document mode (pinned or free), its open Installation (and whether it has unsaved changes), every Output's Sessions and the OSC door.",
    )
    .action(() =>
      cli.withClient(async (client) => {
        const sessionId = client.sessionId.get();
        const documents = client.documents.get();
        const connected = `Connected as ${sessionId ?? "?"}  documents ${documents ?? "?"}`;
        const summary = client.document.get();
        if (summary === null) {
          cli.print(
            { sessionId, documents, document: null, live: null },
            () => `${connected}\n  No Installation is open.`,
          );
          return;
        }
        const { document, view } = await cli.replica(client, summary.id);
        const live = liveStatus(document, view.liveState.get());
        cli.print({ sessionId, documents, document: summary, live }, () =>
          [
            connected,
            `  ${summary.name}  ${summary.id}  ${summary.path ?? "(unsaved)"}${summary.dirty ? "  unsaved changes" : ""}  revision ${String(summary.revision)}`,
            ...formatLiveStatus(live).map((line) => `  ${line}`),
          ].join("\n"),
        );
      }),
    );

  program
    .command("outputs")
    .description(
      "List the Outputs with their Output Sessions: connected or stale, fps, render time, resolution, Layers that failed.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const live = liveStatus(document, view.liveState.get());
        cli.print(live, () => formatLiveStatus(live).join("\n"));
      }),
    );
}
