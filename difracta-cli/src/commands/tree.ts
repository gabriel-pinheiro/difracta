import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { resolveId } from "../names.ts";
import {
  describeController,
  describeMacro,
  formatSceneRows,
  formatSceneTree,
  formatTreeNodes,
  sceneRows,
  sceneTree,
  treeNodes,
} from "../scene-tree.ts";

export function registerTree(program: Command, cli: Cli): void {
  program
    .command("scenes")
    .description(
      "List the Scenes: name, id, the active one marked, Layer count.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const rows = sceneRows(document);
        cli.print(rows, () => formatSceneRows(rows).join("\n"));
      }),
    );

  program
    .command("scene <scene>")
    .description(
      "Show a Scene's Layers as a tree, top first: kind, name, id, enabled (gated by its Group), Visual or Filter, opacity or mix with its Controller, Target Surface.",
    )
    .action((reference: string) =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const id = resolveId(document, "scenes", reference);
        const name = document.scenes[id]?.name ?? id;
        const active = document.installation.activeScene === id;
        const layers = sceneTree(document, id);
        cli.print({ id, name, active, layers }, () =>
          [
            `${active ? "▶ " : ""}Scene “${name}”  ${id}`,
            ...formatSceneTree(layers, 1),
          ].join("\n"),
        );
      }),
    );

  program
    .command("controllers")
    .description("List the Controllers in their Groups, with their values.")
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const nodes = treeNodes(document.controllers);
        cli.print(nodes, () =>
          formatTreeNodes(nodes, describeController).join("\n"),
        );
      }),
    );

  program
    .command("macros")
    .description("List the Macros in their Groups, with their action counts.")
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const nodes = treeNodes(document.macros);
        cli.print(nodes, () =>
          formatTreeNodes(nodes, describeMacro).join("\n"),
        );
      }),
    );
}
