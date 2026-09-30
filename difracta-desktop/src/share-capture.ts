import { settings } from "@difracta/core";
import {
  desktopCapturer,
  systemPreferences,
  type DesktopCapturerSource,
  type Session,
} from "electron";

import { isSharePage } from "./launch-scheme.ts";
import type {
  ScreenAccess,
  SharePicker,
  ShareSourceChoice,
  ShareSourceKind,
} from "./share-contract.ts";
import {
  screenAccess,
  sharePicker,
  sourceChoices,
  sourceToGrant,
} from "./share-sources.ts";

/**
 * What the share window's page may capture, which main decides: the page
 * asks the browser for a screen (`getDisplayMedia`) and this answers, for
 * the share window's session and for that page's own frame only.
 *
 * With the system's picker (a Wayland session) listing the sources raises
 * the system's dialog, and the one source it returns is granted with no
 * second question. With Desktop's own, the page lists the sources through
 * the bridge, a kind at a time, the person chooses one there, and the
 * capture that follows gets that one. Names and thumbnails go to the share
 * window and nowhere else.
 */
export class ShareCapture {
  readonly picker: SharePicker = sharePicker({
    platform: process.platform,
    env: process.env,
  });
  /** What was listed for the picker, by id: only one of these can be chosen. */
  readonly #listed = new Map<string, DesktopCapturerSource>();
  #chosen: string | undefined;

  constructor(session: Session) {
    session.setDisplayMediaRequestHandler((request, callback) => {
      void this.#source(request.frame?.url).then((source) => {
        // The choice is for one capture.
        this.#chosen = undefined;
        try {
          // Electron throws on an answer without a stream, and rejects the
          // page's request all the same, which is the refusal wanted.
          callback(source === undefined ? {} : { video: source });
        } catch {
          // Refused.
        }
      });
    });
  }

  /** The Mac's Screen Recording permission; no other system says. */
  screenAccess(): ScreenAccess {
    return screenAccess(
      process.platform,
      process.platform === "darwin"
        ? systemPreferences.getMediaAccessStatus("screen")
        : undefined,
    );
  }

  /** The screens or the windows, for Desktop's own picker; `own` is the share window's id among them. */
  async sources(
    kind: ShareSourceKind,
    own: string | undefined,
  ): Promise<ShareSourceChoice[]> {
    if (this.picker === "system") return [];
    const { thumbnailWidth, thumbnailHeight } = settings.shares.sharer;
    const sources = await desktopCapturer.getSources({
      types: [kind],
      thumbnailSize: { width: thumbnailWidth, height: thumbnailHeight },
    });
    for (const [id] of [...this.#listed])
      if (id.startsWith(`${kind}:`)) this.#listed.delete(id);
    for (const source of sources) this.#listed.set(source.id, source);
    return sourceChoices(
      sources.map(({ id, name, thumbnail }) => ({
        id,
        name,
        thumbnail: thumbnail.isEmpty() ? null : thumbnail.toDataURL(),
      })),
      kind,
      own,
    );
  }

  /** False for a source that was not listed. */
  choose(id: string | null): boolean {
    if (id !== null && !this.#listed.has(id)) return false;
    this.#chosen = id ?? undefined;
    return true;
  }

  async #source(frameUrl: string | undefined) {
    if (!isSharePage(frameUrl)) return undefined;
    try {
      const sources =
        this.picker === "system"
          ? await desktopCapturer.getSources({
              types: ["window", "screen"],
              thumbnailSize: { width: 0, height: 0 },
            })
          : [...this.#listed.values()];
      return sourceToGrant(this.picker, sources, this.#chosen);
    } catch {
      return undefined;
    }
  }
}
