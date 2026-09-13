import {
  effectiveValue,
  getAtPath,
  linkAt,
  listAddresses,
} from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { resolvePathNames } from "../names.ts";

export function registerRead(program: Command, cli: Cli): void {
  program
    .command("get [path]")
    .description(
      "Read the Installation, or one value by slash path such as outputs, installation/name or layers/<id|name>/opacity. A missing path is an error; --json wraps the value with the revision.",
    )
    .action((path: string | undefined) =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const revision = view.revision.get();
        if (path === undefined) {
          cli.print({ path: null, revision, value: document }, () =>
            JSON.stringify(document, null, 2),
          );
          return;
        }
        const resolved = resolvePathNames(document, path);
        const value = getAtPath(document, resolved.split("/"));
        if (value === undefined) throw new Error(`No value at “${path}”.`);
        cli.print({ path: resolved, revision, value }, () =>
          JSON.stringify(value, null, 2),
        );
      }),
    );

  program
    .command("addresses")
    .description(
      "List every controllable Address in the Installation, Parameters included, with its value and Controller.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const [{ document }, catalog] = await Promise.all([
          cli.replica(client, summary.id),
          fetchCatalog(client),
        ]);
        const items = listAddresses(document, catalog).map((entry) => {
          const link = linkAt(document, entry.address);
          const controller =
            link === undefined
              ? undefined
              : document.controllers[link.controllerId];
          return {
            ...entry,
            value: getAtPath(document, entry.path),
            ...(link === undefined
              ? {}
              : {
                  link: {
                    id: link.id,
                    controllerId: link.controllerId,
                    anchors: link.anchors,
                    effective: effectiveValue(document, entry),
                  },
                }),
            controlledBy: controller?.name,
          };
        });
        cli.print(items, () =>
          items
            .map(
              (item) =>
                `${item.address.padEnd(32)} ${item.type.padEnd(8)} ${item.type === "trigger" ? "-" : JSON.stringify(item.link?.effective ?? item.value)}  ${item.label}${item.controlledBy === undefined ? "" : `  ← ${item.controlledBy}`}`,
            )
            .join("\n"),
        );
      }),
    );
}
