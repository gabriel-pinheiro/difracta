import type { DocumentSummary } from "@difracta/protocol";
import type { Command } from "commander";
import { resolve } from "node:path";

import type { Cli } from "../cli.ts";

export function registerDocuments(program: Command, cli: Cli): void {
  const documents = program
    .command("documents")
    .description(
      "Save and revert the Installation on the runtime. new, open, close and save to another path need a runtime started with --documents free, on this machine; a pinned runtime refuses them.",
    );

  documents
    .command("new <name>")
    .description("Replace the open Installation with a new, unsaved one.")
    .option("--discard", "drop unsaved changes of the current one", false)
    .action((name: string, local: { discard: boolean }) =>
      cli.withClient(async (client) => {
        const summary = await client.request<DocumentSummary>("documents.new", {
          name,
          discard: local.discard,
        });
        cli.print(summary, () => `Created ${summary.name} (${summary.id}).`);
      }),
    );

  documents
    .command("open <path>")
    .description(
      "Open a .difracta file on the runtime's machine, replacing the current Installation. A relative path resolves against this shell's directory.",
    )
    .option("--discard", "drop unsaved changes of the current one", false)
    .action((path: string, local: { discard: boolean }) =>
      cli.withClient(async (client) => {
        const summary = await client.request<DocumentSummary>(
          "documents.open",
          { path: resolve(path), discard: local.discard },
        );
        cli.print(
          summary,
          () =>
            `Opened ${summary.name} (${summary.id}) from ${summary.path ?? "?"}.${
              summary.recovered
                ? " Recovered unsaved changes from an autosave."
                : ""
            }`,
        );
      }),
    );

  documents
    .command("revert")
    .description("Reload the Installation as last saved, dropping autosaves.")
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const reverted = await client.request<DocumentSummary>(
          "documents.revert",
          { documentId: summary.id },
        );
        cli.print(
          reverted,
          () => `Reverted ${reverted.name} to ${reverted.path ?? "?"}.`,
        );
      }),
    );

  documents
    .command("save [path]")
    .description(
      "Save the Installation, optionally to a new path (relative to this shell's directory).",
    )
    .action((path: string | undefined) =>
      cli.withDocument(async (client, summary) => {
        const saved = await client.request<DocumentSummary>(
          "documents.save",
          path === undefined
            ? { documentId: summary.id }
            : { documentId: summary.id, path: resolve(path) },
        );
        cli.print(saved, () => `Saved ${saved.name} to ${saved.path ?? "?"}.`);
      }),
    );

  documents
    .command("close")
    .description("Close the Installation.")
    .option("--discard", "close even with unsaved changes", false)
    .action((local: { discard: boolean }) =>
      cli.withDocument(async (client, summary) => {
        await client.request("documents.close", {
          documentId: summary.id,
          discard: local.discard,
        });
        cli.print({ closed: summary.id }, () => `Closed ${summary.name}.`);
      }),
    );
}
