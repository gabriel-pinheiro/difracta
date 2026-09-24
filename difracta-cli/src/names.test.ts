import { CommandError } from "@difracta/client";
import {
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import {
  inTypedTerms,
  resolveAddressNames,
  resolveId,
  resolvePathNames,
  resolvePayloadNames,
} from "./names.ts";

const registry = createBuiltInRegistry();

function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["output.create", { id: "out_tv", name: "TV" }],
    ["surface.create", { id: "sur_wall", name: "Wall" }],
    ["scene.create", { id: "sc_live", name: "Live" }],
    ["scene.create", { id: "sc_reh", name: "Rehearsal" }],
    [
      "layer.create",
      { id: "lay_1", sceneId: "sc_live", kind: "visual", name: "Wash" },
    ],
    [
      "layer.create",
      { id: "lay_2", sceneId: "sc_reh", kind: "visual", name: "Wash" },
    ],
    [
      "layer.create",
      { id: "lay_g", sceneId: "sc_live", kind: "group", name: "Looks" },
    ],
    ["controller.create", { id: "ctl_e", kind: "number", name: "Energy" }],
    ["controller.create", { id: "ctl_g", kind: "group", name: "Looks" }],
    ["macro.create", { id: "mac_hit", name: "Hit" }],
  ] as const) {
    const result = executeCommand(registry, document, name, payload);
    if (!result.ok) throw new Error(result.error);
    document = result.document;
  }
  return document;
}

describe("resolveId", () => {
  it("passes an existing id through, whatever the names", () => {
    const document = stage();
    expect(resolveId(document, "layers", "lay_1")).toBe("lay_1");
    expect(resolveId(document, "outputs", "out_tv")).toBe("out_tv");
  });

  it("finds a unique name ignoring case and surrounding whitespace", () => {
    const document = stage();
    expect(resolveId(document, "outputs", "tv")).toBe("out_tv");
    expect(resolveId(document, "controllers", " energy ")).toBe("ctl_e");
    expect(resolveId(document, "scenes", "REHEARSAL")).toBe("sc_reh");
  });

  it("lists the candidates when a name is ambiguous, with where each lives", () => {
    const document = stage();
    expect(() => resolveId(document, "layers", "Wash")).toThrow(
      "“Wash” matches 2 Layers: Wash (lay_1, in Scene Live), Wash (lay_2, in Scene Rehearsal)",
    );
  });

  it("names the table when nothing matches", () => {
    const document = stage();
    expect(() => resolveId(document, "macros", "Nope")).toThrow(
      "No Macro is called or identified “Nope”.",
    );
    expect(() => resolveId(document, "links", "Nope")).toThrow("No Link");
  });
});

describe("resolveAddressNames", () => {
  it("replaces the entity segment of an Address, leaving the rest", () => {
    const document = stage();
    expect(resolveAddressNames(document, "layer/Looks/enabled")).toBe(
      "layer/lay_g/enabled",
    );
    expect(resolveAddressNames(document, "controller/Energy/value")).toBe(
      "controller/ctl_e/value",
    );
    expect(resolveAddressNames(document, "macro/hit/run")).toBe(
      "macro/mac_hit/run",
    );
    expect(resolveAddressNames(document, "scene/Live/play")).toBe(
      "scene/sc_live/play",
    );
    expect(resolveAddressNames(document, "surface/Wall/render-scale")).toBe(
      "surface/sur_wall/render-scale",
    );
  });

  it("leaves Addresses without an entity segment alone", () => {
    const document = stage();
    expect(resolveAddressNames(document, "installation/blackout")).toBe(
      "installation/blackout",
    );
    expect(resolveAddressNames(document, "layer/Wash")).toBe("layer/Wash");
  });
});

describe("resolvePathNames", () => {
  it("turns a name in a table path into its id and leaves an unknown one as typed", () => {
    const document = stage();
    expect(resolvePathNames(document, "layers/Looks/enabled")).toBe(
      "layers/lay_g/enabled",
    );
    expect(resolvePathNames(document, "outputs/tv")).toBe("outputs/out_tv");
    expect(resolvePathNames(document, "layers/nope")).toBe("layers/nope");
    expect(resolvePathNames(document, "installation/name")).toBe(
      "installation/name",
    );
    expect(() => resolvePathNames(document, "layers/Wash/opacity")).toThrow(
      "matches 2 Layers",
    );
  });
});

