import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { ShareSlot } from "./share-slots";
import type { RunningShare } from "./sharer";

/** A small picture of what is captured, as the Viewers get it. */
function Preview({ stream }: { readonly stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (element === null) return;
    element.srcObject = stream;
    return () => {
      element.srcObject = null;
    };
  }, [stream]);
  return (
    <video
      ref={video}
      muted
      autoPlay
      playsInline
      className="aspect-video w-40 shrink-0 rounded-sm bg-black object-contain"
    />
  );
}

const viewers = ({ offered, connected }: RunningShare): string => {
  if (offered === 0) return "No Viewer yet";
  const all = offered === 1 ? "1 Viewer" : `${String(offered)} Viewers`;
  return connected === offered
    ? `${all} connected`
    : `${all}, ${String(connected)} connected`;
};

/** What this computer shares: each share with its slot, its picture, its Viewers and Stop. */
export function ShareList({
  shares,
  slots,
  adding,
  onStop,
  onAdd,
}: {
  readonly shares: readonly RunningShare[];
  readonly slots: readonly ShareSlot[];
  /** The start flow is open below. */
  readonly adding: boolean;
  readonly onStop: (mediaId: string) => void;
  readonly onAdd: () => void;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="font-medium">Sharing from this computer</h2>
      <ul className="divide-y rounded-md border" aria-label="Shares">
        {shares.map((share) => (
          <li
            key={share.mediaId}
            className="flex items-center gap-3 px-3 py-3"
            data-testid="share-row"
          >
            <Preview stream={share.stream} />
            <div className="grid min-w-0 flex-1 gap-1">
              <span className="truncate font-medium">
                {slots.find((slot) => slot.id === share.mediaId)?.name ??
                  "Screen Share"}
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline">
                  {share.source === "screen" ? "A screen" : "A window"}
                </Badge>
                <Badge variant="outline">
                  {share.quality === "sharp" ? "Sharp" : "Smooth"}
                </Badge>
                {share.cursorShown && <Badge variant="outline">Cursor</Badge>}
              </span>
              {share.cursorShown && !share.cursor && (
                <span className="text-xs text-muted-foreground">
                  The cursor is in the picture: this system draws it into every
                  capture.
                </span>
              )}
              <span
                className="text-xs text-muted-foreground"
                data-testid="share-viewers"
              >
                {viewers(share)}
              </span>
            </div>
            <Button variant="destructive" onClick={() => onStop(share.mediaId)}>
              Stop
            </Button>
          </li>
        ))}
      </ul>
      {!adding && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={onAdd}
        >
          Share another…
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Closing this window keeps sharing. File ▸ Share Screen... opens it
        again.
      </p>
    </section>
  );
}
