import { flattenTree, qualifiedName } from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { liveStatus } from "../live-status.ts";
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
      "Show a Scene's Layers as a tree, top first: kind, name, id, enabled (gated by its Group), Visual or Filter, opacity or mix with its Controller, Target Surface, and any Path its Visual follows that is unbound or not on the Target.",
    )
    .action((reference: string) =>
      cli.withDocument(async (client, summary) => {
        const [{ document }, catalog] = await Promise.all([
          cli.replica(client, summary.id),
          fetchCatalog(client),
        ]);
        const id = resolveId(document, "scenes", reference);
        const name = document.scenes[id]?.name ?? id;
        const active = document.installation.activeScene === id;
        const layers = sceneTree(document, id, catalog);
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
    .command("osc")
    .description(
      "List the OSC tree a hub such as Chataigne binds to: one leaf per Controller (float 0–1 or RGBA colour) and per Macro (impulse), each described as Group · Name.",
    )
    .action(() =>
      cli.withDocument(async (client, summary) => {
        const { document, view } = await cli.replica(client, summary.id);
        const live = liveStatus(document, view.liveState.get());
        const leaves = [
          ...flattenTree(document.controllers).flatMap((controller) =>
            controller.kind === "group"
              ? []
              : [
                  {
                    path: `/controller/${controller.id}`,
                    type: controller.kind === "number" ? "f" : "r",
                    description: qualifiedName(
                      document.controllers,
                      controller,
                    ),
                    value: controller.value,
                  },
                ],
          ),
          ...flattenTree(document.macros).flatMap((macro) =>
            macro.kind === "group"
              ? []
              : [
                  {
                    path: `/macro/${macro.id}`,
                    type: "I",
                    description: qualifiedName(document.macros, macro),
                  },
                ],
          ),
        ];
        cli.print({ osc: live.osc, leaves }, () =>
          [
            live.osc.port === null
              ? "OSC is off"
              : `OSC and OSCQuery on port ${String(live.osc.port)}`,
            ...leaves.map(
              (leaf) =>
                `${leaf.path.padEnd(36)} ${leaf.type}  ${leaf.description}${"value" in leaf ? `  ${JSON.stringify(leaf.value)}` : ""}`,
            ),
          ].join("\n"),
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
