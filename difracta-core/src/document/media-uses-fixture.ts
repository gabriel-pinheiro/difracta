import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { createBuiltInRegistry } from "../commands/index.ts";
import { emptyDocument, type Document } from "./document.ts";

/** What the tests of the reference scan and of `media.replace` stand on: Layers and a Macro holding references. */
const picture: VisualDefinition = {
  kind: "visual",
  id: "picture",
  name: "Picture",
  description: "Shows an image.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "image", label: "Image", default: "" },
    speed: { kind: "number", label: "Speed", default: 1, min: 0, max: 2 },
  },
};
const live: VisualDefinition = {
  kind: "visual",
  id: "live",
  name: "Live",
  description: "Shows a Screen Share.",
  backend: "shader",
  parameters: {
    media: {
      kind: "media",
      accepts: "live",
      label: "Screen Share",
      default: "",
    },
  },
};
export const catalog = new Catalog({ visuals: [picture, live] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/** Two Picture Layers on the same entry, a Live Layer on a share, a Macro setting both and a speed. */
export function installation(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["share.create", { id: "share_a", name: "Laptop" }],
    ["scene.create", { id: "scene", name: "Main" }],
    ["layer.create", { id: "l_a", sceneId: "scene", kind: "visual" }],
    [
      "layer.visual",
      {
        layerId: "l_a",
        visual: "picture",
        parameters: { media: "neon-k7f3/logo" },
      },
    ],
    ["layer.create", { id: "l_b", sceneId: "scene", kind: "visual" }],
    [
      "layer.visual",
      {
        layerId: "l_b",
        visual: "picture",
        parameters: { media: "neon-k7f3/logo" },
      },
    ],
    ["layer.create", { id: "l_c", sceneId: "scene", kind: "visual" }],
    [
      "layer.visual",
      {
        layerId: "l_c",
        visual: "picture",
        parameters: { media: "bundled/beam" },
      },
    ],
    ["layer.create", { id: "l_live", sceneId: "scene", kind: "visual" }],
    [
      "layer.visual",
      { layerId: "l_live", visual: "live", parameters: { media: "share_a" } },
    ],
    ["layer.create", { id: "l_none", sceneId: "scene", kind: "visual" }],
    ["layer.visual", { layerId: "l_none", visual: "picture" }],
    ["macro.create", { id: "m", name: "Swap" }],
    [
      "macro.actions.add",
      {
        macroId: "m",
        actions: [
          {
            address: "layer/l_a/param/media",
            kind: "set",
            value: "neon-k7f3/logo",
          },
          { address: "layer/l_a/param/speed", kind: "set", value: 2 },
          {
            address: "layer/l_live/param/media",
            kind: "set",
            value: "share_a",
          },
          { address: "layer/l_b/param/media", kind: "set", value: "" },
        ],
      },
    ],
  ] as const)
    document = run(document, name, payload);
  return document;
}
