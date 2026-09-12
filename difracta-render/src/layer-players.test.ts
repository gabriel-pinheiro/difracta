import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { describe, expect, it, vi } from "vitest";

import { LayerPlayers } from "./layer-players.ts";
import { planFrame } from "./plan.ts";
import { defineVisual } from "./sdk/visual.ts";

// No browser here: the scratch canvas records instead of drawing and the
// texture is a token, which is all the players need to be stepped.
vi.mock("./gl.ts", async () => {
  const { recordingContext } = await import("./sdk/recording-context.ts");
  return {
    createScratchCanvas: () => ({
      canvas: {},
      context: recordingContext().context,
    }),
    createTexture: () => ({}),
  };
});

let created = 0;
let updates = 0;

const probe = defineVisual({
  id: "probe",
  name: "Probe",
  description: "Counts its instances and updates.",
  parameters: {},
  create: () => {
    created += 1;
    return {
      update() {
        updates += 1;
      },
      render({ context, width, height }) {
        context.fillRect(0, 0, width, height);
      },
    };
  },
});

const catalog = new Catalog({ visuals: [probe], filters: [] });
const registry = createBuiltInRegistry(catalog);
const gl = new Proxy({}, { get: () => () => 4096 }) as WebGL2RenderingContext;

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/** One Scene with Layer A, a probe on a Surface of Output out_a. */
function staged(): Document {
  let document = emptyDocument("Test");
  document = run(document, "output.create", { id: "out_a", name: "A" });
  document = run(document, "surface.create", {
    id: "sur_wall",
    name: "Wall",
    output: "out_a",
  });
  document = run(document, "scene.create", { id: "s1", name: "One" });
  document = run(document, "layer.create", {
    id: "A",
    kind: "visual",
    sceneId: "s1",
  });
  document = run(document, "layer.visual", { layerId: "A", visual: "probe" });
  document = run(document, "layer.update", {
    layerId: "A",
    target: "sur_wall",
  });
  return run(document, "scene.play", { sceneId: "s1" });
}

const opacity = (document: Document, value: number): Document =>
  run(document, "address.set", { address: "layer/A/opacity", value });

describe("LayerPlayers", () => {
  it("leaves a hidden Layer's instance idle and resumes it when the Layer shows again", () => {
    created = 0;
    updates = 0;
    const players = new LayerPlayers(gl, catalog);
    const step = (document: Document) =>
      players.step(planFrame(document, "out_a", catalog).layers, 0.016, 64, 64);
    const shown = staged();
    expect(step(shown)).toMatchObject({
      canvas: { planned: 1, running: 1, rendered: 1 },
      changed: true,
    });
    expect(step(shown).frames).toHaveLength(1);
    expect([created, updates]).toEqual([1, 2]);
    const faded = opacity(shown, 0);
    const hidden = step(faded);
    expect(hidden.frames).toEqual([]);
    expect(hidden.canvas).toEqual({ planned: 1, running: 0, rendered: 0 });
    step(faded);
    expect([created, updates]).toEqual([1, 2]);
    const resumed = step(opacity(faded, 0.5));
    expect(resumed.frames).toHaveLength(1);
    expect(resumed.canvas.running).toBe(1);
    expect([created, updates]).toEqual([1, 3]);
    // Leaving the plan still disposes: the next show starts anew.
    step(run(faded, "layer.update", { layerId: "A", target: null }));
    step(shown);
    expect(created).toBe(2);
    players.dispose();
  });
});
