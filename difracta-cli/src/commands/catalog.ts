import type { Definition, ParameterDefinition } from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { bundledFlags, describeBundled } from "./media-bundled.ts";

export function registerCatalog(program: Command, cli: Cli): void {
  program
    .command("catalog [id]")
    .description(
      "List the Visuals and Filters the runtime renders and its Bundled Media, or describe one: notes, Parameters, Cues; for a Bundled Media entry, notes, size, duration and flags.",
    )
    .action((id: string | undefined) =>
      cli.withClient(async (client) => {
        const catalog = await fetchCatalog(client);
        if (id === undefined) {
          const items = [...catalog.visuals(), ...catalog.filters()];
          const media = catalog.media();
          cli.print([...items, ...media], () =>
            [
              ...items.map(
                (item) =>
                  `${item.id.padEnd(20)} ${item.kind.padEnd(8)} ${item.backend.padEnd(8)} ${item.recommended === true ? "★ " : "  "}${item.description}`,
              ),
              ...(media.length === 0
                ? []
                : [
                    "",
                    "Bundled Media",
                    ...media.map((entry) => {
                      const flags = bundledFlags(entry);
                      return `${entry.id.padEnd(28)} ${entry.type.padEnd(6)} ${entry.recommended === true ? "★ " : "  "}${entry.name}${flags === "" ? "" : ` (${flags})`}: ${entry.description}`;
                    }),
                  ]),
            ].join("\n"),
          );
          return;
        }
        const entry = catalog.mediaEntry(id);
        if (entry !== undefined) {
          cli.print(entry, () => describeBundled(entry));
          return;
        }
        const definition = catalog.visual(id) ?? catalog.filter(id);
        if (definition === undefined)
          throw new Error(
            `Unknown definition “${id}”. Try \`difracta catalog\`.`,
          );
        cli.print(definition, () => describeDefinition(definition));
      }),
    );
}

function describeDefinition(definition: Definition): string {
  const lines = [
    `${definition.name}  (${definition.kind}, ${definition.backend}${definition.recommended === true ? ", recommended" : ""})  id: ${definition.id}`,
    definition.description,
  ];
  if (definition.notes !== undefined) lines.push("", definition.notes);
  lines.push("", "Parameters");
  for (const [name, parameter] of Object.entries(definition.parameters))
    lines.push(`  ${name.padEnd(12)} ${describeParameter(parameter)}`);
  if (definition.cues !== undefined && definition.cues.length > 0) {
    lines.push("", "Cues");
    for (const cue of definition.cues)
      lines.push(
        `  ${cue.key.padEnd(12)} ${cue.label}${cue.description === undefined ? "" : `  ${cue.description}`}`,
      );
  }
  if (definition.kind === "visual" && definition.paths !== undefined) {
    lines.push("", "Paths (bind with layer.path)");
    for (const path of definition.paths)
      lines.push(
        `  ${path.key.padEnd(12)} ${path.label}${path.description === undefined ? "" : `  ${path.description}`}`,
      );
  }
  return lines.join("\n");
}

function describeParameter(parameter: ParameterDefinition): string {
  const tail =
    parameter.description === undefined ? "" : `  ${parameter.description}`;
  switch (parameter.kind) {
    case "number":
      return `${parameter.label.padEnd(16)} number   default ${String(parameter.default)}  ${String(parameter.min)} to ${String(parameter.max)}${parameter.step === undefined ? "" : ` step ${String(parameter.step)}`}${parameter.unit === undefined ? "" : ` ${parameter.unit}`}${parameter.percent === true ? " (shown as %)" : ""}${tail}`;
    case "color":
      return `${parameter.label.padEnd(16)} color    default [${parameter.default.join(", ")}] (r, g, b, a from 0 to 1)${tail}`;
    case "choice":
      return `${parameter.label.padEnd(16)} choice   default ${parameter.default}  one of ${parameter.options.map((option) => option.value).join(", ")}${tail}`;
    case "boolean":
      return `${parameter.label.padEnd(16)} boolean  default ${String(parameter.default)}${tail}`;
    case "media":
      return `${parameter.label.padEnd(16)} media    default "" (none)  the id of ${parameter.accepts === "image" ? "an image" : "a video"} Media item (\`difracta media list\`)${tail}`;
  }
}
