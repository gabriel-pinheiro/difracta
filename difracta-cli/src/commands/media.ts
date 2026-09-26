import {
  emptyCatalog,
  flattenMedia,
  mediaItemTypeIn,
  type Catalog,
  type Document,
  type MediaKind,
  type MediaType,
} from "@difracta/core";
import type { DifractaClient } from "@difracta/client";
import type {
  CommandResult,
  DocumentSummary,
  LiveState,
} from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { storedMediaPath } from "../media-paths.ts";
import { resolveId } from "../names.ts";
import { formatCommandResult, type NamedResult } from "../result.ts";
import { registerMediaBundled, resolveBundled } from "./media-bundled.ts";
import { nameCreated } from "./run.ts";
import { formatTable } from "./read.ts";

export interface MediaListing {
  readonly id: string;
  readonly name: string;
  readonly kind: MediaKind;
  /** The Group holding the item, or null at the root. */
  readonly parentId: string | null;
  /** How many Groups the item is inside. */
  readonly depth: number;
  /** A file's, relative to the Installation file's folder; null for a Group and a bundled item. */
  readonly path: string | null;
  /** A bundled item's Bundled Media entry id; null for a file and a Group. */
  readonly bundled: string | null;
  /**
   * From the file's extension or the bundled entry; null for a Group,
   * undefined for a file Difracta cannot show or an entry the runtime lacks.
   */
  readonly type: MediaType | null | undefined;
  /** From the live state; undefined before the runtime has looked, and for a Group. */
  readonly status: LiveState["media"][string]["status"] | undefined;
}

/**
 * Every Media item in navigator order, Groups first-class, with the
 * runtime's word on whether each file is there; `catalog` gives bundled
 * items their type.
 */
export function listMedia(
  document: Pick<Document, "media">,
  live: LiveState["media"],
  catalog: Catalog = emptyCatalog,
): MediaListing[] {
  const depthOf = (parentId: string | null): number => {
    let depth = 0;
    for (
      let at = parentId;
      at !== null;
      at = document.media[at]?.parentId ?? null
    )
      depth += 1;
    return depth;
  };
  return flattenMedia(document.media).map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    parentId: item.parentId,
    depth: depthOf(item.parentId),
    path: item.kind === "file" ? item.path : null,
    bundled: item.kind === "bundled" ? item.bundled : null,
    type: item.kind === "group" ? null : mediaItemTypeIn(item, catalog),
    status: item.kind === "group" ? undefined : live[item.id]?.status,
  }));
}

/** One row per item, names indented by Group: name, id, kind, type, status, path or bundle entry. */
export function formatMedia(items: readonly MediaListing[]): string {
  if (items.length === 0)
    return "No Media items. `difracta media add <file>` adds one.";
  return formatTable(
    items.map((item) => [
      `${"  ".repeat(item.depth)}${item.name}`,
      item.id,
      item.kind,
      item.kind === "group" ? "" : (item.type ?? "?"),
      item.kind === "group" ? "" : (item.status ?? "…"),
      item.path ?? item.bundled ?? "",
    ]),
  );
}

/** The Media Group `reference` names, by id or name among every item; anything else is an error. */
export function mediaGroupId(document: Document, reference: string): string {
  const id = resolveId(document, "media", reference);
  const item = document.media[id];
  if (item?.kind !== "group")
    throw new Error(`“${item?.name ?? reference}” is not a Media Group.`);
  return id;
}

const GROUP_OPTION = [
  "--group <group>",
  "the Media Group to add into, by name or id; the root unless given",
] as const;

export function registerMedia(program: Command, cli: Cli): void {
  const media = program
    .command("media")
    .description(
      "Images and videos the Installation shows, arranged in Media Groups. A Media item of kind file is a file next to the Installation file (or elsewhere, stored as a relative path), of type image or video by its extension; one of kind bundled shows a clip Difracta ships (`media bundled`). A Visual's media Parameter names one by id. `difracta run media.move` and `media.ungroup` rearrange them; `run media.bundled` swaps a bundled item's clip.",
    );

  /** Sends `media.create`, into the Group `group` names if given, and prints what it made with `extra` lines after. */
  const create = (
    client: DifractaClient,
    summary: DocumentSummary,
    payload: Readonly<Record<string, unknown>>,
    group: string | undefined,
    extra: readonly string[],
  ) =>
    cli.replica(client, summary.id).then(async ({ document, view }) => {
      const reply = await client.command<CommandResult>(
        summary.id,
        "media.create",
        {
          ...payload,
          ...(group === undefined
            ? {}
            : { parentId: mediaGroupId(document, group) }),
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
      cli.print({ ...payload, ...result }, () =>
        [formatCommandResult(result, "media.create"), ...extra].join("\n"),
      );
    });

  media
    .command("add [path]")
    .description(
      "Add an image (png, jpg, jpeg, webp, gif, svg) or video (mp4, webm, mov) file as a Media item, last at the root or in --group. The path is taken from this shell and stored relative to the Installation file's folder, so the Installation must be saved. With --bundled instead of a path, add a clip Difracta ships, by entry id or name (`media bundled` lists them); no save needed.",
    )
    .option(
      "--bundled <entry>",
      "a Bundled Media entry, by id or name, instead of a file",
    )
    .option(
      "--name <name>",
      "the item's name; the file name without extension, or the entry's name, unless given",
    )
    .option(...GROUP_OPTION)
    .action(
      (
        path: string | undefined,
        local: { name?: string; group?: string; bundled?: string },
      ) =>
        cli.withDocument(async (client, summary) => {
          const named = local.name === undefined ? {} : { name: local.name };
          if (local.bundled !== undefined) {
            if (path !== undefined)
              throw new Error(
                "Give a file path or --bundled <entry>, not both.",
              );
            const entry = resolveBundled(
              await fetchCatalog(client),
              local.bundled,
            );
            await create(
              client,
              summary,
              { kind: "bundled", bundled: entry, ...named },
              local.group,
              [`Shows Bundled Media ${entry}.`],
            );
            return;
          }
          if (path === undefined)
            throw new Error(
              "Give the file to add, or --bundled <entry> for a clip Difracta ships.",
            );
          const stored = storedMediaPath(summary, path);
          await create(
            client,
            summary,
            { path: stored, ...named },
            local.group,
            [`Stored as ${stored}.`],
          );
        }),
    );

  media
    .command("group <name>")
    .description(
      "Add a Media Group, a folder arranging Media items and other Groups, last at the root or in --group.",
    )
    .option(...GROUP_OPTION)
    .action((name: string, local: { group?: string }) =>
      cli.withDocument((client, summary) =>
        create(client, summary, { kind: "group", name }, local.group, []),
      ),
    );

  media
    .command("list")
    .description(
      "List the Media items in navigator order, indented by Group: name, id, kind (file, bundled or group), type (image or video), status (ok, missing, outside the Installation's folder, unsaved while the Installation has no file, or unavailable for a bundled clip this runtime lacks) and the file's path or the bundled entry's id.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const items = listMedia(
          document,
          view.liveState.get().media,
          await fetchCatalog(client),
        );
        cli.print(items, () => formatMedia(items));
      }),
    );

  registerMediaBundled(media, cli);
}
