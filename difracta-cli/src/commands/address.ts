import { CommandError } from "@difracta/client";
import { linkAt, type RunMode } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog, parseValue } from "../connection.ts";
import {
  inTypedTerms,
  resolveAddressNames,
  resolveId,
  resolveMediaValue,
} from "../names.ts";
import { formatWarnings } from "../result.ts";

/** What one `trigger` Address came to: fired with what its Macro skipped, or refused. */
export interface TriggerOutcome {
  readonly address: string;
  /** The Address as it was typed, names and all. */
  readonly typed: string;
  readonly ok: boolean;
  /** How many actions the Macro holds, when the Address is a Macro's run. */
  readonly actions?: number;
  /** The Macro's Run Mode, when it is not All. */
  readonly mode?: RunMode;
  /** How many actions the Run Mode picked, when it is not All. */
  readonly picked?: number;
  /** How many picked actions passed their Chance, when the Run Mode is not All. */
  readonly fired?: number;
  readonly warnings: readonly string[];
  readonly error?: string;
}

/**
 * "(5 actions, 1 skipped)" after a Macro run in All; with another Run
 * Mode, "(12 actions, some 3: 3 picked, 2 fired, 1 skipped)". Nothing for
 * a Cue or a Scene.
 */
export function firedDetail(outcome: TriggerOutcome): string {
  if (outcome.actions === undefined) return "";
  const skipped = outcome.warnings.length;
  const parts = [
    `${String(outcome.actions)} ${outcome.actions === 1 ? "action" : "actions"}`,
  ];
  if (outcome.mode !== undefined && outcome.mode !== "all") {
    const mode =
      outcome.mode === "some"
        ? `some ${String(outcome.picked ?? 0)}`
        : outcome.mode;
    parts.push(
      `${mode}: ${String(outcome.picked ?? 0)} picked, ${String(outcome.fired ?? 0)} fired`,
    );
  }
  if (skipped > 0) parts.push(`${String(skipped)} skipped`);
  return ` (${parts.join(", ")})`;
}

export function registerAddress(program: Command, cli: Cli): void {
  for (const [name, command, purpose] of [
    [
      "set",
      "address.set",
      "Write a performance value to an Address, e.g. set installation/blackout true. Not undoable. `addresses` lists every Address with its value.",
    ],
    [
      "edit",
      "address.edit",
      "Change an Address while authoring, e.g. edit layer/Wash/param/speed 2. Undoable, like the inspector. `addresses` lists every Address with its value.",
    ],
  ] as const) {
    program
      .command(`${name} <address> <value>`)
      .description(purpose)
      .action((address: string, value: string) =>
        cli.withDocument(async (client, summary) => {
          const { document } = await cli.replica(client, summary.id);
          const resolved = resolveAddressNames(document, address);
          const parsed = parseValue(value);
          // Only a Parameter can take a Media item, so only then is the Catalog needed.
          const written =
            typeof parsed === "string" && resolved.includes("/param/")
              ? resolveMediaValue(
                  document,
                  await fetchCatalog(client),
                  resolved,
                  parsed,
                )
              : parsed;
          const result = await client
            .command<CommandResult>(summary.id, command, {
              address: resolved,
              value: written,
            })
            .catch((error: unknown) => {
              throw inTypedTerms(error, resolved, address);
            });
          cli.print({ address: resolved, ...result }, () =>
            result.changed
              ? `${address} = ${value} (revision ${String(result.revision)})`
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
      "Fire trigger Addresses, one command each: layer/<id|name>/cue/<key>, scene/<id|name>/play or macro/<id|name>/run. A Macro run says how many actions it holds, in a Run Mode other than All how many it picked and how many passed their Chance, and lists what it skipped; a refused Address fails the exit code. `addresses` lists every trigger.",
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
            const [kind, id = ""] = address.split("/");
            const macro = kind === "macro" ? document.macros[id] : undefined;
            outcomes.push({
              address,
              typed,
              ok: true,
              ...(macro?.kind === "macro"
                ? { actions: macro.actions.length }
                : {}),
              ...(macro?.kind === "macro" && macro.mode !== "all"
                ? {
                    mode: macro.mode,
                    picked: result.run?.picked ?? 0,
                    fired: result.run?.fired ?? 0,
                  }
                : {}),
              warnings: result.warnings ?? [],
            });
          } catch (error) {
            if (!(error instanceof CommandError)) throw error;
            const retold = inTypedTerms(error, address, typed) as Error;
            outcomes.push({
              address,
              typed,
              ok: false,
              warnings: [],
              error: retold.message,
            });
            process.exitCode = 1;
          }
        }
        cli.print(outcomes, () =>
          outcomes
            .flatMap((o) =>
              o.ok
                ? [
                    `${o.typed} fired${firedDetail(o)}`,
                    ...formatWarnings(o.warnings),
                  ]
                : [`${o.typed}: ${o.error ?? "refused"}`],
            )
            .join("\n"),
        );
      }),
    );
}
