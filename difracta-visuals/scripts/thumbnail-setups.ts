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
}

/**
 * The Bundled Media entries the Image and Video thumbnails show. The bundle
 * has clips only, so Image shows the thumbnail of one as its picture.
 */
export const THUMBNAIL_IMAGE_ENTRY = "laser-fan-sweep-loop";
export const THUMBNAIL_VIDEO_ENTRY = "wire-polyhedron-loop";

export const thumbnailSetups: Readonly<Record<string, ThumbnailSetup>> = {
  video: { seconds: 4.5 },
  text: { parameters: { size: 0.55 } },
  // At rest: a Cue this close to the picture would catch the digits rolling.
  counter: {
    parameters: { font: "dseg7-classic", start: 42, size: 0.6 },
    cue: false,
  },
};