describe("resolvePayloadNames", () => {
  it("resolves entity.move's id and after against the table it names", () => {
    const document = stage();
    expect(
      resolvePayloadNames(document, "entity.move", {
        table: "scenes",
        id: "Rehearsal",
        after: "live",
      }),
    ).toEqual({ table: "scenes", id: "sc_reh", after: "sc_live" });
    // A create's id is the new entity's, never looked up.
    expect(
      resolvePayloadNames(document, "scene.create", { id: "Live", name: "X" }),
    ).toEqual({ id: "Live", name: "X" });
  });

  it("resolves id fields, parentId by the command's table, and lists", () => {
    const document = stage();
    expect(
      resolvePayloadNames(document, "layer.create", {
        kind: "visual",
        sceneId: "live",
        parentId: "Looks",
        name: "Beam",
      }),
    ).toEqual({
      kind: "visual",
      sceneId: "sc_live",
      parentId: "lay_g",
      name: "Beam",
    });
    expect(
      resolvePayloadNames(document, "controller.move", {
        controllerId: "Energy",
        parentId: "Looks",
        after: null,
      }),
    ).toEqual({ controllerId: "ctl_e", parentId: "ctl_g", after: null });
    expect(
      resolvePayloadNames(document, "layer.update", {
        layerId: "Looks",
        target: "wall",
      }),
    ).toEqual({ layerId: "lay_g", target: "sur_wall" });
    expect(
      resolvePayloadNames(document, "surface.assign", {
        surfaceId: "Wall",
        output: "TV",
      }),
    ).toEqual({ surfaceId: "sur_wall", output: "out_tv" });
    expect(
      resolvePayloadNames(document, "layer.group", {
        layerIds: ["Looks", "lay_1"],
      }),
    ).toEqual({ layerIds: ["lay_g", "lay_1"] });
  });

  it("resolves Addresses in link and Macro payloads", () => {
    const document = stage();
    expect(
      resolvePayloadNames(document, "link.create", {
        controllerId: "Energy",
        addresses: ["layer/Looks/enabled", "installation/blackout"],
      }),
    ).toEqual({
      controllerId: "ctl_e",
      addresses: ["layer/lay_g/enabled", "installation/blackout"],
    });
    expect(
      resolvePayloadNames(document, "macro.actions.add", {
        macroId: "Hit",
        actions: [
          { kind: "trigger", address: "scene/Rehearsal/play" },
          { kind: "set", address: "installation/blackout", value: true },
        ],
      }),
    ).toEqual({
      macroId: "mac_hit",
      actions: [
        { kind: "trigger", address: "scene/sc_reh/play" },
        { kind: "set", address: "installation/blackout", value: true },
      ],
    });
  });

  it("leaves everything else untouched, and fails loudly on ambiguity", () => {
    const document = stage();
    expect(
      resolvePayloadNames(document, "output.rename", {
        outputId: "out_tv",
        name: "Wash",
      }),
    ).toEqual({ outputId: "out_tv", name: "Wash" });
    expect(resolvePayloadNames(document, "x.y", "text")).toBe("text");
    expect(() =>
      resolvePayloadNames(document, "layer.remove", { layerId: "Wash" }),
    ).toThrow("matches 2 Layers");
  });
});

describe("inTypedTerms", () => {
  it("retells an error with the Address as typed, keeping its kind and issues", () => {
    const retold = inTypedTerms(
      new CommandError("Unknown address “layer/lay_1/param/fish”: …", ["i"]),
      "layer/lay_1/param/fish",
      "layer/Wash/param/fish",
    );
    expect(retold).toBeInstanceOf(CommandError);
    expect((retold as CommandError).message).toBe(
      "Unknown address “layer/Wash/param/fish”: …",
    );
    expect((retold as CommandError).issues).toEqual(["i"]);
  });

  it("leaves an error alone when nothing was resolved", () => {
    const error = new Error("x");
    expect(inTypedTerms(error, "a/b", "a/b")).toBe(error);
    expect(inTypedTerms("boom", "a/b", "a/c")).toBe("boom");
  });
});
