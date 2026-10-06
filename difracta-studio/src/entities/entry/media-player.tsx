import { Camera } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { PackEntryLive } from "@difracta/protocol";

import {
  packEntryUrl,
  packProxyUrl,
  packThumbUrl,
} from "@/entities/pack/pack-urls";
import { hasBaseProxy } from "@/library/media-search";

/** What a browser read of an original: its size and, for a video, its length. */
export interface Measured {
  readonly width: number;
  readonly height: number;
  readonly duration?: number | undefined;
}

/**
 * The entry in its Inspector: a video plays muted from its proxy,
 * the thumbnail as its poster, with a scrubber and "Use this frame as
 * thumbnail", which asks the runtime to bake the thumbnail at the time the
 * scrubber is on; an image is shown as it is. When the entry's Pack has no
 * proxy for it the original plays, and what the browser reads of it fills
 * in a size or length the manifest lacks through `onMeasured`.
 */
export function MediaPlayer({
  reference,
  entry,
  disabled,
  onThumbnailAt,
  onMeasured,
}: {
  readonly reference: string;
  readonly entry: PackEntryLive;
  /** Why the thumbnail cannot be set, or undefined when it can. */
  readonly disabled: string | undefined;
  readonly onThumbnailAt: (seconds: number) => void;
  readonly onMeasured: (measured: Measured) => void;
}) {
  const unmeasured =
    entry.width === undefined ||
    entry.height === undefined ||
    (entry.type === "video" && entry.duration === undefined);
  const key = `${reference}:${entry.fingerprint}`;

  if (entry.status === "missing")
    return (
      <div className="grid aspect-video w-full place-items-center rounded-sm bg-black text-xs text-amber-300">
        The file is missing
      </div>
    );

  if (entry.type === "image")
    return (
      <img
        key={key}
        alt=""
        className="aspect-video w-full rounded-sm bg-black object-contain"
        src={packEntryUrl(reference)}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (unmeasured && image.naturalWidth > 0)
            onMeasured({
              width: image.naturalWidth,
              height: image.naturalHeight,
            });
        }}
      />
    );

  return (
    <VideoPlayer
      key={key}
      reference={reference}
      entry={entry}
      unmeasured={unmeasured}
      disabled={disabled}
      onThumbnailAt={onThumbnailAt}
      onMeasured={onMeasured}
    />
  );
}

/** The video with its scrubber; keyed by entry and fingerprint above, so its position starts over with another file. */
function VideoPlayer({
  reference,
  entry,
  unmeasured,
  disabled,
  onThumbnailAt,
  onMeasured,
}: {
  readonly reference: string;
  readonly entry: PackEntryLive;
  readonly unmeasured: boolean;
  readonly disabled: string | undefined;
  readonly onThumbnailAt: (seconds: number) => void;
  readonly onMeasured: (measured: Measured) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(entry.duration ?? 0);
  const original = !hasBaseProxy(entry);
  return (
    <div className="grid gap-1.5">
      <video
        ref={video}
        className="aspect-video w-full rounded-sm bg-black object-contain"
        poster={entry.hasThumbnail ? packThumbUrl(reference, entry) : undefined}
        src={
          original ? packEntryUrl(reference) : packProxyUrl(reference, entry)
        }
        muted
        loop
        autoPlay
        playsInline
        onLoadedMetadata={(event) => {
          const element = event.currentTarget;
          if (Number.isFinite(element.duration)) setLength(element.duration);
          if (original && unmeasured && element.videoWidth > 0)
            onMeasured({
              width: element.videoWidth,
              height: element.videoHeight,
              duration: Number.isFinite(element.duration)
                ? element.duration
                : undefined,
            });
        }}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
      />
      <div className="flex items-center gap-1.5">
        <Slider
          aria-label="Position"
          className="min-w-0 flex-1"
          min={0}
          max={Math.max(length, 0.01)}
          step={0.01}
          value={Math.min(time, length)}
          onValueChange={(next) => {
            const position = typeof next === "number" ? next : (next[0] ?? 0);
            const element = video.current;
            if (element !== null) {
              element.pause();
              element.currentTime = position;
            }
            setTime(position);
          }}
          onValueCommitted={() =>
            void video.current?.play().catch(() => undefined)
          }
        />
        <span className="w-12 shrink-0 text-right text-[0.6875rem] text-muted-foreground tabular-nums">
          {time.toFixed(1)} s
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="justify-self-start"
        disabled={disabled !== undefined}
        title={
          disabled ?? "Bake the thumbnail from the frame the scrubber is on"
        }
        onClick={() => onThumbnailAt(Math.round(time * 100) / 100)}
      >
        <Camera /> Use this frame as thumbnail
      </Button>
    </div>
  );
}
