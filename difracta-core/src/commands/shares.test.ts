import { describe, expect, it } from "vitest";

import { resolveAddress } from "../address/address.ts";
import { Catalog, type VisualDefinition } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { emptyDocument, type Document } from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { createBuiltInRegistry } from "./index.ts";

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
const catalog = new Catalog({ visuals: [live] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}
function refuse(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error(`${name} was accepted.`);
  return result.error;
}

function withShares(): Document {
  let document = emptyDocument("Living");
  document = run(document, "share.create", { id: "share_a" }).document;
  document = run(document, "share.create", { id: "share_b" }).document;
  document = run(document, "share.create", {
    id: "share_c",
    name: "Booth",
    after: null,
  }).document;
  return document;
}

describe("Screen Shares", () => {
  it("are created as named slots, numbered like any name, in order", () => {
    const document = withShares();
    expect(
      orderedEntries(document.shares).map((share) => [share.id, share.name]),
    ).toEqual([
      ["share_c", "Booth"],
      ["share_a", "Screen Share"],
      ["share_b", "Screen Share 1"],
    ]);
    expect(refuse(document, "share.create", { id: "share_a" })).toContain(
      "already exists",
    );
    expect(refuse(document, "share.create", { after: "share_nope" })).toContain(
      "not among",
    );
    expect(
      Object.keys(run(document, "share.create", {}).document.shares).at(-1),
    ).toMatch(/^share_[0-9a-f]{12}$/);
  });

  it("are renamed uniquely and reordered with entity.move", () => {
    let document = withShares();
    document = run(document, "share.rename", {
      shareId: "share_b",
      name: "Booth",
    }).document;
    expect(document.shares.share_b?.name).toBe("Booth 1");
    expect(
      run(document, "share.rename", { shareId: "share_b", name: "Booth 1" })
        .patches,
    ).toEqual([]);
    expect(
      refuse(document, "share.rename", { shareId: "nope", name: "x" }),
    ).toContain("does not exist");
    document = run(document, "entity.move", {
      table: "shares",
      id: "share_c",
      after: "share_b",
    }).document;
    expect(orderedEntries(document.shares).map((share) => share.id)).toEqual([
      "share_a",
      "share_b",
      "share_c",
    ]);
  });

  it("are the only values a live Parameter takes, and removing one clears it and drops the actions", () => {
    let document = withShares();
    document = run(document, "scene.create", {
      id: "scene",
      name: "Main",
    }).document;
    document = run(document, "layer.create", {
      id: "l",
      sceneId: "scene",
      kind: "visual",
    }).document;
    document = run(document, "layer.visual", {
      layerId: "l",
      visual: "live",
    }).document;
    expect(
      refuse(document, "address.set", {
        address: "layer/l/param/media",
        value: "share_nope",
      }),
    ).toContain("no Screen Share");
    expect(
      refuse(document, "address.set", {
        address: "layer/l/param/media",
        value: "neon/clip",
      }),
    ).toContain("no Screen Share");
    document = run(document, "address.set", {
      address: "layer/l/param/media",
      value: "share_a",
    }).document;
    const resolved = resolveAddress(document, "layer/l/param/media", catalog);
    expect(resolved).toMatchObject({ type: "media", accepts: "live" });
    expect(resolved?.options).toBeUndefined();
    document = run(document, "macro.create", {
      id: "m",
      name: "Show",
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "m",
      actions: [
        { address: "layer/l/param/media", kind: "set", value: "share_a" },
        { address: "layer/l/param/media", kind: "set", value: "share_b" },
        { address: "layer/l/enabled", kind: "toggle" },
      ],
    }).document;
    const removed = run(document, "share.remove", { shareId: "share_a" });
    expect(removed.document.shares.share_a).toBeUndefined();
    const layer = removed.document.layers.l;
    expect(layer?.kind === "visual" && layer.parameters.media).toBe("");
    const macro = removed.document.macros.m;
    expect(
      macro?.kind === "macro" && macro.actions.map((action) => action.address),
    ).toEqual(["layer/l/param/media", "layer/l/enabled"]);
    expect(
      refuse(removed.document, "share.remove", { shareId: "share_a" }),
    ).toContain("does not exist");
  });
});
