import type { DocumentSummary } from "@difracta/protocol";
import type { Command } from "commander";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { Cli } from "../cli.ts";
import { downloadDocument, replaceDocument } from "../document-transfer.ts";
import { normalizeUrl } from "../url.ts";

export function registerDocuments(program: Command, cli: Cli): void {
  const documents = program
    .command("documents")
    .description(
      "Save, revert, download and replace the Installation on the runtime. new, open, close and save to another path need a runtime started with --documents free, on this machine; a pinned runtime refuses them.",
    );

  documents
    .command("new <name>")
    .description(
      "Replace the open Installation with a new, unsaved one: the starter, with Output 1, a Full Frame Surface on it and Scene 1, whose one Visual Layer shows Zoom Rush on that Surface.",
    )
    .option("--discard", "drop unsaved changes of the current one", false)
    .option(
      "--blank",
      "start with no entities instead of the starter Output, Surface, Scene and Layer",
      false,
    )
    .action((name: string, local: { discard: boolean; blank: boolean }) =>
      cli.withClient(async (client) => {
        const summary = await client.request<DocumentSummary>("documents.new", {
          name,
          discard: local.discard,
          blank: local.blank,
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

  documents
    .command("download [path]")
    .description(
      "Write a copy of the open Installation, unsaved changes included, to a .difracta file on this machine: a backup. Without a path it lands in this shell's directory under the runtime's file name; a folder works too. Works on a pinned runtime and from any machine.",
    )
    .option("--force", "overwrite an existing file", false)
    .action(async (path: string | undefined, local: { force: boolean }) => {
      const { fileName, text } = await downloadDocument(
        normalizeUrl(cli.options().url),
      );
      const given = resolve(path ?? fileName);
      const isFolder = await stat(given).then(
        (entry) => entry.isDirectory(),
        () => false,
      );
      const target = isFolder ? join(given, fileName) : given;
      try {
        await writeFile(target, text, { flag: local.force ? "w" : "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        throw new Error(`${target} exists; pass --force to overwrite it.`, {
          cause: error,
        });
      }
      cli.print(
        { path: target, bytes: Buffer.byteLength(text) },
        () => `Downloaded a copy to ${target}.`,
      );
    });

  documents
    .command("replace <file>")
    .description(
      'Replace the open Installation\'s content with a .difracta file from this machine. The Installation keeps its path and has unsaved changes afterwards; nothing is written until "documents save", and "documents revert" brings the saved one back. Works on a pinned runtime and from any machine.',
    )
    .option("--discard", "drop unsaved changes of the current one", false)
    .action(async (file: string, local: { discard: boolean }) => {
      const text = await readFile(resolve(file), "utf8");
      const summary = await replaceDocument(
        normalizeUrl(cli.options().url),
        text,
        local.discard,
      );
      cli.print(
        summary,
        () =>
          `Replaced with ${summary.name} (${summary.id}) from ${file}; unsaved until "documents save".`,
      );
    });
}
