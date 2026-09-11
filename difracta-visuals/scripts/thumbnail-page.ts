import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { createCompositor, defineVisual } from "@difracta/render";

import { builtInCatalog } from "../src/index.ts";

/**
 * The browser half of `npm run thumbnails`: renders one definition the
 * way an Output would. A Visual gets a Layer over a full-frame Surface in
 * a fresh Installation and runs for a few seconds so its motion settles;
 * a Filter gets the same with a gray checkerboard under it, so every
 * Filter is shown over the same picture. The checkerboard carries a ring,
 * since a displaced checkerboard would look like the checkerboard itself.
 * The result is the canvas as PNG.
 */
export type ThumbnailKind = "visual" | "filter";

/**
 * A Visual's first Cue fires this many frames before the picture is taken,
 * several times, so one that accumulates has a few things settled and one
 * that flashes is caught lit. Only the first: a later Cue is often the one
 * that clears what the first built.
 */
const CUE_LEAD_FRAMES = [120, 80, 40, 3];

const checkerboard = defineVisual({
  id: "thumbnail-checkerboard",
  name: "Checkerboard",
  description: "The reference picture Filters are shown over.",
  parameters: {},
  create: () => ({
    update: ({ changed }) => ({ changed }),
    render({ context, width, height }) {
      const cell = height / 6;
      for (let row = 0; row * cell < height; row += 1)
        for (let column = 0; column * cell < width; column += 1) {
          context.fillStyle = (row + column) % 2 === 0 ? "#3c3c3c" : "#9a9a9a";
          context.fillRect(column * cell, row * cell, cell + 1, cell + 1);
        }
      context.beginPath();
      context.arc(width / 2, height / 2, height * 0.3, 0, Math.PI * 2);
      context.lineWidth = height * 0.05;
      context.strokeStyle = "#e6e6e6";
      context.stroke();
    },
  }),
});

const catalog = new Catalog({
  visuals: [...builtInCatalog.visuals(), checkerboard],
  filters: builtInCatalog.filters(),
});
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(`${name}: ${result.error}`);
  return result.document;
}

function installation(kind: ThumbnailKind, id: string): Document {
  let document = emptyDocument("Thumbnail");
  document = run(document, "output.create", { id: "out", name: "Thumbnail" });
  document = run(document, "surface.create", {
    id: "sur",
    name: "Frame",
    output: "out",
  });
  document = run(document, "scene.create", { id: "scene", name: "Thumbnail" });
  const visual = (layerId: string, visualId: string): void => {
    document = run(document, "layer.create", {
      id: layerId,
      kind: "visual",
      sceneId: "scene",
    });
    document = run(document, "layer.visual", { layerId, visual: visualId });
    document = run(document, "layer.update", { layerId, target: "sur" });
  };
  if (kind === "visual") visual("thumbnail", id);
  else {
    visual("reference", checkerboard.id);
    document = run(document, "layer.create", {
      id: "thumbnail",
      kind: "filter",
      sceneId: "scene",
    });
    document = run(document, "layer.filter", {
      layerId: "thumbnail",
      filter: id,
    });
  }
  return run(document, "scene.play", { sceneId: "scene" });
}

export function renderThumbnail(
  kind: ThumbnailKind,
  id: string,
  seconds: number,
  width: number,
  height: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const compositor = createCompositor(canvas, catalog);
  const scene = installation(kind, id);
  const frames = Math.round(seconds * 60);
  const cue =
    kind === "visual" ? catalog.visual(id)?.cues?.[0]?.key : undefined;
  for (let frame = 0; frame <= frames; frame += 1) {
    if (cue !== undefined && CUE_LEAD_FRAMES.includes(frames - frame))
      compositor.trigger("thumbnail", cue);
    compositor.render(scene, "out", width, height, (frame * 1000) / 60);
  }
  const png = canvas.toDataURL("image/png");
  compositor.dispose();
  return png;
}

declare global {
  interface Window {
    renderThumbnail: typeof renderThumbnail;
  }
}

window.renderThumbnail = renderThumbnail;
