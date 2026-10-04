/**
 * What a thumbnail shows where a definition's defaults would make a poor
 * picture of it: Parameter values set over the defaults, how long it runs
 * and whether its first Cue fires. Most definitions need none.
 */
export interface ThumbnailSetup {
  /** Parameter values set on the Layer, by Parameter name. */
  readonly parameters?: Readonly<Record<string, unknown>>;
  /** How long it runs before the picture is taken, unless the command says. */
  readonly seconds?: number;
  /** False keeps the first Cue from firing, for a Visual that shows best at rest. */
  readonly cue?: boolean;
  /**
   * Filters only: the picture under the Filter. The gray checkerboard with
   * a ring shows displacement; the colour bars show colour work, which a
   * gray picture would hide.
   */
  readonly reference?: "checkerboard" | "colors";
}

/**
 * The Bundled Pack entries the Image and Video thumbnails show. The Pack
 * has clips only, so Image shows the baked thumbnail of one as its picture.
 */
export const THUMBNAIL_IMAGE_ENTRY = "laser-fan-sweep-loop";
export const THUMBNAIL_VIDEO_ENTRY = "wire-polyhedron-loop";

/** The Media references the thumbnail Layers name: entries of a Pack made up for the page, each served from a data URL. */
export const THUMBNAIL_IMAGE = "thumbnail/image";
export const THUMBNAIL_VIDEO = "thumbnail/video";

export const thumbnailSetups: Readonly<Record<string, ThumbnailSetup>> = {
  video: { seconds: 4.5 },
  text: { parameters: { size: 0.55 } },
  // At rest: a Cue this close to the picture would catch the digits rolling.
  counter: {
    parameters: { font: "dseg7-classic", start: 42, size: 0.6 },
    cue: false,
  },
  // Colour work over the bars, which carry every hue and a grey ramp.
  colorize: { reference: "colors" },
  "hue-shift": { reference: "colors" },
  // Red is in the bars; black would key only the ground, which is black anyway.
  "color-key": {
    reference: "colors",
    parameters: { color: [1, 0, 0, 1], tolerance: 0.25, softness: 0.15 },
  },
  adjust: {
    reference: "colors",
    parameters: { contrast: 1.6, saturation: 1.5, gamma: 0.8 },
  },
  invert: { reference: "colors" },
  threshold: { reference: "colors", parameters: { level: 0.45 } },
  // The bars run left to right, so a fold shows as a reversed run.
  mirror: { reference: "colors", parameters: { axis: "horizontal" } },
  kaleido: { reference: "colors", parameters: { segments: 8, rotation: 15 } },
  crop: { parameters: { left: 0.15, top: 0.2, right: 0.15, bottom: 0.2 } },
  transform: { parameters: { rotation: 20, scale: 0.75, offsetX: 0.1 } },
  "edge-fade": { parameters: { width: 0.25, shape: "oval" } },
};
