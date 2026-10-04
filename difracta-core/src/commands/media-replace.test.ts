import { describe, expect, it } from "vitest";

import { executeCommand } from "../command/execute.ts";
import { installation } from "../document/media-uses-fixture.ts";
import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import type { Document } from "../document/document.ts";
import { createBuiltInRegistry } from "./index.ts";

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
const registry = createBuiltInRegistry(
  new Catalog({ visuals: [picture, live] }),
);

const mediaOf = (document: Document, layerId: string): unknown => {
  const layer = document.layers[layerId];
  return layer?.kind === "visual" ? layer.parameters.media : undefined;
};

describe("media.replace", () => {
  it("swaps a Pack entry reference in every Layer and Macro action holding it", () => {
    const result = executeCommand(registry, installation(), "media.replace", {
      from: "neon-k7f3/logo",
      to: "bundled/beam",
    });
    if (!result.ok) throw new Error(result.error);
    expect(mediaOf(result.document, "l_a")).toBe("bundled/beam");
    expect(mediaOf(result.document, "l_b")).toBe("bundled/beam");
    expect(mediaOf(result.document, "l_c")).toBe("bundled/beam");
    expect(mediaOf(result.document, "l_live")).toBe("share_a");
    const macro = result.document.macros.m;
    expect(
      macro?.kind === "macro" &&
        macro.actions.map((action) =>
          "value" in action ? action.value : null,
        ),
    ).toEqual(["bundled/beam", 2, "share_a", ""]);
    expect(result.patches).toHaveLength(3);
  });

  it("swaps one Screen Share for another the Installation has, and refuses mixed or unknown ones", () => {
    let document = installation();
    const added = executeCommand(registry, document, "share.create", {
      id: "share_b",
    });
    if (!added.ok) throw new Error(added.error);
    document = added.document;
    const result = executeCommand(registry, document, "media.replace", {
      from: "share_a",
      to: "share_b",
    });
    if (!result.ok) throw new Error(result.error);
    expect(mediaOf(result.document, "l_live")).toBe("share_b");
    const refuse = (payload: unknown): string => {
      const outcome = executeCommand(
        registry,
        document,
        "media.replace",
        payload,
      );
      return outcome.ok ? "" : outcome.error;
    };
    expect(refuse({ from: "share_a", to: "bundled/beam" })).toContain(
      "Both references",
    );
    expect(refuse({ from: "share_a", to: "share_zzz" })).toContain("neither");
    expect(refuse({ from: "nope", to: "share_a" })).toContain("neither");
    const same = executeCommand(registry, document, "media.replace", {
      from: "share_a",
      to: "share_a",
    });
    expect(same.ok && same.patches).toEqual([]);
  });
});
