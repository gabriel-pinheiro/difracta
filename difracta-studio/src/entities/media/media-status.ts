import type { Media, Table } from "@difracta/core";

/** What the runtime reports under `["live", "media", <id>]`. */
export type MediaStatus =
  "ok" | "missing" | "outside" | "unsaved" | "unavailable";

export interface MediaLive {
  readonly status: MediaStatus;
}

export type MediaLiveTable = Record<string, MediaLive | undefined>;

export interface MediaStatusText {
  readonly label: string;
  readonly explanation: string;
}

/**
 * Each status in the words the section and the inspector use: what is
 * wrong and what to do about it. `ok` says where the file was found. A
 * bundled item's file is the bundle's, so its `ok` and `missing` say so.
 */
export function describeMediaStatus(
  status: MediaStatus,
  kind: "file" | "bundled" = "file",
): MediaStatusText {
  if (kind === "bundled" && status === "ok")
    return {
      label: "OK",
      explanation: "The clip is in the Bundled Media, and the Outputs load it.",
    };
  if (kind === "bundled" && status === "missing")
    return {
      label: "Missing",
      explanation:
        "The Bundled Media list this clip but its file is gone. Run npm run media:fetch to put the bundle back.",
    };
  switch (status) {
    case "ok":
      return {
        label: "OK",
        explanation: "The file is there, and the Outputs load it.",
      };
    case "missing":
      return {
        label: "Missing",
        explanation:
          "No file at this path next to the Installation. Fix the path, or put the file there.",
      };
    case "outside":
      return {
        label: "Outside",
        explanation:
          "The file is outside the Installation's folder, which this runtime does not serve. Move it next to the Installation, or start the runtime with --media-anywhere.",
      };
    case "unsaved":
      return {
        label: "Unsaved",
        explanation:
          "The Installation has no file yet, so the path has nothing to be relative to. Save the Installation first.",
      };
    case "unavailable":
      return {
        label: "Unavailable",
        explanation:
          "This runtime's Bundled Media has no such clip, so the Outputs show nothing for it.",
      };
  }
}

/** The warning a Media row shows, or undefined while the file is found or nothing is reported yet. */
export function mediaWarning(
  live: MediaLive | undefined,
  kind: "file" | "bundled" = "file",
): MediaStatusText | undefined {
  if (live === undefined || live.status === "ok") return undefined;
  return describeMediaStatus(live.status, kind);
}

/** How many Media rows warn, for the collapsed Media section; a Group has no file to warn about. */
export function mediaWarningCount(
  media: Table<Media>,
  live: MediaLiveTable,
): number {
  return Object.values(media).filter(
    (item) =>
      item.kind !== "group" && mediaWarning(live[item.id]) !== undefined,
  ).length;
}
