import {
  effectiveValue,
  getAtPath,
  linkAt,
  listAddresses,
  resolveAddress,
} from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { resolveAddressNames, resolvePathNames } from "../names.ts";

export function registerRead(program: Command, cli: Cli): void {
  program
    .command("get [path]")
    .description(
      "Read the Installation, or one value by document path (outputs, installation/name, layers/<id|name>/opacity) or by Address (layer/Wash/opacity, controller/Energy/value, installation/blackout), a linked Address at its effective value. Nothing there is an error; --json wraps the value with the revision.",
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
        const atPath = getAtPath(document, resolved.split("/"));
        if (atPath !== undefined) {
          cli.print({ path: resolved, revision, value: atPath }, () =>
            JSON.stringify(atPath, null, 2),
          );
          return;
        }
        // Not a document path: an Address, read the way a Link or OSC sees it.
        const address = resolveAddressNames(document, path);
        const entry = resolveAddress(
          document,
          address,
          await fetchCatalog(client),
        );
        if (entry === undefined) throw new Error(`No value at “${path}”.`);
        if (entry.type === "trigger")
          throw new Error(`“${address}” is a trigger, not a value.`);
        const value = effectiveValue(document, entry);
        cli.print({ path: address, revision, value }, () =>
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
