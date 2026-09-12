import { describe, expect, it } from "vitest";

import { actionProblem } from "../address/fire.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import {
  emptyDocument,
  type Document,
  type RunnableMacro,
  type VisualLayer,
} from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { createBuiltInRegistry } from "./index.ts";

const catalog = new Catalog({
  visuals: [
    {
      kind: "visual",
      id: "blink",
      name: "Blink",
      description: "Flashes.",
      backend: "shader",
      parameters: {
        hold: {
          kind: "number",
          label: "Hold",
          default: 100,
          min: 0,
          max: 2000,
          step: 10,
          unit: "ms",
        },
        mirror: { kind: "boolean", label: "Mirror", default: false },
      },
      cues: [{ key: "flash", label: "Flash" }],
    },
    {
      kind: "visual",
      id: "solid",
      name: "Solid",
      description: "One color.",
      backend: "canvas",
      parameters: {
        color: { kind: "color", label: "Color", default: [0, 0, 0, 1] },
      },
    },
  ],
  filters: [],
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown) {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result;
}

function failure(document: Document, name: string, payload: unknown): string {
  const result = executeCommand(registry, document, name, payload);
  if (result.ok) throw new Error("Expected a rejection.");
  return result.error;
}

function stage(): Document {
  let document = emptyDocument("Living");
  for (const [name, payload] of [
    ["scene.create", { id: "s", name: "Live" }],
    ["scene.create", { id: "t", name: "Calm" }],
    ["layer.create", { id: "a", sceneId: "s", kind: "visual" }],
    ["layer.visual", { layerId: "a", visual: "blink" }],
    ["layer.create", { id: "b", sceneId: "s", kind: "visual" }],
    ["layer.visual", { layerId: "b", visual: "blink" }],
    ["controller.create", { id: "energy", kind: "number", name: "Energy" }],
    ["macro.create", { id: "hit", name: "Hit" }],
    ["macro.create", { id: "look", name: "Look" }],
  ] as const)
    document = run(document, name, payload).document;
  return document;
}

const macro = (document: Document, id: string): RunnableMacro =>
  document.macros[id] as RunnableMacro;
const layer = (document: Document, id: string): VisualLayer =>
  document.layers[id] as VisualLayer;
const actionsOf = (document: Document, id: string) =>
  macro(document, id).actions.map(({ kind, address }) => `${kind} ${address}`);

describe("Macros", () => {
  it("creates, groups, moves, duplicates, ungroups and removes Macros", () => {
    let document = stage();
    expect(macro(document, "hit")).toMatchObject({
      kind: "macro",
      actions: [],
    });
    expect(orderedEntries(document.macros).map((m) => m.id)).toEqual([
      "look",
      "hit",
    ]);
    document = run(document, "macro.create", {
      id: "g",
      kind: "group",
      name: "Hits",
    }).document;
    document = run(document, "macro.move", {
      macroId: "hit",
      parentId: "g",
      after: null,
    }).document;
    expect(document.macros.hit?.parentId).toBe("g");
    expect(
      failure(document, "macro.move", {
        macroId: "g",
        parentId: "g",
        after: null,
      }),
    ).toMatch(/into itself/);
    document = run(document, "macro.actions.add", {
      macroId: "hit",
      actions: [{ kind: "trigger", address: "layer/a/cue/flash" }],
    }).document;
    document = run(document, "macro.duplicate", {
      macroId: "g",
      id: "g2",
    }).document;
    const copied = orderedEntries(document.macros).filter(
      (m) => m.parentId === "g2",
    );
    expect(copied).toHaveLength(1);
    expect(copied[0]?.name).toBe("Hit");
    expect(macro(document, copied[0]?.id ?? "").actions[0]?.id).not.toBe(
      macro(document, "hit").actions[0]?.id,
    );
    document = run(document, "macro.ungroup", { macroId: "g2" }).document;
    expect(document.macros.g2).toBeUndefined();
    expect(document.macros[copied[0]?.id ?? ""]?.parentId).toBeNull();
    // Another Macro running the Group's Macro loses that action when the Group goes.
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "trigger", address: "macro/hit/run" },
        { kind: "set", address: "installation/blackout", value: false },
      ],
    }).document;
    document = run(document, "macro.remove", { macroId: "g" }).document;
    expect(document.macros.hit).toBeUndefined();
    expect(actionsOf(document, "look")).toEqual(["set installation/blackout"]);
  });

  it("adds, edits, reorders and removes actions", () => {
    let document = stage();
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "set", address: "layer/a/opacity", value: 0.5 },
        { kind: "set", address: "layer/a/param/hold", value: 500 },
        { kind: "trigger", address: "scene/t/play" },
      ],
    }).document;
    const [opacity, hold, play] = macro(document, "look").actions;
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [{ kind: "toggle", address: "layer/b/enabled" }],
      after: null,
    }).document;
    expect(actionsOf(document, "look")).toEqual([
      "toggle layer/b/enabled",
      "set layer/a/opacity",
      "set layer/a/param/hold",
      "trigger scene/t/play",
    ]);
    document = run(document, "macro.action.move", {
      macroId: "look",
      actionId: play?.id,
      after: null,
    }).document;
    document = run(document, "macro.action.update", {
      macroId: "look",
      actionId: hold?.id,
      value: 700,
    }).document;
    document = run(document, "macro.action.update", {
      macroId: "look",
      actionId: macro(document, "look").actions[1]?.id,
      kind: "set",
      value: false,
    }).document;
    document = run(document, "macro.action.remove", {
      macroId: "look",
      actionId: opacity?.id,
    }).document;
    expect(macro(document, "look").actions).toMatchObject([
      { kind: "trigger", address: "scene/t/play" },
      { kind: "set", address: "layer/b/enabled", value: false },
      { kind: "set", address: "layer/a/param/hold", value: 700 },
    ]);
    expect(
      failure(document, "macro.actions.add", {
        macroId: "look",
        actions: [{ kind: "set", address: "layer/zz/opacity", value: 1 }],
      }),
    ).toMatch(/Unknown address/);
    expect(
      failure(document, "macro.actions.add", {
        macroId: "look",
        actions: [{ kind: "toggle", address: "layer/a/opacity" }],
      }),
    ).toMatch(/not a switch/);
    expect(
      failure(document, "macro.actions.add", {
        macroId: "look",
        actions: [{ kind: "set", address: "layer/a/param/hold", value: "x" }],
      }),
    ).toMatch(/value/);
    expect(
      failure(document, "macro.actions.add", {
        macroId: "look",
        actions: [{ kind: "set", address: "layer/a/cue/flash", value: 1 }],
      }),
    ).toMatch(/trigger/);
  });

  it("runs actions in order, best-effort, through address.trigger", () => {
    let document = stage();
    document = run(document, "link.create", {
      controllerId: "energy",
      addresses: ["layer/b/opacity"],
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "trigger", address: "scene/t/play" },
        { kind: "set", address: "layer/a/opacity", value: 0.25 },
        { kind: "toggle", address: "layer/a/enabled" },
        { kind: "toggle", address: "layer/a/enabled" },
        { kind: "set", address: "layer/b/opacity", value: 0.5 },
        { kind: "trigger", address: "layer/a/cue/flash" },
        { kind: "set", address: "layer/a/param/hold", value: 900 },
      ],
    }).document;
    expect(
      macro(document, "look").actions.map((action) =>
        actionProblem(document, catalog, action),
      ),
    ).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      "Opacity is controlled by Energy.",
      undefined,
      undefined,
    ]);
    const result = run(document, "address.trigger", {
      address: "macro/look/run",
    });
    expect(result.definition.kind).toBe("performance");
    expect(result.events).toEqual(["layer/a/cue/flash"]);
    expect(result.warnings).toEqual(["Look: Opacity is controlled by Energy."]);
    document = result.document;
    expect(document.installation.activeScene).toBe("t");
    expect(layer(document, "a")).toMatchObject({
      opacity: 0.25,
      enabled: true,
      parameters: { hold: 900 },
    });
    expect(layer(document, "b").opacity).toBe(1);
    expect(
      failure(document, "address.trigger", { address: "macro/nope/run" }),
    ).toMatch(/Unknown address/);
  });

  it("lets Macros run Macros, each at most once per run", () => {
    let document = stage();
    document = run(document, "macro.create", {
      id: "all",
      name: "All",
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "hit",
      actions: [
        { kind: "trigger", address: "layer/a/cue/flash" },
        { kind: "trigger", address: "macro/look/run" },
      ],
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "trigger", address: "layer/b/cue/flash" },
        { kind: "trigger", address: "macro/hit/run" },
      ],
    }).document;
    document = run(document, "macro.actions.add", {
      macroId: "all",
      actions: [
        { kind: "trigger", address: "macro/hit/run" },
        { kind: "trigger", address: "macro/look/run" },
      ],
    }).document;
    const result = run(document, "address.trigger", {
      address: "macro/all/run",
    });
    expect(result.events).toEqual(["layer/a/cue/flash", "layer/b/cue/flash"]);
    expect(result.warnings).toEqual([
      "Hit: already ran during this run.",
      "Look: already ran during this run.",
    ]);
  });

  it("drops actions with the Layer, Scene, Controller or Parameter they target", () => {
    let document = stage();
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "set", address: "layer/a/opacity", value: 0.5 },
        { kind: "set", address: "layer/a/param/hold", value: 500 },
        { kind: "set", address: "layer/b/opacity", value: 0.5 },
        { kind: "trigger", address: "scene/t/play" },
        { kind: "set", address: "controller/energy/value", value: 1 },
        { kind: "set", address: "installation/blackout", value: true },
      ],
    }).document;
    let next = run(document, "layer.visual", {
      layerId: "a",
      visual: "solid",
    }).document;
    expect(actionsOf(next, "look")).toEqual([
      "set layer/a/opacity",
      "set layer/b/opacity",
      "trigger scene/t/play",
      "set controller/energy/value",
      "set installation/blackout",
    ]);
    next = run(next, "layer.remove", { layerId: "a" }).document;
    next = run(next, "scene.remove", { sceneId: "t" }).document;
    next = run(next, "controller.remove", { controllerId: "energy" }).document;
    expect(actionsOf(next, "look")).toEqual([
      "set layer/b/opacity",
      "set installation/blackout",
    ]);
    // Removing the Scene the Layers are in takes their actions too.
    next = run(next, "scene.create", { id: "u", name: "Other" }).document;
    next = run(next, "scene.play", { sceneId: "u" }).document;
    next = run(next, "scene.remove", { sceneId: "s" }).document;
    expect(actionsOf(next, "look")).toEqual(["set installation/blackout"]);
  });
});
