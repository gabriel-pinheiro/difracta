import { flattenMedia, type Document } from "@difracta/core";
import type {
  LiveState,
  ShareSource,
  ShareStatus,
  ShareStopResult,
} from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { resolveId } from "../names.ts";
import { formatTable } from "./read.ts";

export interface ShareListing {
  readonly id: string;
  readonly name: string;
  /** Undefined before the runtime has said. */
  readonly status: ShareStatus | undefined;
  /** Who shares into it, while not idle; null otherwise. */
  readonly sharer: string | null;
  readonly source: ShareSource | null;
  /** Epoch ms the share started; null while idle. */
  readonly since: number | null;
  /** Viewers of the share, waiting ones included; null while idle. */
  readonly viewers: number | null;
}

/** Every Screen Share of the Installation in navigator order, with who shares into it. */
export function listShares(
  document: Pick<Document, "media">,
  live: LiveState["media"],
): ShareListing[] {
  return flattenMedia(document.media)
    .filter((item) => item.kind === "share")
    .map((item) => {
      const entry = live[item.id];
      const shared = entry !== undefined && "sharer" in entry;
      return {
        id: item.id,
        name: item.name,
        status: entry?.status as ShareStatus | undefined,
        sharer: shared ? entry.sharer : null,
        source: shared ? entry.source : null,
        since: shared ? entry.since : null,
        viewers: shared ? entry.viewers : null,
      };
    });
}

/** `3 min`, `45 s`, `2 h 5 min`: how long ago `since` was. */
export function elapsed(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}

/** One row per Screen Share: name, id, status, and while shared who, what, how long and how many Viewers. */
export function formatShares(
  items: readonly ShareListing[],
  now: number = Date.now(),
): string {
  if (items.length === 0)
    return "No Screen Shares. `difracta media screen-share [name]` adds one.";
  return formatTable(
    items.map((item) => [
      item.name,
      item.id,
      item.status ?? "…",
      item.sharer === null ? "" : `by ${item.sharer}`,
      item.source ?? "",
      item.since === null ? "" : `for ${elapsed(item.since, now)}`,
      item.viewers === null
        ? ""
        : `${String(item.viewers)} ${item.viewers === 1 ? "Viewer" : "Viewers"}`,
    ]),
  );
}

export function registerShare(program: Command, cli: Cli): void {
  const share = program
    .command("share")
    .description(
      "Screen Shares: Media items of kind share, slots a Difracta Desktop (the Sharer) shares a screen or window into, and any page (Output, Studio) views. A share starts only from the Sharer's own Desktop; from here you see and stop them. `media screen-share [name]` adds a slot.",
    );

  share
    .command("list")
    .description(
      "List the Screen Shares in navigator order: name, id, status (idle: nobody shares; live; interrupted: the Sharer's connection dropped and it may come back), and while not idle the Sharer's name, whether it shares a screen or a window, for how long, and how many Viewers it has.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const items = listShares(document, view.liveState.get().media);
        cli.print(items, () => formatShares(items));
      }),
    );

  share
    .command("stop <media>")
    .description(
      "Stop the share into a Screen Share, by name or id, whoever shares into it; its Sharer is told another client stopped it. Fails when nobody shares into it.",
    )
    .action((reference: string) =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const mediaId = resolveId(document, "media", reference);
        const result = await client.request<ShareStopResult>("shares.stop", {
          mediaId,
        });
        const name = document.media[mediaId]?.name ?? mediaId;
        cli.print(
          result,
          () => `Stopped ${result.sharer}'s share into ${name}.`,
        );
      }),
    );
}
