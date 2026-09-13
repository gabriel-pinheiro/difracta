import { CommandError } from "@difracta/client";
import { linkAt } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { parseValue } from "../connection.ts";
import { resolveAddressNames, resolveId } from "../names.ts";
import { formatWarnings } from "../result.ts";

/** What one `trigger` Address came to: fired with what its Macro skipped, or refused. */
export interface TriggerOutcome {
  readonly address: string;
  readonly ok: boolean;
  readonly warnings: readonly string[];
  readonly error?: string;
}

export function registerAddress(program: Command, cli: Cli): void {
  for (const [name, command, purpose] of [
    [
      "set",
      "address.set",
      "Write a performance value to an Address, e.g. set installation/blackout true. Not undoable.",
    ],
    [
      "edit",
      "address.edit",
      "Change an Address while authoring, e.g. edit layer/Wash/param/speed 2. Undoable, like the inspector.",
    ],
  ] as const) {
    program
      .command(`${name} <address> <value>`)
      .description(purpose)
      .action((address: string, value: string) =>
        cli.withDocument(async (client, summary) => {
          const { document } = await cli.replica(client, summary.id);
          const resolved = resolveAddressNames(document, address);
          const result = await client.command<CommandResult>(
            summary.id,
            command,
            { address: resolved, value: parseValue(value) },
          );
          cli.print({ address: resolved, ...result }, () =>
            result.changed
              ? `${resolved} = ${value} (revision ${String(result.revision)})`
              : "No change.",
          );
        }),
      );
  }

  program
    .command("link <controller> <address...>")
    .description(
      "Link a Controller to Addresses, e.g. link Energy layer/Wash/param/color; one undoable step.",
    )
    .option("--from <number>", "target value at Controller 0 (number targets)")
    .option("--to <number>", "target value at Controller 1 (number targets)")
    .action(
      (
        controller: string,
        addresses: string[],
        local: { from?: string; to?: string },
      ) =>
        cli.withDocument(async (client, summary) => {
          const { document } = await cli.replica(client, summary.id);
          const controllerId = resolveId(document, "controllers", controller);
          const resolved = addresses.map((address) =>
            resolveAddressNames(document, address),
          );
          const anchors =
            local.from === undefined || local.to === undefined
              ? undefined
              : { from: Number(local.from), to: Number(local.to) };
          const result = await client.command<CommandResult>(
            summary.id,
            "link.create",
            {
              controllerId,
              addresses: resolved,
              ...(anchors ? { anchors } : {}),
            },
          );
          cli.print({ controllerId, addresses: resolved, ...result }, () =>
            result.changed
              ? resolved.map((a) => `${a} → ${controllerId}`).join("\n")
              : "No change.",
          );
        }),
    );

  program
    .command("unlink <address...>")
    .description(
      "Release Addresses from their Controllers, one command each; each keeps its current value.",
    )
    .action((addresses: string[]) =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const outcomes: { address: string; released: boolean }[] = [];
        for (const typed of addresses) {
          const address = resolveAddressNames(document, typed);
          const link = linkAt(document, address);
          if (link !== undefined)
            await client.command(summary.id, "link.remove", {
              linkId: link.id,
            });
          outcomes.push({ address, released: link !== undefined });
        }
        cli.print(outcomes, () =>
          outcomes
            .map((o) =>
              o.released
                ? `${o.address} released`
                : `${o.address} is not linked`,
            )
            .join("\n"),
        );
      }),
    );

  program
    .command("trigger <address...>")
    .description(
      "Fire trigger Addresses, one command each: layer/<id|name>/cue/<key>, scene/<id|name>/play or macro/<id|name>/run. A Macro run lists what it skipped; a refused Address fails the exit code.",
    )
    .action((addresses: string[]) =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const outcomes: TriggerOutcome[] = [];
        for (const typed of addresses) {
          const address = resolveAddressNames(document, typed);
          try {
            const result = await client.command<CommandResult>(
              summary.id,
              "address.trigger",
              { address },
            );
            outcomes.push({
              address,
              ok: true,
              warnings: result.warnings ?? [],
            });
          } catch (error) {
            if (!(error instanceof CommandError)) throw error;
            outcomes.push({
              address,
              ok: false,
              warnings: [],
              error: error.message,
            });
            process.exitCode = 1;
          }
        }
        cli.print(outcomes, () =>
          outcomes
            .flatMap((o) =>
              o.ok
                ? [`${o.address} fired`, ...formatWarnings(o.warnings)]
                : [`${o.address}: ${o.error ?? "refused"}`],
            )
            .join("\n"),
        );
      }),
    );
}
