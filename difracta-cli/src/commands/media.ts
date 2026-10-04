import type { CommandResult } from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import {
  entryOf,
  resolveMediaReference,
  resolvePackId,
  type Packs,
} from "../media-references.ts";
import { findId } from "../names.ts";
import { formatCommandResult, type NamedResult } from "../result.ts";
import {
  formatEntries,
  formatPackEntries,
  listEntries,
  listingPacks,
} from "./media-listing.ts";
import { nameCreated } from "./run.ts";

/** What `media.update` answers. */
interface UpdateReply {
  readonly packId: string;
  readonly entryId: string;
}

/** The tags `tags` become with `added` put in or taken out, compared ignoring case, order kept. */
export function mergeTags(
  tags: readonly string[],
  changes: readonly string[],
  remove: boolean,
): string[] {
  const wanted = changes.map((tag) => tag.trim()).filter((tag) => tag !== "");
  const folded = (tag: string): string => tag.toLowerCase();
  if (remove) {
    const gone = new Set(wanted.map(folded));
    return tags.filter((tag) => !gone.has(folded(tag)));
  }
  const result = [...tags];
  for (const tag of wanted)
    if (!result.some((existing) => folded(existing) === folded(tag)))
      result.push(tag);
  return result;
}

/** `16` → 16; `none` → null; anything else is an error. */
export function parseBeats(text: string): number | null {
  if (text.trim().toLowerCase() === "none") return null;
  const beats = Number(text);
  if (!Number.isFinite(beats) || beats <= 0)
    throw new Error(
      `Beats is a positive number of beats the clip lasts, or "none"; not “${text}”.`,
    );
  return beats;
}

