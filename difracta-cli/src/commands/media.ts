import { mediaKindOf, orderedEntries, type Document } from "@difracta/core";
import type { CommandResult, LiveState } from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { storedMediaPath } from "../media-paths.ts";
import { formatCommandResult, type NamedResult } from "../result.ts";
import { nameCreated } from "./run.ts";
import { formatTable } from "./read.ts";

export interface MediaListing {
  readonly id: string;
  readonly name: string;
  /** Relative to the Installation file's folder. */
  readonly path: string;
  readonly kind: "image" | "video" | undefined;
  /** From the live state; undefined before the runtime has looked. */
  readonly status: LiveState["media"][string]["status"] | undefined;
}

/** Every Media item in order, with the runtime's word on whether its file is there. */
export function listMedia(
  document: Document,
  live: LiveState["media"],
): MediaListing[] {
  return orderedEntries(document.media).map((item) => ({
    id: item.id,
    name: item.name,
    path: item.path,
    kind: mediaKindOf(item.path),
    status: live[item.id]?.status,
  }));
}

export function formatMedia(items: readonly MediaListing[]): string {
  if (items.length === 0)
    return "No Media items. `difracta media add <file>` adds one.";
  return formatTable(
    items.map((item) => [
      item.name,
      item.id,
      item.kind ?? "?",
      item.status ?? "…",
      item.path,
    ]),
  );
}

export function registerMedia(program: Command, cli: Cli): void {
  const media = program
    .command("media")
    .description(
      "Images and videos the Installation shows. A Media item is a file next to the Installation file (or elsewhere, stored as a relative path); a Visual's media Parameter names one by id.",
    );

  media
    .command("add <path>")
    .description(
      "Add an image (png, jpg, jpeg, webp, gif, svg) or video (mp4, webm, mov) file as a Media item. The path is taken from this shell and stored relative to the Installation file's folder, so the Installation must be saved.",
    )
    .option(
      "--name <name>",
      "the item's name; the file name without extension unless given",
    )
    .action((path: string, local: { name?: string }) =>
      cli.withDocument(async (client, summary) => {
        const { view } = await cli.replica(client, summary.id);
        const stored = storedMediaPath(summary, path);
        const reply = await client.command<CommandResult>(
          summary.id,
          "media.create",
          {
            path: stored,
            ...(local.name === undefined ? {} : { name: local.name }),
          },
        );
        const result: NamedResult =
          reply.created === undefined
            ? reply
            : {
                ...reply,
                created: nameCreated(
                  await cli.caughtUp(view, reply.revision),
                  reply.created,
                ),
              };
        cli.print({ path: stored, ...result }, () =>
          [
            formatCommandResult(result, "media.create"),
            `Stored as ${stored}.`,
          ].join("\n"),
        );
      }),
    );

  media
    .command("list")
    .description(
      "List the Media items: name, id, kind, status (ok, missing, outside the Installation's folder, or unsaved while the Installation has no file) and path.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const items = listMedia(document, view.liveState.get().media);
        cli.print(items, () => formatMedia(items));
      }),
    );
}
