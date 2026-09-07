import {
  createBuiltInRegistry,
  getAtPath,
  listAddresses,
  type Document,
} from "@difracta/core";
import type { DocumentSummary, FileEntry } from "@difracta/protocol";
import { Command } from "commander";
import { z } from "zod";

import {
  connect,
  DEFAULT_URL,
  parseJsonArgument,
  parseValue,
  selectDocument,
} from "./connection.ts";

/**
 * The `difracta` command. Everything an agent or a shell needs: list and
 * describe commands straight from the registry, run any of them, read the
 * document, write addresses, undo. `--json` makes every output machine
 * readable.
 */
const program = new Command("difracta")
  .description("Control a Difracta runtime from the shell.")
  .option(
    "--url <url>",
    "runtime live URL",
    process.env.DIFRACTA_URL ?? DEFAULT_URL,
  )
  .option(
    "--doc <selector>",
    "open Installation by name or id (optional with one open)",
  )
  .option("--json", "machine-readable output", false);

interface GlobalOptions {
  readonly url: string;
  readonly doc?: string;
  readonly json: boolean;
}

function options(): GlobalOptions {
  return program.opts<GlobalOptions>();
}

function print(value: unknown, human: () => string): void {
  console.log(options().json ? JSON.stringify(value, null, 2) : human());
}

async function withClient<TResult>(
  action: (client: Awaited<ReturnType<typeof connect>>) => Promise<TResult>,
): Promise<TResult> {
  const client = await connect(options().url);
  try {
    return await action(client);
  } finally {
    client.close();
  }
}

async function withDocument<TResult>(
  action: (
    client: Awaited<ReturnType<typeof connect>>,
    summary: DocumentSummary,
  ) => Promise<TResult>,
): Promise<TResult> {
  return withClient((client) =>
    action(client, selectDocument(client.documents.get(), options().doc)),
  );
}

async function readDocument(
  client: Awaited<ReturnType<typeof connect>>,
  documentId: string,
): Promise<Document> {
  const view = client.openDocument(documentId);
  return new Promise((resolve) => {
    const current = view.get();
    if (current !== undefined) resolve(current);
    else
      view.document.subscribe(
        (document) => document !== undefined && resolve(document),
      );
  });
}

const registry = createBuiltInRegistry();

program
  .command("health")
  .description("Show the runtime and its open Installations.")
  .action(() =>
    withClient(async (client) => {
      const documents = client.documents.get();
      print({ sessionId: client.sessionId.get(), documents }, () =>
        [
          `Connected as ${client.sessionId.get() ?? "?"}`,
          ...documents.map(
            (d) =>
              `  ${d.name}  ${d.id}  ${d.path ?? "(unsaved)"}${d.dirty ? " *" : ""}`,
          ),
        ].join("\n"),
      );
    }),
  );

