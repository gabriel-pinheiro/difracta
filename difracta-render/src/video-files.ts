import {
  parseMediaReference,
  settings,
  type Catalog,
  type Document,
  type Rendition,
} from "@difracta/core";

import { entryOf, type PacksView, type PackView } from "./pack-sources.ts";
import {
  bakes,
  videoRenditions,
  type VideoRendition,
} from "./video-resolution.ts";

/** What `sync` reads of the frame being drawn: the canvas in pixels, the GPU's texture limit and the time in milliseconds. */
export interface MediaFrame {
  readonly width: number;
  readonly height: number;
  readonly now: number;
  readonly maxDimension?: number | undefined;
}

export const NO_FRAME: MediaFrame = { width: 0, height: 0, now: 0 };

export interface VideoFilesOptions {
  readonly catalog: Catalog;
  /** The tallest video file this page plays, a proxy size, whatever a Layer's Resolution asks. */
  readonly maxVideoHeight?: number | undefined;
  /** Asks the runtime to bake a video's proxy of a height this page wants and does not find; without it nothing is asked. */
  readonly prepare?: ((reference: string, height: number) => void) | undefined;
}

/** The file a video reference plays from now, and since when it should play from another. */
interface Playing {
  readonly fingerprint: string;
  rendition: Rendition;
  since: number | undefined;
}

/**
 * The file each video plays from on one page, over time. What it should
 * play from (`video-resolution.ts`) is worked out when the document, the
 * Packs, the Output or the canvas size changes. A video seen for the first
 * time takes that file at once; one already playing changes file only
 * after the answer has stayed different for
 * `settings.packs.proxy.settleMs`, so a corner being dragged, a window
 * being resized or several bakes landing reload it once, and the reload
 * restarts the clip. A size wanted and not baked is asked of the runtime
 * through `prepare`, again whenever its Pack's state changes while it is
 * still missing; a read-only Pack and a runtime without ffmpeg are never
 * asked.
 */
export class VideoFiles {
  readonly #options: VideoFilesOptions;
  #renditionsFor:
    | {
        document: Document;
        packs: PacksView;
        outputId: string;
        width: number;
        height: number;
        renditions: ReadonlyMap<string, VideoRendition>;
      }
    | undefined;
  readonly #playing = new Map<string, Playing>();
  #settling = false;
  /** The sizes asked of the runtime and still missing, each with its Pack's state when asked. */
  #asked = new Map<string, PackView>();

  constructor(options: VideoFilesOptions) {
    this.#options = options;
  }

  /** Brings the files in step with the frame; says whether any video changed file. */
  sync(
    document: Document,
    packs: PacksView,
    outputId: string,
    frame: MediaFrame,
  ): boolean {
    const last = this.#renditionsFor;
    const moved =
      last?.document !== document ||
      last.packs !== packs ||
      last.outputId !== outputId ||
      last.width !== frame.width ||
      last.height !== frame.height;
    const renditions = moved
      ? videoRenditions(document, this.#options.catalog, packs, {
          outputId,
          width: frame.width,
          height: frame.height,
          maxDimension: frame.maxDimension,
          maxVideoHeight: this.#options.maxVideoHeight,
        })
      : last.renditions;
    if (moved) {
      this.#renditionsFor = {
        document,
        packs,
        outputId,
        width: frame.width,
        height: frame.height,
        renditions,
      };
      this.#ask(renditions, packs);
    }
    return (
      (moved || this.#settling) && this.#settle(renditions, packs, frame.now)
    );
  }

  /** The file `reference` plays from; undefined for a video not in use. */
  playing(reference: string): Rendition | undefined {
    return this.#playing.get(reference)?.rendition;
  }

  clear(): void {
    this.#renditionsFor = undefined;
    this.#playing.clear();
    this.#asked.clear();
    this.#settling = false;
  }

  /**
   * Brings the file each video plays from toward `renditions`: at once for
   * one not loaded yet or whose file changed, after the settle time for
   * one already playing from another. Says whether any changed.
   */
  #settle(
    renditions: ReadonlyMap<string, VideoRendition>,
    packs: PacksView,
    now: number,
  ): boolean {
    let switched = false;
    this.#settling = false;
    for (const reference of [...this.#playing.keys()])
      if (!renditions.has(reference)) this.#playing.delete(reference);
    for (const [reference, { playing }] of renditions) {
      const fingerprint = entryOf(packs, reference)?.fingerprint ?? "";
      const current = this.#playing.get(reference);
      if (current?.fingerprint !== fingerprint) {
        this.#playing.set(reference, {
          fingerprint,
          rendition: playing,
          since: undefined,
        });
        switched = true;
      } else if (current.rendition === playing) current.since = undefined;
      else if (now - (current.since ??= now) >= settings.packs.proxy.settleMs) {
        current.rendition = playing;
        current.since = undefined;
        switched = true;
      } else this.#settling = true;
    }
    return switched;
  }

  /** Asks the runtime for every size wanted and not baked, once per state of its Pack. */
  #ask(
    renditions: ReadonlyMap<string, VideoRendition>,
    packs: PacksView,
  ): void {
    const prepare = this.#options.prepare;
    if (prepare === undefined) return;
    const asked = new Map<string, PackView>();
    for (const [reference, { wanted, playing }] of renditions) {
      if (typeof wanted !== "number" || wanted === playing) continue;
      const pack = packs[parseMediaReference(reference)?.packId ?? ""];
      if (pack === undefined || !bakes(packs, reference)) continue;
      const key = `${reference}|${String(wanted)}`;
      asked.set(key, pack);
      if (this.#asked.get(key) !== pack) prepare(reference, wanted);
    }
    this.#asked = asked;
  }
}
