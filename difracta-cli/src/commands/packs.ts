import type { CommandResult, KnownPack } from "@difracta/protocol";
import type { Command } from "commander";
import { resolve } from "node:path";

import type { Cli } from "../cli.ts";
import { resolvePackId } from "../media-references.ts";
import { formatCommandResult } from "../result.ts";
import { isLocalUrl, normalizeUrl } from "../url.ts";
import {
  findKnownPack,
  formatKnownPacks,
  formatPacks,
  listPacks,
} from "./packs-listing.ts";

/** What `packs.add` and `packs.locate` answer. */
interface PackReply {
  readonly packId: string;
  readonly name: string;
}

export function registerPacks(program: Command, cli: Cli): void {
  const packs = program
    .command("packs")
    .description(
      "Packs: a Pack is a folder of images and videos on the runtime's machine, scanned once and served with thumbnails and proxies; an Installation attaches Packs by id and a Visual's media Parameter names an entry as `<pack>/<entry>`. The Bundled Pack (id bundled) is attached to every Installation. A Pack here is named by its id or its name.",
    );

  packs
    .command("list")
    .description(
      "List the Installation's Packs: the Bundled Pack, then the attached ones by name, each with id, state (ok; preparing done/total while thumbnails and proxies bake; missing when this machine lacks it, see `packs locate`; loading), entry count, read-only, and its folder on the runtime's machine or the Installation's relative hint. A warning line follows a Pack that hit a scan limit or lacks ffmpeg.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const items = listPacks(document, view.liveState.get().packs);
        cli.print(items, () => formatPacks(items));
      }),
    );

  packs
    .command("add <folder>")
    .description(
      "Make a folder on the runtime's machine a Pack and attach it to the Installation: the runtime scans it (subfolders too, hidden ones skipped), writes `.difracta/pack.json` in it, records it in this machine's Registry and bakes thumbnails and proxies. Only from the runtime's own machine (a loopback connection to a runtime started with --documents free); a remote shell attaches a known Pack with `packs attach` instead. A relative path resolves against this shell's directory when the runtime is local.",
    )
    .action((folder: string) =>
      cli.withDocument(async (client) => {
        const path = isLocalUrl(normalizeUrl(cli.options().url))
          ? resolve(folder)
          : folder;
        const reply = await client.request<PackReply>("packs.add", {
          folder: path,
        });
        cli.print(
          { ...reply, folder: path },
          () =>
            `Added Pack “${reply.name}” (${reply.packId}) from ${path} and attached it; \`difracta media list ${reply.packId}\` lists its entries as they are prepared.`,
        );
      }),
    );

  packs
    .command("attach <pack>")
    .description(
      "Attach a Pack this machine already knows (see `packs known`) to the Installation, by id or name. Works from any machine. Layers can then name its entries.",
    )
    .action((pack: string) =>
      cli.withDocument(async (client, summary) => {
        const known = await client.request<KnownPack[]>("packs.known", {});
        const found = findKnownPack(known, pack);
        const result = await client.command<CommandResult>(
          summary.id,
          "packs.attach",
          { packId: found.id, name: found.name },
        );
        cli.print({ packId: found.id, name: found.name, ...result }, () =>
          formatCommandResult(result, `Attach Pack “${found.name}”`),
        );
      }),
    );

  packs
    .command("detach <pack>")
    .description(
      "Detach a Pack from the Installation, by id or name. Nothing on disk changes and the machine still knows the Pack; Layers holding its entries keep their references and read as missing until it is attached again. The Bundled Pack cannot be detached.",
    )
    .action((pack: string) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const packId = resolvePackId(
          document,
          view.liveState.get().packs,
          pack,
        );
        const result = await client.command<CommandResult>(
          summary.id,
          "packs.detach",
          { packId },
        );
        cli.print({ packId, ...result }, () =>
          formatCommandResult(result, "Detach Pack"),
        );
      }),
    );

  packs
    .command("locate <pack> <folder>")
    .description(
      "Say where a missing Pack is on the runtime's machine: the folder's `.difracta/pack.json` must carry the Pack's id. The Registry learns it and the Pack loads. Only from the runtime's own machine, like `packs add`.",
    )
    .action((pack: string, folder: string) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const packId = resolvePackId(
          document,
          view.liveState.get().packs,
          pack,
        );
        const path = isLocalUrl(normalizeUrl(cli.options().url))
          ? resolve(folder)
          : folder;
        const reply = await client.request<PackReply>("packs.locate", {
          packId,
          folder: path,
        });
        cli.print(
          { ...reply, folder: path },
          () => `Pack “${reply.name}” (${reply.packId}) is at ${path}.`,
        );
      }),
    );

  packs
    .command("rescan <pack>")
    .description(
      "Walk a loaded Pack's folder again: new files get entries, renamed files re-attach to their entries by fingerprint, gone files read missing. Nothing is removed and no metadata changes. Runs on every Installation open too.",
    )
    .action((pack: string) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const packId = resolvePackId(
          document,
          view.liveState.get().packs,
          pack,
        );
        const reply = await client.request<{ packId: string }>("packs.rescan", {
          packId,
        });
        cli.print(reply, () => `Rescanned Pack ${reply.packId}.`);
      }),
    );

  packs
    .command("known")
    .description(
      "List the Packs the runtime's machine knows (its Registry, plus the folders the runtime was started with): name, id, whether it is loaded now, and its folder. `packs attach` attaches one.",
    )
    .action(() =>
      cli.withClient(async (client) => {
        const known = await client.request<KnownPack[]>("packs.known", {});
        cli.print(known, () => formatKnownPacks(known));
      }),
    );
}
