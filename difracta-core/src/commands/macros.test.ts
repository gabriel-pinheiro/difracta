import { describe, expect, it } from "vitest";

import { actionProblem } from "../address/fire.ts";
import { Catalog } from "../catalog/catalog.ts";
import { executeCommand } from "../command/execute.ts";
import { seededRandom } from "../command/random.ts";
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

function run(
  document: Document,
  name: string,
  payload: unknown,
  random: () => number = Math.random,
) {
  const result = executeCommand(registry, document, name, payload, random);
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
    const removal = run(document, "macro.remove", { macroId: "g" });
    document = removal.document;
    expect(document.macros.hit).toBeUndefined();
    expect(actionsOf(document, "look")).toEqual(["set installation/blackout"]);
    expect(removal.warnings).toEqual([
      "Removed 1 Macro action targeting “Hits”",
    ]);
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
    const layerGone = run(next, "layer.remove", { layerId: "a" });
    expect(layerGone.warnings).toEqual([
      "Removed 1 Macro action targeting “Solid”",
    ]);
    next = layerGone.document;
    const sceneGone = run(next, "scene.remove", { sceneId: "t" });
    expect(sceneGone.warnings).toEqual([
      "Removed 1 Macro action targeting “Calm”",
    ]);
    next = sceneGone.document;
    const controllerGone = run(next, "controller.remove", {
      controllerId: "energy",
    });
    expect(controllerGone.warnings).toEqual([
      "Removed 1 Macro action targeting “Energy”",
    ]);
    next = controllerGone.document;
    expect(actionsOf(next, "look")).toEqual([
      "set layer/b/opacity",
      "set installation/blackout",
    ]);
    // Removing the Scene the Layers are in takes their actions too.
    next = run(next, "scene.create", { id: "u", name: "Other" }).document;
    next = run(next, "scene.play", { sceneId: "u" }).document;
    next = run(next, "scene.remove", { sceneId: "s" }).document;
    expect(actionsOf(next, "look")).toEqual(["set installation/blackout"]);
    // A removal that drops nothing warns about nothing.
    next = run(next, "scene.create", { id: "v", name: "Empty" }).document;
    expect(run(next, "scene.remove", { sceneId: "v" }).warnings).toEqual([]);
  });
});

describe("macro.create placement", () => {
  it("lands first unless `after` names the sibling to follow, within its Group", () => {
    let document = emptyDocument("Living");
    for (const payload of [
      { id: "g", kind: "group", name: "Hits" },
      { id: "a", parentId: "g", name: "A" },
      { id: "b", parentId: "g", name: "B", after: "a" },
      { id: "c", parentId: "g", name: "C", after: "a" },
    ] as const)
      document = run(document, "macro.create", payload).document;
    expect(
      orderedEntries(document.macros)
        .filter((macro) => macro.parentId === "g")
        .map((macro) => macro.id),
    ).toEqual(["a", "c", "b"]);
    const result = executeCommand(registry, document, "macro.create", {
      parentId: "g",
      after: "g",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error).toBe("Macro “g” is not among the siblings.");
  });

  it("stores each action's Chance and changes it alone, triggers included", () => {
    let document = stage();
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "set", address: "layer/a/opacity", value: 0.5, chance: 0.4 },
        { kind: "trigger", address: "layer/a/cue/flash" },
      ],
    }).document;
    const [opacity, flash] = macro(document, "look").actions;
    expect(opacity?.chance).toBe(0.4);
    expect(flash?.chance).toBeUndefined();
    const changed = run(document, "macro.action.update", {
      macroId: "look",
      actionId: flash?.id,
      chance: 0.2,
    });
    expect(changed.label).toBe("Change Chance");
    expect(changed.coalesceKey).toBe(
      `macro.action.update:${flash?.id ?? ""}:chance`,
    );
    document = changed.document;
    expect(macro(document, "look").actions[1]).toMatchObject({
      kind: "trigger",
      chance: 0.2,
    });
    document = run(document, "macro.action.update", {
      macroId: "look",
      actionId: opacity?.id,
      value: 0.75,
    }).document;
    expect(macro(document, "look").actions[0]).toMatchObject({
      value: 0.75,
      chance: 0.4,
    });
    document = run(document, "macro.action.update", {
      macroId: "look",
      actionId: opacity?.id,
      chance: null,
    }).document;
    expect(macro(document, "look").actions[0]?.chance).toBeUndefined();
    expect(
      failure(document, "macro.action.update", {
        macroId: "look",
        actionId: flash?.id,
        value: 1,
      }),
    ).toMatch(/only its chance/);
    expect(
      failure(document, "macro.actions.add", {
        macroId: "look",
        actions: [{ kind: "trigger", address: "scene/t/play", chance: 2 }],
      }),
    ).toMatch(/chance/);
  });

  it("sets the Run Mode and keeps the count across modes", () => {
    let document = stage();
    expect(macro(document, "hit")).toMatchObject({ mode: "all", count: 1 });
    const set = run(document, "macro.mode.set", {
      macroId: "hit",
      mode: "some",
      count: 3,
    });
    expect(set.label).toBe("Change Run Mode");
    document = set.document;
    expect(macro(document, "hit")).toMatchObject({ mode: "some", count: 3 });
    document = run(document, "macro.mode.set", {
      macroId: "hit",
      mode: "sequence",
    }).document;
    expect(macro(document, "hit")).toMatchObject({
      mode: "sequence",
      count: 3,
    });
    expect(run(document, "macro.mode.set", { macroId: "hit" }).patches).toEqual(
      [],
    );
    expect(
      failure(document, "macro.mode.set", { macroId: "hit", count: 0 }),
    ).toMatch(/count/);
    expect(
      failure(document, "macro.mode.set", { macroId: "nope", mode: "one" }),
    ).toMatch(/not a Macro/);
    const copy = run(document, "macro.duplicate", {
      macroId: "hit",
      id: "hit2",
    }).document;
    expect(macro(copy, "hit2")).toMatchObject({ mode: "sequence", count: 3 });
  });
});

