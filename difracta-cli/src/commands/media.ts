import {
  describeBeats,
  emptyCatalog,
  flattenMedia,
  mediaBeatsIn,
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
  /** A file's, relative to the Installation file's folder; null for any other kind. */
  readonly path: string | null;
  /** A bundled item's Bundled Media entry id; null for any other kind. */
  readonly bundled: string | null;
  /**
   * From the file's extension or the bundled entry, live for a Screen
   * Share; null for a Group, undefined for a file Difracta cannot show or
   * an entry the runtime lacks.
   */
  readonly type: MediaType | null | undefined;
  /** How many beats a video lasts, its own or its entry's; null for one without. */
  readonly beats: number | null;
  /** The time in seconds of the first beat; null without beats. */
  readonly firstBeat: number | null;
  /** From the live state, a Screen Share's too; undefined before the runtime has looked, and for a Group. */
  readonly status: LiveState["media"][string]["status"] | undefined;
}

/**
 * Every Media item in navigator order, Groups first-class, with the
 * runtime's word on whether each file is there or who shares into each
 * Screen Share; `catalog` gives bundled items their type.
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
    beats: mediaBeatsIn(item, catalog)?.beats ?? null,
    firstBeat: mediaBeatsIn(item, catalog)?.firstBeat ?? null,
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

/** One row per item, names indented by Group: name, id, kind, type, status, path or bundle entry, beats. */
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
      item.beats === null ? "" : describeBeats(item.beats),
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

/** The `media.beats` payload from what was typed: a number of beats or `none`, and a first beat in seconds. */
export function beatsPayload(
  mediaId: string,
  beats: string,
  firstBeat: string | undefined,
): { mediaId: string; beats: number | null; firstBeat?: number } {
  const number = (text: string, what: string): number => {
    const value = Number(text.trim());
    if (text.trim() === "" || !Number.isFinite(value))
      throw new Error(`${what} must be a number, not “${text}”.`);
    return value;
  };
  return {
    mediaId,
    beats:
      beats.trim().toLowerCase() === "none" ? null : number(beats, "Beats"),
    ...(firstBeat === undefined
      ? {}
      : { firstBeat: number(firstBeat, "The first beat") }),
  };
}

const GROUP_OPTION = [
  "--group <group>",
  "the Media Group to add into, by name or id; the root unless given",
] as const;

export function registerMedia(program: Command, cli: Cli): void {
  const media = program
    .command("media")
    .description(
      "Images, videos and Screen Shares the Installation shows, arranged in Media Groups. A Media item of kind file is a file next to the Installation file (or elsewhere, stored as a relative path), of type image or video by its extension; one of kind bundled shows a clip Difracta ships (`media bundled`); one of kind share is a Screen Share, of type live, a slot a Difracta Desktop shares a screen or window into (`media screen-share`, `share list`). A Visual's media Parameter names one by id. `difracta run media.move` and `media.ungroup` rearrange them; `run media.bundled` swaps a bundled item's clip.",
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
    .command("screen-share [name]")
    .description(
      "Add a Screen Share, a slot a Difracta Desktop shares a screen or window into, last at the root or in --group; named Screen Share unless a name is given. A share starts only from the Sharer's own Desktop; `share list` shows who shares into each, `share stop` stops one.",
    )
    .option(...GROUP_OPTION)
    .action((name: string | undefined, local: { group?: string }) =>
      cli.withDocument((client, summary) =>
        create(
          client,
          summary,
          { kind: "share", ...(name === undefined ? {} : { name }) },
          local.group,
          [],
        ),
      ),
    );

  media
    .command("list")
    .description(
      "List the Media items in navigator order, indented by Group: name, id, kind (file, bundled, share or group), type (image, video, or live for a Screen Share), status (ok, missing, outside the Installation's folder, unsaved while the Installation has no file, or unavailable for a bundled clip this runtime lacks; for a Screen Share idle, live or interrupted), the file's path or the bundled entry's id, and the beats of a video that has them.",
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

  media
    .command("beats <media> <beats>")
    .description(
      "Say how many beats a video Media file lasts, by name or id: 16 for a four-bar loop, so a 7.5 second loop is at 128 BPM. A Video with Sync to Tempo on then plays it at the Tempo it is given and chases the beat Cue. `none` removes them. Bundled items have theirs already (`media bundled`).",
    )
    .option(
      "--first-beat <seconds>",
      "the time of the clip's first beat, when it does not start on one; kept as it is unless given",
    )
    .action((reference: string, beats: string, local: { firstBeat?: string }) =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const payload = beatsPayload(
          resolveId(document, "media", reference),
          beats,
          local.firstBeat,
        );
        const result = await client.command<CommandResult>(
          summary.id,
          "media.beats",
          payload,
        );
        cli.print({ ...payload, ...result }, () =>
          formatCommandResult(result, "media.beats"),
        );
      }),
    );

  registerMediaBundled(media, cli);
}