program
  .command("commands")
  .description("List every command with its kind.")
  .action(() => {
    const items = registry.list().map((definition) => ({
      name: definition.name,
      kind: definition.kind,
      description: definition.description,
    }));
    print(items, () =>
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
  .description("Print a command's payload schema as JSON Schema.")
  .action((name: string) => {
    const definition = registry.get(name);
    if (definition === undefined)
      throw new Error(`Unknown command “${name}”. Try \`difracta commands\`.`);
    const schema = z.toJSONSchema(definition.payload as z.ZodType);
    print(
      {
        name,
        kind: definition.kind,
        description: definition.description,
        payload: schema,
      },
      () =>
        `${definition.name} (${definition.kind})\n${definition.description}\n\nPayload:\n${JSON.stringify(schema, null, 2)}`,
    );
  });

program
  .command("run <command> [payload]")
  .description(
    'Run a command with a JSON payload, e.g. run output.create \'{"name":"TV"}\'.',
  )
  .action((name: string, payload: string | undefined) =>
    withDocument(async (client, summary) => {
      const result = await client.command<{
        revision: number;
        changed: boolean;
        label?: string;
      }>(summary.id, name, parseJsonArgument(payload));
      print(result, () =>
        result.changed
          ? `${result.label ?? name} → revision ${result.revision}`
          : "No change.",
      );
    }),
  );

program
  .command("get [path]")
  .description(
    "Read the Installation, or one value by slash path such as outputs or installation/name.",
  )
  .action((path: string | undefined) =>
    withDocument(async (client, summary) => {
      const document = await readDocument(client, summary.id);
      const value =
        path === undefined ? document : getAtPath(document, path.split("/"));
      print(value, () => JSON.stringify(value, null, 2));
    }),
  );

program
  .command("addresses")
  .description("List every controllable Address in the Installation.")
  .action(() =>
    withDocument(async (client, summary) => {
      const document = await readDocument(client, summary.id);
      const items = listAddresses(document).map((entry) => ({
        ...entry,
        value: getAtPath(document, entry.path),
      }));
      print(items, () =>
        items
          .map(
            (item) =>
              `${item.address.padEnd(32)} ${item.type.padEnd(8)} ${JSON.stringify(item.value)}  ${item.label}`,
          )
          .join("\n"),
      );
    }),
  );

program
  .command("set <address> <value>")
  .description(
    "Write a performance value to an Address, e.g. set installation/blackout true.",
  )
  .action((address: string, value: string) =>
    withDocument(async (client, summary) => {
      const result = await client.command<{
        revision: number;
        changed: boolean;
      }>(summary.id, "address.set", { address, value: parseValue(value) });
      print(result, () =>
        result.changed ? `${address} = ${value}` : "No change.",
      );
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
      withDocument(async (client, summary) => {
        const result = await client.command<{ label?: string }>(
          summary.id,
          `history.${direction}`,
          { global: local.global },
        );
        print(
          result,
          () =>
            `${direction === "undo" ? "Undid" : "Redid"} ${result.label ?? "step"}.`,
        );
      }),
    );
}

const documents = program
  .command("documents")
  .description("Open, create, save and close Installations on the runtime.");

documents
  .command("list")
  .description("List open Installations.")
  .action(() =>
    withClient(async (client) => {
      const items = client.documents.get();
      print(items, () =>
        items.length === 0
          ? "No open Installations."
          : items
              .map(
                (d) =>
                  `${d.name}  ${d.id}  ${d.path ?? "(unsaved)"}${d.dirty ? " *" : ""}`,
              )
              .join("\n"),
      );
    }),
  );

documents
  .command("files")
  .description("List .difracta files in the runtime's projects folder.")
  .action(() =>
    withClient(async (client) => {
      const result = await client.request<{
        items: FileEntry[];
        projectsDir: string;
      }>("files.list", {});
      print(result, () =>
        [
          result.projectsDir,
          ...result.items.map(
            (f) =>
              `  ${f.name}${f.recoveryAvailable ? "  (unsaved autosave)" : ""}`,
          ),
        ].join("\n"),
      );
    }),
  );

documents
  .command("new <name>")
  .description("Create an unsaved Installation.")
  .action((name: string) =>
    withClient(async (client) => {
      const summary = await client.request<DocumentSummary>("documents.new", {
        name,
      });
      print(summary, () => `Created ${summary.name} (${summary.id}).`);
    }),
  );

documents
  .command("open <path>")
  .description(
    "Open a .difracta file (relative to the projects folder or absolute).",
  )
  .action((path: string) =>
    withClient(async (client) => {
      const summary = await client.request<DocumentSummary>("documents.open", {
        path,
      });
      print(
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
  .description(
    "Reload the selected Installation as last saved, dropping autosaves.",
  )
  .action(() =>
    withDocument(async (client, summary) => {
      const reverted = await client.request<DocumentSummary>(
        "documents.revert",
        { documentId: summary.id },
      );
      print(
        reverted,
        () => `Reverted ${reverted.name} to ${reverted.path ?? "?"}.`,
      );
    }),
  );

documents
  .command("save [path]")
  .description("Save the selected Installation, optionally to a new path.")
  .action((path: string | undefined) =>
    withDocument(async (client, summary) => {
      const saved = await client.request<DocumentSummary>(
        "documents.save",
        path === undefined
          ? { documentId: summary.id }
          : { documentId: summary.id, path },
      );
      print(saved, () => `Saved ${saved.name} to ${saved.path ?? "?"}.`);
    }),
  );

documents
  .command("close")
  .description("Close the selected Installation.")
  .option("--discard", "close even with unsaved changes", false)
  .action((local: { discard: boolean }) =>
    withDocument(async (client, summary) => {
      await client.request("documents.close", {
        documentId: summary.id,
        discard: local.discard,
      });
      print({ closed: summary.id }, () => `Closed ${summary.name}.`);
    }),
  );

try {
  await program.parseAsync();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
