import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
} from "@difracta/core";
import { createCompositor, defineVisual } from "@difracta/render";

import { builtInCatalog } from "../src/index.ts";
import { THUMBNAIL_VIDEO_ENTRY, thumbnailSetups } from "./thumbnail-setups.ts";

/**
 * The browser half of `npm run thumbnails`: renders one definition the
 * way an Output would. A Visual gets a Layer over a full-frame Surface in
 * a fresh Installation and runs for a few seconds so its motion settles;
 * a Filter gets the same with a gray checkerboard under it, so every
 * Filter is shown over the same picture. The checkerboard carries a ring,
 * since a displaced checkerboard would look like the checkerboard itself.
 * A Visual with a Media Parameter gets a picture or a clip of the Bundled
 * Media as a Media item, served from the data URL the script passes, and
 * its frames are paced by the browser's own, since the file loads and a
 * video plays on the browser's clock. A Visual that draws text is paced
 * the same way, since its Bundled Font loads, from a data URL too. A
 * definition with a setup (`thumbnail-setups.ts`) gets its Parameter
 * values, its length and its say on the Cue. The result is the canvas as
 * PNG.
 */
export type ThumbnailKind = "visual" | "filter";

/** The picture and the clip as data URLs, by the Media item id they get. */
export type ThumbnailMedia = Readonly<
  Record<"thumbnail_image" | "thumbnail_video", string>
>;

/** The Bundled Fonts' files as data URLs, by file name. */
export type FontFiles = Readonly<Record<string, string>>;

/** How long a definition runs before its picture, unless its setup or the command says. */
const DEFAULT_SECONDS = 3;

/** How long a Media or text Visual may keep waiting for its picture past its run. */
const MEDIA_WAIT_MS = 5_000;

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
  media: builtInCatalog.media(),
  fonts: builtInCatalog.fonts(),
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
  document = run(document, "media.create", {
    id: "thumbnail_image",
    path: "thumbnail.png",
  });
  document = run(document, "media.create", {
    id: "thumbnail_video",
    kind: "bundled",
    bundled: THUMBNAIL_VIDEO_ENTRY,
  });
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
    // A Visual that follows a Path gets the default one: a closed inset rectangle.
    for (const { key } of catalog.visual(visualId)?.paths ?? []) {
      const pathId = `path_${key}`;
      if (!(pathId in document.paths))
        document = run(document, "path.create", {
          id: pathId,
          surfaceId: "sur",
          name: key,
        });
      document = run(document, "layer.path", { layerId, key, pathId });
    }
    for (const [name, parameter] of Object.entries(
      catalog.visual(visualId)?.parameters ?? {},
    ))
      if (parameter.kind === "media")
        document = run(document, "address.set", {
          address: `layer/${layerId}/param/${name}`,
          value:
            parameter.accepts === "image"
              ? "thumbnail_image"
              : "thumbnail_video",
        });
    for (const [name, value] of Object.entries(
      thumbnailSetups[visualId]?.parameters ?? {},
    ))
      document = run(document, "address.set", {
        address: `layer/${layerId}/param/${name}`,
        value,
      });
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

/** Whether the Visual shows something that loads: a Media item, or text in a Bundled Font. */
function loads(kind: ThumbnailKind, id: string): boolean {
  return (
    kind === "visual" &&
    Object.values(catalog.visual(id)?.parameters ?? {}).some(
      (parameter) =>
        parameter.kind === "media" ||
        (parameter.kind === "choice" &&
          parameter.options.some((option) => option.font !== undefined)),
    )
  );
}

const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));

export async function renderThumbnail(
  kind: ThumbnailKind,
  id: string,
  seconds: number | null,
  width: number,
  height: number,
  media: ThumbnailMedia,
  fonts: FontFiles,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const compositor = createCompositor(canvas, catalog, {
    mediaUrl: (mediaId) => media[mediaId as keyof ThumbnailMedia],
    fontUrl: (file) => fonts[file],
  });
  const scene = installation(kind, id);
  const setup = thumbnailSetups[id];
  const frames = Math.round(
    (seconds ?? setup?.seconds ?? DEFAULT_SECONDS) * 60,
  );
  const cue =
    kind === "visual" && setup?.cue !== false
      ? catalog.visual(id)?.cues?.[0]?.key
      : undefined;
  const paced = loads(kind, id);
  const started = performance.now();
  let rendered = false;
  for (let frame = 0; frame <= frames || !rendered; frame += 1) {
    if (cue !== undefined && CUE_LEAD_FRAMES.includes(frames - frame))
      compositor.trigger("thumbnail", cue);
    const now = paced ? await nextFrame() : (frame * 1000) / 60;
    // The picture must be drawn in this task: the canvas keeps no drawing
    // buffer past it, so the last frame is forced by a new revision.
    const last = frame >= frames;
    const report = compositor.render(
      last && paced ? { ...scene } : scene,
      "out",
      width,
      height,
      now,
    );
    rendered ||=
      !paced || report.shaders.rendered > 0 || report.layers.rendered > 0;
    if (!rendered && performance.now() - started > MEDIA_WAIT_MS) break;
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
