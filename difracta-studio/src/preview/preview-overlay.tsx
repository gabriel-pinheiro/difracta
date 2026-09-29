import type { DocumentView } from "@difracta/client";

import { usePreviewOutline } from "./preview-state";
import type { PreviewTarget } from "./preview-target";

/**
 * The selection outlined over the Preview's picture. It covers the frame
 * and takes no pointer events, so it is only ever looked at.
 */
export function PreviewOverlay({
  view,
  target,
}: {
  readonly view: DocumentView;
  readonly target: PreviewTarget;
}) {
  const outline = usePreviewOutline(view, target);
  if (outline === undefined) return null;
  return (
    <svg
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
      aria-hidden
    >
      <polygon
        points={outline
          .map(({ x, y }) => `${String(x)},${String(y)}`)
          .join(" ")}
        className="fill-none stroke-primary"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
