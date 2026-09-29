import type { DocumentView } from "@difracta/client";
import { settings } from "@difracta/core";
import { useEffect, useRef, useState } from "react";

import { studioRuntimeOrigin } from "@/lib/runtime-origin";

import { PreviewCanvas } from "./preview-canvas";
import { previewFrames } from "./preview-document";
import { PreviewOverlay } from "./preview-overlay";
import type { PreviewTarget } from "./preview-target";

/**
 * The Preview's picture: the target rendered from the view's document as it
 * changes, letterboxed to `aspect` inside the space it is given. The canvas
 * is made here rather than rendered, so it never outlives its compositor.
 */
export function PreviewFrame({
  view,
  target,
  aspect,
  active,
  outline,
}: {
  readonly view: DocumentView;
  readonly target: PreviewTarget;
  /** Width over height. */
  readonly aspect: number;
  /** Whether frames are rendered; the picture stays as it is while not. */
  readonly active: boolean;
  /** Whether the selection is outlined over the picture. */
  readonly outline: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const host = useRef<PreviewCanvas>(undefined);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    const parent = mount.current;
    if (parent === null) return;
    const element = document.createElement("canvas");
    element.className = "block size-full";
    parent.append(element);
    const runtime = studioRuntimeOrigin();
    host.current = new PreviewCanvas(element, {
      mediaUrl: (id) =>
        `${runtime}${settings.runtime.mediaPath}/${encodeURIComponent(id)}`,
      fontUrl: (file) =>
        `${runtime}${settings.runtime.fontsPath}/${encodeURIComponent(file)}`,
      onProblem: setProblem,
    });
    return () => {
      host.current?.dispose();
      host.current = undefined;
      element.remove();
    };
  }, []);

  useEffect(() => {
    const canvas = host.current;
    if (canvas === undefined) return;
    const frames = previewFrames();
    const show = (): void => {
      const document = view.get();
      canvas.show(
        document === undefined ? undefined : frames(document, target),
      );
    };
    show();
    const unsubscribeDocument = view.subscribePath([], show);
    const unsubscribeEvents = view.subscribeEvents((address) => {
      const [entity, layerId, field, key] = address.split("/");
      if (entity === "layer" && field === "cue" && layerId && key)
        canvas.trigger(layerId, key);
    });
    return () => {
      unsubscribeDocument();
      unsubscribeEvents();
    };
  }, [view, target]);

  useEffect(() => {
    host.current?.setActive(active);
  }, [active]);

  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-2"
      style={{ containerType: "size" }}
    >
      <div
        className="relative bg-black"
        style={{
          width: `min(100cqw, 100cqh * ${String(aspect)})`,
          height: `min(100cqh, 100cqw / ${String(aspect)})`,
        }}
      >
        <div ref={mount} className="size-full" />
        {outline && <PreviewOverlay view={view} target={target} />}
        {problem !== undefined && (
          <p className="absolute inset-0 grid place-items-center p-3 text-center text-muted-foreground">
            The Preview cannot draw: {problem}
          </p>
        )}
      </div>
    </div>
  );
}
