import { settings, tempoOf, type MediaFile } from "@difracta/core";
import { useEffect, useState } from "react";

import { OptionalNumber } from "@/inspector/fields/optional-number";
import { studioRuntimeOrigin } from "@/lib/runtime-origin";

/**
 * A video file's length in seconds, read by the browser from the file the
 * runtime serves; undefined until it is known, and for a file that is not
 * there. Only the metadata is fetched.
 */
function useVideoDuration(id: string, path: string, present: boolean) {
  // The path is in the URL so a repointed item is measured again.
  const url = `${studioRuntimeOrigin()}${settings.runtime.mediaPath}/${encodeURIComponent(id)}?v=${encodeURIComponent(path)}`;
  const [measured, setMeasured] = useState<{
    readonly url: string;
    readonly duration: number;
  }>();
  useEffect(() => {
    if (!present) return;
    const element = document.createElement("video");
    const loaded = (): void => {
      if (Number.isFinite(element.duration))
        setMeasured({ url, duration: element.duration });
    };
    element.addEventListener("loadedmetadata", loaded);
    element.preload = "metadata";
    element.muted = true;
    element.src = url;
    return () => {
      element.removeEventListener("loadedmetadata", loaded);
      element.removeAttribute("src");
      element.load();
    };
  }, [url, present]);
  return present && measured?.url === url ? measured.duration : undefined;
}

/**
 * A video file's Beats and First Beat, with the tempo they make of its
 * length. Empty Beats is a clip without a tempo, which Sync to Tempo
 * leaves at its Speed.
 */
export function BeatsBlock({
  item,
  present,
  onCommit,
}: {
  readonly item: MediaFile;
  /** Whether the runtime has the file. */
  readonly present: boolean;
  readonly onCommit: (beats: number | null, firstBeat?: number) => void;
}) {
  const duration = useVideoDuration(item.id, item.path, present);
  const tempo =
    item.beats === undefined || duration === undefined
      ? undefined
      : Math.round(tempoOf(item.beats, duration) * 10) / 10;
  return (
    <div className="grid gap-1" data-testid="beats-block">
      <span className="text-xs text-muted-foreground">Beats</span>
      <div className="flex items-center gap-1.5">
        <OptionalNumber
          label="Beats the video lasts"
          placeholder="none"
          className="max-w-16 flex-none"
          accepts={(beats) => beats > 0 && beats <= settings.media.maxBeats}
          value={item.beats}
          onCommit={(beats) => onCommit(beats ?? null)}
        />
        <span className="text-[0.6875rem] text-muted-foreground">
          {tempo === undefined ? "beats" : `beats, ${String(tempo)} BPM`}
        </span>
      </div>
      {item.beats !== undefined && (
        <div className="flex items-center gap-1.5">
          <OptionalNumber
            label="Time of the first beat, in seconds"
            placeholder="0"
            className="max-w-16 flex-none"
            accepts={(time) =>
              time >= 0 && (duration === undefined || time < duration)
            }
            value={item.firstBeat}
            onCommit={(firstBeat) =>
              item.beats !== undefined && onCommit(item.beats, firstBeat ?? 0)
            }
          />
          <span className="text-[0.6875rem] text-muted-foreground">
            s to the first beat
          </span>
        </div>
      )}
      <p className="text-[0.6875rem]/relaxed text-muted-foreground">
        How many beats the clip lasts, 16 for a four-bar loop. A Video with Sync
        to Tempo on follows a tempo with it.
      </p>
    </div>
  );
}
