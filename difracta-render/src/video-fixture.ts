import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  formatFingerprint,
  RESOLUTION_OPTIONS,
  type Document,
  type VisualDefinition,
} from "@difracta/core";

import type { PacksView } from "./pack-sources.ts";

/** What the tests of the video files stand on: a Clip Visual with a Resolution, a stage and Pack entries. */
const clip: VisualDefinition = {
  kind: "visual",
  id: "clip",
  name: "Clip",
  description: "Plays a video.",
  backend: "shader",
  parameters: {
    media: {
      kind: "media",
      accepts: "video",
      label: "Video",
      default: "",
      resolution: "resolution",
    },
    resolution: {
      kind: "choice",
      label: "Resolution",
      default: "auto",
      options: RESOLUTION_OPTIONS,
    },
  },
};
/** A Visual whose video Parameter names no Resolution. */
const plain: VisualDefinition = {
  ...clip,
  id: "plain",
  parameters: {
    media: { kind: "media", accepts: "video", label: "Video", default: "" },
  },
};
export const catalog = new Catalog({ visuals: [clip, plain] });
const registry = createBuiltInRegistry(catalog);

export function run(
  document: Document,
  name: string,
  payload: unknown,
): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

/** An Output with a Surface over the whole frame and one over its left quarter. */
export function stage(): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", { id: "out", name: "Out" });
  document = run(document, "output.create", { id: "other", name: "Other" });
  document = run(document, "scene.create", { id: "scene", name: "Main" });
  document = run(document, "surface.create", { id: "full", name: "Full" });
  document = run(document, "surface.create", { id: "wall", name: "Wall" });
  for (const [corner, x, y] of [
    ["topRight", 0.25, 0],
    ["bottomRight", 0.25, 0.5],
    ["bottomLeft", 0, 0.5],
  ] as const)
    document = run(document, "surface.corner.set", {
      surfaceId: "wall",
      output: "out",
      corner,
      point: { x, y },
    });
  return document;
}

export function layer(
  document: Document,
  id: string,
  target: string | null,
  parameters: Record<string, string>,
  visual = "clip",
): Document {
  let next = run(document, "layer.create", {
    id,
    sceneId: "scene",
    kind: "visual",
  });
  next = run(next, "layer.visual", { layerId: id, visual, parameters });
  return run(next, "layer.update", { layerId: id, target });
}

/** A 16:9 video entry of `height` rows lasting 8 s at `kbps`. */
export const video = (
  height: number,
  kbps: number,
  proxies: number[] = [480],
) => ({
  type: "video" as const,
  status: "ok",
  fingerprint: formatFingerprint("ab".repeat(32), kbps * 1000),
  width: Math.round((height * 16) / 9),
  height,
  duration: 8,
  proxies,
});

export const packs = (
  entries: Record<string, ReturnType<typeof video>>,
): PacksView => ({
  neon: { status: "ok", readOnly: false, ffmpeg: true, entries },
});
