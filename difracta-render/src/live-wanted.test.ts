import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
  type VisualDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { wantedShares } from "./live-wanted.ts";

const live: VisualDefinition = {
  kind: "visual",
  id: "live",
  name: "Live",
  description: "Shows a Screen Share.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "live", default: "", label: "Share" },
  },
};
const picture: VisualDefinition = {
  kind: "visual",
  id: "picture",
  name: "Picture",
  description: "Shows an image.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "image", default: "", label: "Image" },
  },
};
const catalog = new Catalog({ visuals: [live, picture] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(`${name}: ${result.error}`);
  return result.document;
}

function installation(): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", { id: "out_a", name: "A" });
  document = run(document, "output.create", { id: "out_b", name: "B" });
  document = run(document, "surface.create", {
    id: "sur_wall",
    name: "Wall",
    outputs: ["out_a"],
  });
  document = run(document, "surface.create", {
    id: "sur_tv",
    name: "TV",
    outputs: ["out_b"],
  });
  document = run(document, "region.create", {
    id: "reg_corner",
    surfaceId: "sur_wall",
    name: "Corner",
  });
  for (const id of ["m_laptop", "m_booth"])
    document = run(document, "media.create", { id, kind: "share", name: id });
  document = run(document, "media.create", { id: "m_logo", path: "logo.png" });
  document = run(document, "scene.create", { id: "sc_one", name: "One" });
  document = run(document, "scene.create", { id: "sc_two", name: "Two" });
  return run(document, "scene.play", { sceneId: "sc_one" });
}

function layer(
  document: Document,
  id: string,
  options: {
    scene?: string;
    target?: string | null;
    visual?: string;
    media?: string;
  } = {},
): Document {
  let next = run(document, "layer.create", {
    id,
    kind: "visual",
    sceneId: options.scene ?? "sc_one",
    target: options.target === undefined ? "sur_wall" : options.target,
  });
  next = run(next, "layer.visual", {
    layerId: id,
    visual: options.visual ?? "live",
  });
  if (options.media !== undefined)
    next = run(next, "address.set", {
      address: `layer/${id}/param/media`,
      value: options.media,
    });
  return next;
}

const ids = (document: Document, outputId = "out_a"): string[] =>
  [...wantedShares(document, outputId, catalog)].sort();

describe("The Screen Shares an Output views", () => {
  it("are the ones the active Scene's Layers name, on its own Surfaces and Regions", () => {
    let document = installation();
    expect(ids(document)).toEqual([]);
    document = layer(document, "l_none");
    expect(ids(document)).toEqual([]);
    document = layer(document, "l_wall", { media: "m_laptop" });
    document = layer(document, "l_corner", {
      media: "m_booth",
      target: "reg_corner",
    });
    document = layer(document, "l_again", { media: "m_laptop" });
    expect(ids(document)).toEqual(["m_booth", "m_laptop"]);
    expect(ids(document, "out_b")).toEqual([]);
  });

  it("count a disabled Layer, and not one of another Scene, without a Target or on another Output", () => {
    let document = installation();
    document = layer(document, "l_off", { media: "m_laptop" });
    document = run(document, "address.set", {
      address: "layer/l_off/enabled",
      value: false,
    });
    document = layer(document, "l_later", {
      media: "m_booth",
      scene: "sc_two",
    });
    expect(ids(document)).toEqual(["m_laptop"]);
    document = run(document, "scene.play", { sceneId: "sc_two" });
    expect(ids(document)).toEqual(["m_booth"]);

    let other = installation();
    other = layer(other, "l_nowhere", { media: "m_laptop", target: null });
    other = layer(other, "l_tv", { media: "m_booth", target: "sur_tv" });
    expect(ids(other)).toEqual([]);
    expect(ids(other, "out_b")).toEqual(["m_booth"]);
  });

  it("are no other Media, and none without an active Scene", () => {
    let document = installation();
    document = layer(document, "l_logo", {
      visual: "picture",
      media: "m_logo",
    });
    expect(ids(document)).toEqual([]);
    const idle = emptyDocument("Empty");
    expect(ids(idle)).toEqual([]);
  });
});
