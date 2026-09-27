import {
  settings,
  type Catalog,
  type Definition,
  type FontDefinition,
  type ParameterDefinition,
} from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { fetchCatalog } from "../connection.ts";
import { bundledFlags, describeBundled } from "./media-bundled.ts";

export function registerCatalog(program: Command, cli: Cli): void {
  program
    .command("catalog [id]")
    .description(
      "List the Visuals and Filters the runtime renders, its Bundled Media and its Bundled Fonts, or describe one: notes, Parameters, Cues; for a Bundled Media entry, notes, size, duration and flags; for a Bundled Font, its files.",
    )
    .action((id: string | undefined) =>
      cli.withClient(async (client) => {
        const catalog = await fetchCatalog(client);
        if (id === undefined) {
          cli.print(
            [
              ...catalog.visuals(),
              ...catalog.filters(),
              ...catalog.media(),
              ...catalog.fonts(),
            ],
            () => formatCatalog(catalog),
          );
          return;
        }
        const entry = catalog.mediaEntry(id);
        if (entry !== undefined) {
          cli.print(entry, () => describeBundled(entry));
          return;
        }
        const font = catalog.font(id);
        if (font !== undefined) {
          cli.print(font, () => describeFont(font));
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

/** The listing: Visuals and Filters, then the Bundled Media and the Bundled Fonts under their own headings. */
export function formatCatalog(catalog: Catalog): string {
  const media = catalog.media();
  const fonts = catalog.fonts();
  return [
    ...[...catalog.visuals(), ...catalog.filters()].map(
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
    ...(fonts.length === 0
      ? []
      : [
          "",
          "Bundled Fonts",
          ...fonts.map(
            (font) => `${font.id.padEnd(20)} ${font.name}: ${font.description}`,
          ),
        ]),
  ].join("\n");
}

/** A Bundled Font in full: what it is for, how a Visual names it and where the runtime serves its files. */
export function describeFont(font: FontDefinition): string {
  return [
    `${font.name}  (Bundled Font)  id: ${font.id}`,
    font.description,
    "",
    `A Visual's Font Parameter takes the id: edit layer/<id|name>/param/<key> ${font.id}`,
    "",
    "Files",
    ...font.files.map(
      (file) =>
        `  ${file.padEnd(36)} GET ${settings.runtime.fontsPath}/${file}`,
    ),
  ].join("\n");
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

export function describeParameter(parameter: ParameterDefinition): string {
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
    case "text":
      return `${parameter.label.padEnd(16)} text     default ${JSON.stringify(parameter.default)}  ${parameter.multiline === true ? "line breaks allowed" : "a single line"}${tail}`;
  }
}
