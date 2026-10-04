import {
  Catalog,
  createBuiltInRegistry,
  emptyDocument,
  executeCommand,
  type Document,
  type VisualDefinition,
} from "@difracta/core";
import { describe, expect, it } from "vitest";

import { EngineMedia } from "./engine-media.ts";
import type { MediaElements } from "./media-loader.ts";
import type { PacksView } from "./pack-sources.ts";

const picture: VisualDefinition = {
  kind: "visual",
  id: "picture",
  name: "Picture",
  description: "Shows an image.",
  backend: "shader",
  parameters: {
    media: { kind: "media", accepts: "image", label: "Image", default: "" },
  },
};
const catalog = new Catalog({ visuals: [picture] });
const registry = createBuiltInRegistry(catalog);

function run(document: Document, name: string, payload: unknown): Document {
  const result = executeCommand(registry, document, name, payload);
  if (!result.ok) throw new Error(result.error);
  return result.document;
}

function installation(reference: string): Document {
  let document = emptyDocument("Living");
  document = run(document, "output.create", { id: "out", name: "Out" });
  document = run(document, "scene.create", { id: "scene", name: "Main" });
  document = run(document, "layer.create", {
    id: "l_pic",
    sceneId: "scene",
    kind: "visual",
  });
  return run(document, "layer.visual", {
    layerId: "l_pic",
    visual: "picture",
    parameters: { media: reference },
  });
}

/** An image element as the loader sees it: what it was pointed at, and whether it was released. */
class FakeImage {
  src = "";
  crossOrigin: string | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  readonly listeners: string[] = [];
  addEventListener(type: string): void {
    this.listeners.push(type);
  }
  removeEventListener(type: string): void {
    this.listeners.splice(this.listeners.indexOf(type), 1);
  }
  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

function engine() {
  const images: FakeImage[] = [];
  const elements: MediaElements = {
    image: () => {
      const image = new FakeImage();
      images.push(image);
      return image as unknown as HTMLImageElement;
    },
    video: () => {
      throw new Error("no video in this test");
    },
  };
  const media = new EngineMedia({
    catalog,
    mediaUrl: (reference) => `/packs/${reference}`,
    shares: undefined,
    loader: { elements, pageOrigin: "http://output.test" },
  });
  return { media, images };
}

const packsWith = (fingerprint: string, beats?: number): PacksView => ({
  "neon-k7f3": {
    status: "ok",
    entries: {
      logo: {
        type: "image",
        status: "ok",
        fingerprint,
        ...(beats === undefined ? {} : { beats }),
      },
    },
  },
});

describe("EngineMedia", () => {
  it("loads nothing until the Packs arrive, then the entries the document names", () => {
    const { media, images } = engine();
    const document = installation("neon-k7f3/logo");
    media.sync(document, "out");
    expect(images).toHaveLength(0);
    expect(media.get("neon-k7f3/logo")).toBeUndefined();
    media.setPacks(packsWith("aaaaaaaaaaaaaaaa-1"));
    media.sync(document, "out");
    expect(images).toHaveLength(1);
    expect(images[0]?.src).toBe("/packs/neon-k7f3/logo");
    expect(media.get("neon-k7f3/logo")?.id).toBe("neon-k7f3/logo");
    media.dispose();
  });

  it("reloads an entry whose fingerprint changed and follows its beats without a reload", () => {
    const { media, images } = engine();
    const document = installation("neon-k7f3/logo");
    media.setPacks(packsWith("aaaaaaaaaaaaaaaa-1"));
    media.sync(document, "out");
    const handle = media.get("neon-k7f3/logo");
    media.setPacks(packsWith("aaaaaaaaaaaaaaaa-1", 16));
    media.sync(document, "out");
    expect(media.get("neon-k7f3/logo")).toBe(handle);
    expect(media.beats("neon-k7f3/logo")).toEqual({ beats: 16, firstBeat: 0 });
    expect(images).toHaveLength(1);
    media.setPacks(packsWith("bbbbbbbbbbbbbbbb-1", 16));
    media.sync(document, "out");
    expect(images).toHaveLength(2);
    expect(images[0]?.src).toBe("");
    expect(images[1]?.src).toBe("/packs/neon-k7f3/logo?v=2");
    expect(media.get("neon-k7f3/logo")).not.toBe(handle);
    media.dispose();
  });

  it("drops an entry its Pack lost or the document stopped naming", () => {
    const { media, images } = engine();
    media.setPacks(packsWith("aaaaaaaaaaaaaaaa-1"));
    media.sync(installation("neon-k7f3/logo"), "out");
    expect(images).toHaveLength(1);
    media.setPacks({
      "neon-k7f3": {
        status: "ok",
        entries: {
          logo: {
            type: "image",
            status: "missing",
            fingerprint: "aaaaaaaaaaaaaaaa-1",
          },
        },
      },
    });
    media.sync(installation("neon-k7f3/logo"), "out");
    expect(media.get("neon-k7f3/logo")).toBeUndefined();
    expect(images[0]?.src).toBe("");
    media.setPacks(packsWith("aaaaaaaaaaaaaaaa-1"));
    media.sync(installation("neon-k7f3/logo"), "out");
    expect(images).toHaveLength(2);
    media.sync(installation(""), "out");
    expect(media.get("neon-k7f3/logo")).toBeUndefined();
    expect(images[1]?.src).toBe("");
    media.dispose();
  });
});
