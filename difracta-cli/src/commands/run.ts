import {
  createBuiltInRegistry,
  type CommandRegistry,
  type Document,
  type TableName,
} from "@difracta/core";
import type { CommandResult, CreatedEntity } from "@difracta/protocol";
import type { Command } from "commander";
import { z } from "zod";

import type { Cli } from "../cli.ts";
import { parseJsonArgument } from "../connection.ts";
import { resolvePayloadNames } from "../names.ts";
import {
  formatCommandResult,
  type NamedEntity,
  type NamedResult,
} from "../result.ts";
import { formatSchema } from "../schema.ts";

/** The registry is the only source for `commands`, `describe` and `run`. */
const registry = createBuiltInRegistry();

export interface CommandDescription {
  readonly name: string;
  readonly kind: string;
  readonly description: string;
  /** JSON Schema of what a caller sends: defaulted and optional fields are not required. */
  readonly payload: unknown;
}

export function describeCommand(
  source: CommandRegistry,
  name: string,
): CommandDescription {
  const definition = source.get(name);
  if (definition === undefined)
    throw new Error(`Unknown command “${name}”. Try \`difracta commands\`.`);
  return {
    name,
    kind: definition.kind,
    description: definition.description,
    payload: z.toJSONSchema(definition.payload as z.ZodType, { io: "input" }),
  };
}

/**
 * What a command created, each with the name it ended up with: a create
 * given a name another entity has gets a numbered one, and the next
 * name-based call must use that.
 */
export function nameCreated(
  document: Document | undefined,
  created: readonly CreatedEntity[],
): NamedEntity[] {
  return created.map((entity) => {
    const table = document?.[entity.table as TableName] as
      Readonly<Record<string, { readonly name?: string }>> | undefined;
    const name = table?.[entity.id]?.name;
    return name === undefined ? entity : { ...entity, name };
  });
}

export function registerRun(program: Command, cli: Cli): void {
  program
    .command("commands")
    .description("List every command with its kind.")
    .action(() => {
      const items = registry.list().map((definition) => ({
        name: definition.name,
        kind: definition.kind,
        description: definition.description,
      }));
      cli.print(items, () =>
        items
          .map(
            (item) =>
              `${item.name.padEnd(24)} ${item.kind.padEnd(12)} ${item.description}`,
          )
          .join("\n"),
      );
    });

  program
    .command("describe <command>")
    .description(
      "Print a command's payload fields: type, required (*), default, nested shapes. --json prints the JSON Schema.",
    )
    .action((name: string) => {
      const description = describeCommand(registry, name);
      cli.print(description, () =>
        [
          `${description.name} (${description.kind})`,
          description.description,
          "",
          "Payload (* required):",
          ...formatSchema(description.payload as never).map(
            (line) => `  ${line}`,
          ),
        ].join("\n"),
      );
    });

  program
    .command("run <command> [payload]")
    .description(
      'Run any command with a JSON payload, e.g. run output.create \'{"name":"TV"}\'. Entity fields take names as well as ids. `commands` lists the commands, `describe <command>` shows its payload; a create\'s reply lists what it made, with the name it got.',
    )
    .action((name: string, payload: string | undefined) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const reply = await client.command<CommandResult>(
          summary.id,
          name,
          resolvePayloadNames(document, name, parseJsonArgument(payload)),
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
        cli.print(result, () => formatCommandResult(result, name));
      }),
    );

  for (const direction of ["undo", "redo"] as const) {
    program
      .command(direction)
      .description(
        `${direction === "undo" ? "Undo" : "Redo"} this CLI's last authoring step (or anyone's with --global).`,
      )
      .option("--global", "act on the last step by any session", false)
      .action((local: { global: boolean }) =>
        cli.withDocument(async (client, summary) => {
          const result = await client.command<CommandResult>(
            summary.id,
            `history.${direction}`,
            { global: local.global },
          );
          cli.print(
            result,
            () =>
              `${direction === "undo" ? "Undid" : "Redid"} ${result.label ?? "step"} (revision ${String(result.revision)}).`,
          );
        }),
      );
  }
}