describe("Run Modes", () => {
  const CUES = [
    "layer/a/cue/flash",
    "layer/b/cue/flash",
    "scene/t/play",
    "installation/blackout",
  ] as const;

  /** A Macro of four actions: two Cues, a Scene play and a Blackout toggle. */
  function shimmer(mode: string, count = 1, chance?: number): Document {
    let document = stage();
    document = run(document, "macro.actions.add", {
      macroId: "hit",
      actions: [
        {
          kind: "trigger",
          address: CUES[0],
          ...(chance === undefined ? {} : { chance }),
        },
        {
          kind: "trigger",
          address: CUES[1],
          ...(chance === undefined ? {} : { chance }),
        },
        {
          kind: "trigger",
          address: CUES[2],
          ...(chance === undefined ? {} : { chance }),
        },
        {
          kind: "toggle",
          address: CUES[3],
          ...(chance === undefined ? {} : { chance }),
        },
      ],
    }).document;
    return run(document, "macro.mode.set", { macroId: "hit", mode, count })
      .document;
  }

  /** Which of the four actions a run performed, by index. */
  function performed(result: ReturnType<typeof run>): number[] {
    const done: number[] = [];
    if (result.events.includes(CUES[0])) done.push(0);
    if (result.events.includes(CUES[1])) done.push(1);
    if (result.document.installation.activeScene === "t") done.push(2);
    if (result.document.operational.blackout) done.push(3);
    return done;
  }

  it("runs every action in All", () => {
    const result = run(shimmer("all"), "address.trigger", {
      address: "macro/hit/run",
    });
    expect(performed(result)).toEqual([0, 1, 2, 3]);
    expect(result.run).toEqual({ picked: 4, fired: 4 });
  });

  it("picks one action at random in One", () => {
    const document = shimmer("one");
    const seen = new Set<number>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const result = run(
        document,
        "address.trigger",
        { address: "macro/hit/run" },
        seededRandom(seed),
      );
      const done = performed(result);
      expect(done).toHaveLength(1);
      expect(result.run).toEqual({ picked: 1, fired: 1 });
      seen.add(done[0] ?? -1);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("picks distinct actions in Some and runs them in list order", () => {
    const document = shimmer("some", 2);
    for (let seed = 1; seed <= 12; seed += 1) {
      const result = run(
        document,
        "address.trigger",
        { address: "macro/hit/run" },
        seededRandom(seed),
      );
      expect(performed(result)).toHaveLength(2);
      expect(result.run).toEqual({ picked: 2, fired: 2 });
    }
    // Cues are announced in list order whichever was drawn first.
    const ordered = run(
      shimmer("some", 4),
      "address.trigger",
      { address: "macro/hit/run" },
      seededRandom(7),
    );
    expect(ordered.events).toEqual([CUES[0], CUES[1]]);
    expect(ordered.run).toEqual({ picked: 4, fired: 4 });
    const more = run(shimmer("some", 9), "address.trigger", {
      address: "macro/hit/run",
    });
    expect(performed(more)).toEqual([0, 1, 2, 3]);
  });

  it("walks the actions in Sequence, wraps, and survives edits to the list", () => {
    let document = shimmer("sequence");
    const fire = () =>
      run(document, "address.trigger", { address: "macro/hit/run" });
    let result = fire();
    expect(result.events).toEqual([CUES[0]]);
    expect(result.run).toEqual({ picked: 1, fired: 1 });
    expect(result.document.operational.sequence.hit).toBe(1);
    // Only show state moved: nothing the file holds.
    expect(
      result.patches.every((patch) => patch.path[0] === "operational"),
    ).toBe(true);
    document = result.document;
    result = fire();
    expect(result.events).toEqual([CUES[1]]);
    document = result.document;
    document = fire().document;
    document = fire().document;
    expect(document.operational.blackout).toBe(true);
    expect(document.operational.sequence.hit).toBe(0);
    result = fire();
    expect(result.events).toEqual([CUES[0]]);
    document = result.document;
    document = fire().document;
    // Position 2 with the list cut to one action lands on that action.
    const first = macro(document, "hit").actions[0];
    for (const action of macro(document, "hit").actions.slice(1))
      document = run(document, "macro.action.remove", {
        macroId: "hit",
        actionId: action.id,
      }).document;
    expect(first?.address).toBe(CUES[0]);
    result = fire();
    expect(result.events).toEqual([CUES[0]]);
    expect(result.document.operational.sequence.hit).toBe(0);
  });

  it("rolls each picked action's Chance, silently, and still advances a Sequence", () => {
    const never = run(shimmer("all", 1, 0), "address.trigger", {
      address: "macro/hit/run",
    });
    expect(performed(never)).toEqual([]);
    expect(never.warnings).toEqual([]);
    expect(never.run).toEqual({ picked: 4, fired: 0 });
    const always = run(shimmer("all", 1, 1), "address.trigger", {
      address: "macro/hit/run",
    });
    expect(performed(always)).toEqual([0, 1, 2, 3]);
    const seeded = run(
      shimmer("all", 1, 0.5),
      "address.trigger",
      { address: "macro/hit/run" },
      seededRandom(3),
    );
    expect(seeded.run?.picked).toBe(4);
    expect(performed(seeded)).toHaveLength(seeded.run?.fired ?? -1);
    expect(seeded.run?.fired).toBeGreaterThan(0);
    expect(seeded.run?.fired).toBeLessThan(4);
    const stepped = run(shimmer("sequence", 1, 0), "address.trigger", {
      address: "macro/hit/run",
    });
    expect(stepped.events).toEqual([]);
    expect(stepped.run).toEqual({ picked: 1, fired: 0 });
    expect(stepped.document.operational.sequence.hit).toBe(1);
  });

  it("runs a nested Macro once whatever its mode, and an empty one picks nothing", () => {
    let document = shimmer("one");
    document = run(document, "macro.actions.add", {
      macroId: "look",
      actions: [
        { kind: "trigger", address: "macro/hit/run" },
        { kind: "trigger", address: "macro/hit/run" },
      ],
    }).document;
    const result = run(document, "address.trigger", {
      address: "macro/look/run",
    });
    expect(result.run).toEqual({ picked: 2, fired: 2 });
    expect(result.warnings).toEqual(["Hit: already ran during this run."]);
    expect(performed(result)).toHaveLength(1);
    document = run(document, "macro.mode.set", {
      macroId: "look",
      mode: "sequence",
    }).document;
    const empty = run(
      run(document, "macro.create", { id: "e" }).document,
      "address.trigger",
      { address: "macro/e/run" },
    );
    expect(empty.run).toEqual({ picked: 0, fired: 0 });
    expect(empty.patches).toEqual([]);
  });
});
