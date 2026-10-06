import type { Catalog, Document, MediaBeats } from "@difracta/core";

import type { ShareSignalling } from "./live-peer.ts";
import { LiveViewer, type ShareCount } from "./live-viewer.ts";
import { wantedShares } from "./live-wanted.ts";
import {
  MediaLoader,
  type MediaLoaderOptions,
  type MediaSources,
  type VideoCount,
} from "./media-loader.ts";
import {
  NO_PACKS,
  packSources,
  type MediaUrl,
  type PacksView,
} from "./pack-sources.ts";
import type { LiveSource } from "./shared-viewer.ts";
import type {
  MediaContext,
  MediaHandle,
  MediaLive,
  MediaVideo,
} from "./sdk/media.ts";
import { NO_FRAME, VideoFiles, type MediaFrame } from "./video-files.ts";

export interface EngineMediaOptions {
  readonly catalog: Catalog;
  /** Where a Media reference's file is, the original or a proxy of it; undefined for one this page cannot reach. */
  readonly mediaUrl: MediaUrl;
  readonly shares: ShareSignalling | undefined;
  /** A Viewer shared with the rest of the page, in place of one of its own over `shares`. */
  readonly viewer?: LiveSource | undefined;
  /** How the loader makes its elements; the browser's by default. */
  readonly loader?: MediaLoaderOptions | undefined;
  /** The tallest video file this page plays, a proxy size, whatever a Layer's Resolution asks. */
  readonly maxVideoHeight?: number | undefined;
  /** Asks the runtime to bake a video's proxy of a height this page wants and does not find; without it nothing is asked. */
  readonly prepare?: ((reference: string, height: number) => void) | undefined;
}

/**
 * The Media one compositor's instances reach: the Pack entries the loader
 * holds (`media-loader.ts`), one per Media reference a Layer Parameter or
 * Macro action of the document names that the loaded Packs have, and the
 * Screen Shares the Viewer receives (`live-viewer.ts`), or a claim on a
 * Viewer the page shares among several compositors (`shared-viewer.ts`).
 * `setPacks` hands over the `packs` live state as the page has it; `sync`
 * brings both in step with a document on an Output, the sources worked
 * out once per document and Packs slice (`pack-sources.ts`) and the
 * shares wanted once per document and Output, since a document is
 * immutable per revision. A source's URL comes from `mediaUrl`, its
 * revision from the entry's fingerprint and its beats from the entry, so
 * an edit to an entry's beats reaches a playing clip with no reload.
 * A video's source names the file `VideoFiles` says it plays from on this
 * Output (`video-files.ts`), so a change of file is a change of source
 * and the loader loads it again.
 */
export class EngineMedia implements MediaContext {
  readonly #catalog: Catalog;
  readonly #mediaUrl: MediaUrl;
  readonly #videos: VideoFiles;
  readonly #loader: MediaLoader;
  readonly #viewer: LiveSource;
  #packs: PacksView = NO_PACKS;
  #sourcesFor:
    { document: Document; packs: PacksView; sources: MediaSources } | undefined;
  #wantedFor:
    | { document: Document; outputId: string; shares: ReadonlySet<string> }
    | undefined;

  constructor(options: EngineMediaOptions) {
    this.#catalog = options.catalog;
    this.#mediaUrl = options.mediaUrl;
    this.#videos = new VideoFiles(options);
    this.#loader = new MediaLoader(options.loader);
    this.#viewer =
      options.viewer ?? new LiveViewer({ signalling: options.shares });
  }

  /** The Packs the runtime has loaded, as the page has them now; the next `sync` reads them. */
  setPacks(packs: PacksView): void {
    this.#packs = packs;
  }

  sync(
    document: Document,
    outputId: string,
    frame: MediaFrame = NO_FRAME,
  ): void {
    const packs = this.#packs;
    const switched = this.#videos.sync(document, packs, outputId, frame);
    if (
      switched ||
      this.#sourcesFor?.document !== document ||
      this.#sourcesFor.packs !== packs
    )
      this.#sourcesFor = {
        document,
        packs,
        sources: packSources(
          document,
          this.#catalog,
          packs,
          this.#mediaUrl,
          (reference) => this.#videos.playing(reference),
        ),
      };
    this.#loader.sync(this.#sourcesFor.sources);
    const wanted = this.#wantedFor;
    if (wanted?.document !== document || wanted.outputId !== outputId) {
      const shares = wantedShares(document, outputId, this.#catalog);
      // The same shares as before keep their set, so the Viewer sees no change.
      this.#wantedFor = {
        document,
        outputId,
        shares:
          wanted !== undefined && same(wanted.shares, shares)
            ? wanted.shares
            : shares,
      };
    }
    this.#viewer.sync(this.#wantedFor?.shares ?? new Set(), document.shares);
  }

  /** Starts the video preloads waiting for a turn, the wanted references first. */
  preload(wanted: () => ReadonlySet<string>): void {
    this.#loader.preload(wanted);
  }

  get(id: string): MediaHandle | undefined {
    return this.#loader.get(id);
  }

  video(id: string): MediaVideo | undefined {
    return this.#loader.video(id);
  }

  beats(id: string): MediaBeats | undefined {
    return this.#loader.beats(id);
  }

  live(id: string): MediaLive | undefined {
    return this.#viewer.live(id);
  }

  videos(): VideoCount {
    return this.#loader.videos();
  }

  shares(): ShareCount {
    return this.#viewer.shares();
  }

  dispose(): void {
    this.#viewer.dispose();
    this.#loader.dispose();
    this.#sourcesFor = undefined;
    this.#videos.clear();
    this.#wantedFor = undefined;
  }
}

function same(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}
