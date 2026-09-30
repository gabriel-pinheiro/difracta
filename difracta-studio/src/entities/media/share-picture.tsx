import type { Media, Table } from "@difracta/core";
import type { MediaHandle, ViewerClaim } from "@difracta/render";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useShareViewer } from "@/lib/share-viewer";

/** Width over height of a picture nobody has shown yet. */
const UNKNOWN_ASPECT = 16 / 9;

/** Each slot's picture shape as last seen on this page, so an empty frame keeps it. */
const knownAspects = new Map<string, number>();

/**
 * A Screen Share's live picture, drawn from this page's one Viewer: the
 * component claims the slot while it is mounted and the page is visible,
 * and copies each new frame of the share into a canvas of the size it is
 * shown at. Without a picture it is an empty frame of the slot's last known
 * shape, 16:9 before any; `empty` says why in it. `children` are laid over
 * the picture, in its frame, as the crop editor's rectangle is.
 */
export function SharePicture({
  mediaId,
  media,
  empty,
  children,
}: {
  readonly mediaId: string;
  readonly media: Table<Media>;
  /** What the empty frame says. */
  readonly empty: ReactNode;
  readonly children?: ReactNode;
}) {
  const viewer = useShareViewer();
  const canvas = useRef<HTMLCanvasElement>(null);
  const claim = useRef<{ claim: ViewerClaim; want: () => void }>(undefined);
  const table = useRef(media);
  const [aspect, setAspect] = useState(
    () => knownAspects.get(mediaId) ?? UNKNOWN_ASPECT,
  );
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const held = viewer.claim();
    const wanted = new Set([mediaId]);
    const want = (): void => {
      if (document.visibilityState === "visible")
        held.sync(wanted, table.current);
      else held.pause();
    };
    claim.current = { claim: held, want };
    want();
    document.addEventListener("visibilitychange", want);
    const last: Painted = {
      image: null,
      version: 0,
      width: 0,
      height: 0,
      aspect: 0,
    };
    let frame = requestAnimationFrame(function draw() {
      frame = requestAnimationFrame(draw);
      const element = canvas.current;
      if (element === null) return;
      const shown = paint(element, held.live(mediaId)?.handle, last);
      if (shown === undefined) return;
      setShowing(shown.showing);
      if (shown.aspect !== undefined) {
        knownAspects.set(mediaId, shown.aspect);
        setAspect(shown.aspect);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", want);
      claim.current = undefined;
      held.dispose();
      setShowing(false);
    };
  }, [viewer, mediaId]);

  // A new Media table reaches the claim without claiming again.
  useEffect(() => {
    table.current = media;
    claim.current?.want();
  }, [media]);

  return (
    <div
      className="relative w-full overflow-hidden rounded-md border bg-black"
      style={{ aspectRatio: String(aspect) }}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {!showing && (
        <p className="absolute inset-0 grid place-items-center p-3 text-center text-[0.6875rem]/relaxed text-muted-foreground">
          {empty}
        </p>
      )}
      {children}
    </div>
  );
}

/** What the canvas holds now. */
interface Painted {
  image: unknown;
  version: number;
  width: number;
  height: number;
  /** The picture's own shape, width over height; 0 before any. */
  aspect: number;
}

/**
 * Copies the handle's picture into the canvas when it is a new one or the
 * canvas changed size. Answers what changed for the component: whether a
 * picture shows, and its shape when that is new; undefined when nothing did.
 */
function paint(
  element: HTMLCanvasElement,
  handle: MediaHandle | undefined,
  last: Painted,
): { readonly showing: boolean; readonly aspect?: number } | undefined {
  const image = handle?.image ?? null;
  if (handle === undefined || image === null) {
    if (last.image === null) return undefined;
    last.image = null;
    last.version = 0;
    element.getContext("2d")?.clearRect(0, 0, element.width, element.height);
    return { showing: false };
  }
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(element.clientWidth * ratio));
  const height = Math.max(1, Math.round(element.clientHeight * ratio));
  const fresh = last.image === null;
  if (
    !fresh &&
    last.image === image &&
    last.version === handle.version &&
    width === last.width &&
    height === last.height
  )
    return undefined;
  if (element.width !== width) element.width = width;
  if (element.height !== height) element.height = height;
  element.getContext("2d")?.drawImage(image, 0, 0, width, height);
  last.image = image;
  last.version = handle.version;
  const aspect =
    handle.width > 0 && handle.height > 0
      ? handle.width / handle.height
      : undefined;
  const shape =
    aspect !== undefined && Math.abs(aspect - last.aspect) > 1e-3
      ? aspect
      : undefined;
  if (shape !== undefined) last.aspect = shape;
  last.width = width;
  last.height = height;
  if (!fresh && shape === undefined) return undefined;
  return { showing: true, ...(shape === undefined ? {} : { aspect: shape }) };
}
