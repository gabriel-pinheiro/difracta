import type { RenderIssue } from "./issues.ts";
import type { ShareCount } from "./live-viewer.ts";

/** What one call to the compositor's `render` reports about the frame. */
export interface FrameReport {
  /** The canvas holds a new frame. */
  readonly drew: boolean;
  /** Canvas Layers in the plan (hidden ones included), with a running instance, and that drew this frame. */
  readonly layers: {
    readonly planned: number;
    readonly running: number;
    readonly rendered: number;
  };
  /** The same for shader Layers; rendered counts the ones drawn. */
  readonly shaders: {
    readonly planned: number;
    readonly running: number;
    readonly rendered: number;
  };
  /** Filters in the plan, root and nested, with a running instance, and whose pass ran this frame. */
  readonly filters: {
    readonly planned: number;
    readonly running: number;
    readonly executed: number;
  };
  /**
   * Video: planned Layers whose Visual takes a video, the video elements
   * the Output holds (one kept ready per video Media item, one per
   * playback a Layer holds), each of which holds a decoder, and the ones
   * playing.
   */
  readonly videos: {
    readonly layers: number;
    readonly players: number;
    readonly playing: number;
  };
  /** Screen Shares: the slots viewed, the ones connected, and why a Viewer was refused. */
  readonly shares: ShareCount;
  /** Planned Layers drawing nothing because their Visual or Filter cannot run. */
  readonly issues: readonly RenderIssue[];
}

export const NO_LAYERS = { planned: 0, running: 0, rendered: 0 } as const;
export const NO_FILTERS = { planned: 0, running: 0, executed: 0 } as const;
export const NO_ISSUES: readonly RenderIssue[] = [];