export function registerMedia(program: Command, cli: Cli): void {
  const media = program
    .command("media")
    .description(
      "Media: the image and video entries of the Installation's Packs (see `packs`), which a Visual's media Parameter names as `<pack>/<entry>`, and its Screen Shares, slots a Difracta Desktop shares a screen or window into (`media screen-share`, `share list`). An entry here is `<pack>/<entry>` by ids, or the Pack's name and the file's path inside it, such as `Neon/tunnels/04.mp4`; listings print both.",
    );

  /** The reference and its loaded entry, from what was typed. */
  const locate = (
    document: Parameters<typeof resolveMediaReference>[0],
    packs: Packs,
    typed: string,
  ) => {
    const reference = resolveMediaReference(document, packs, typed);
    return { reference, ...entryOf(packs, reference) };
  };

  media
    .command("list [pack]")
    .description(
      "List the entries of every Pack (Bundled first, then the attached ones), or of one Pack by id or name: reference, path inside the Pack, type, size, length, Beats with the tempo they make, tags, and `missing` when the file is gone.",
    )
    .action((pack: string | undefined) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const packs = view.liveState.get().packs;
        if (pack === undefined) {
          const groups = listingPacks(document, packs);
          const items = groups.flatMap(({ packId, pack: live }) =>
            live === undefined ? [] : listEntries(packId, live),
          );
          cli.print(items, () => formatPackEntries(groups));
          return;
        }
        const packId = resolvePackId(document, packs, pack);
        const live = packs[packId];
        if (live === undefined)
          throw new Error(
            `Pack “${packId}” is not loaded by this runtime; \`difracta packs list\` says why.`,
          );
        const items = listEntries(packId, live);
        cli.print(items, () => formatEntries(items));
      }),
    );

  media
    .command("tag <entry> <tag...>")
    .description(
      "Add tags to an entry, or take them away with --remove. Tags are free-form words compared ignoring case; Difracta reads `loop` (a seamless loop), `hit` (a one-shot) and `recommended`. Written to the Pack's manifest; refused on a read-only Pack such as the Bundled Pack.",
    )
    .option("--remove", "take the tags away instead", false)
    .action((typed: string, tags: string[], local: { remove: boolean }) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const { reference, packId, entry } = locate(
          document,
          view.liveState.get().packs,
          typed,
        );
        const next = mergeTags(entry.tags, tags, local.remove);
        const reply = await client.request<UpdateReply>("media.update", {
          packId,
          entryId: entry.id,
          tags: next,
        });
        cli.print({ ...reply, reference, tags: next }, () =>
          next.length === 0
            ? `${reference} has no tags.`
            : `${reference}: ${next.join(", ")}`,
        );
      }),
    );

  media
    .command("beats <entry> <beats>")
    .description(
      "Set how many beats a video entry lasts (16 for a four-bar loop), or `none` to take them away; its tempo follows from its length. --first-beat says when the first beat falls, in seconds, when the clip starts off the beat. Written to the Pack's manifest; refused on a read-only Pack.",
    )
    .option("--first-beat <seconds>", "time of the first beat, in seconds")
    .action((typed: string, beatsText: string, local: { firstBeat?: string }) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const { reference, packId, entry } = locate(
          document,
          view.liveState.get().packs,
          typed,
        );
        const beats = parseBeats(beatsText);
        const firstBeat =
          local.firstBeat === undefined ? undefined : Number(local.firstBeat);
        if (firstBeat !== undefined && !(firstBeat >= 0))
          throw new Error(
            `--first-beat is a time in seconds, zero or more; not “${local.firstBeat ?? ""}”.`,
          );
        const reply = await client.request<UpdateReply>("media.update", {
          packId,
          entryId: entry.id,
          beats,
          ...(firstBeat === undefined || beats === null ? {} : { firstBeat }),
        });
        cli.print({ ...reply, reference, beats, firstBeat }, () =>
          beats === null
            ? `${reference} has no Beats.`
            : `${reference}: ${String(beats)} beats${firstBeat === undefined || firstBeat === 0 ? "" : ` from ${String(firstBeat)} s`}${entry.duration === undefined ? "" : `, ${String(Math.round(((beats * 60) / entry.duration) * 10) / 10)} BPM`}`,
        );
      }),
    );

  media
    .command("thumbnail <entry> <seconds>")
    .description(
      "Take a video entry's thumbnail from the frame at that time, in seconds; the runtime bakes it again. Refused on a read-only Pack.",
    )
    .action((typed: string, secondsText: string) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const { reference, packId, entry } = locate(
          document,
          view.liveState.get().packs,
          typed,
        );
        const thumbnailAt = Number(secondsText);
        if (!(thumbnailAt >= 0))
          throw new Error(
            `The thumbnail's time is in seconds, zero or more; not “${secondsText}”.`,
          );
        const reply = await client.request<UpdateReply>("media.update", {
          packId,
          entryId: entry.id,
          thumbnailAt,
        });
        cli.print(
          { ...reply, reference, thumbnailAt },
          () =>
            `${reference}: thumbnail at ${String(thumbnailAt)} s; it is baked again shortly.`,
        );
      }),
    );

  media
    .command("rename <entry> <name>")
    .description(
      "Rename an entry in its Pack's manifest; the reference (`<pack>/<entry>`) and the file do not change. Refused on a read-only Pack.",
    )
    .action((typed: string, name: string) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const { reference, packId, entry } = locate(
          document,
          view.liveState.get().packs,
          typed,
        );
        const reply = await client.request<UpdateReply>("media.update", {
          packId,
          entryId: entry.id,
          name,
        });
        cli.print(
          { ...reply, reference, name },
          () => `${reference} is now called “${name}”.`,
        );
      }),
    );

  media
    .command("replace <from> <to>")
    .description(
      "Swap one Media reference for another everywhere it is used: every Layer Parameter and Macro action holding `from` is set to `to`. Both are Pack entries, or both Screen Shares (by id or name). Undoable. The entry `to` names need not be loaded here: a reference into a missing Pack is kept and reads as missing.",
    )
    .action((fromTyped: string, toTyped: string) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const packs = view.liveState.get().packs;
        // A slash makes it a Pack entry; otherwise a Screen Share by name or id.
        const asReference = (typed: string): string =>
          typed.includes("/")
            ? resolveMediaReference(document, packs, typed)
            : (findId(document, "shares", typed) ?? typed);
        const from = asReference(fromTyped);
        const to = asReference(toTyped);
        const result = await client.command<CommandResult>(
          summary.id,
          "media.replace",
          { from, to },
        );
        cli.print({ from, to, ...result }, () =>
          result.changed
            ? `Replaced ${from} with ${to} (revision ${String(result.revision)}).`
            : `Nothing uses ${from}.`,
        );
      }),
    );

  media
    .command("screen-share [name]")
    .description(
      "Add a Screen Share, a slot a Difracta Desktop shares a screen or window into, named Screen Share unless a name is given. A share starts only from the Sharer's own Desktop; `share list` shows who shares into each, `share stop` stops one.",
    )
    .action((name: string | undefined) =>
      cli.withDocument(async (client, summary) => {
        const { view } = await cli.replica(client, summary.id);
        const payload = name === undefined ? {} : { name };
        const reply = await client.command<CommandResult>(
          summary.id,
          "share.create",
          payload,
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
          formatCommandResult(result, "share.create"),
        );
      }),
    );
}
