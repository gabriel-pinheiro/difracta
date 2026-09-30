import { cn } from "@/lib/utils";

import type { Crop, CropGrip, CropSide } from "./crop-drag";

const percent = (fraction: number): string => `${String(fraction * 100)}%`;

/** Where each side's grip sits on the rectangle, and the cursor over it. */
const grips: Readonly<Record<CropSide, string>> = {
  left: "inset-y-0 -left-1 w-2 cursor-ew-resize",
  right: "inset-y-0 -right-1 w-2 cursor-ew-resize",
  top: "inset-x-0 -top-1 h-2 cursor-ns-resize",
  bottom: "inset-x-0 -bottom-1 h-2 cursor-ns-resize",
};

const labels: Readonly<Record<CropSide, string>> = {
  left: "Crop Left",
  top: "Crop Top",
  right: "Crop Right",
  bottom: "Crop Bottom",
};

/**
 * The rectangle the crops leave, over the picture: what is cut is dimmed,
 * each side a grip, the inside a grip for the whole rectangle. A side in
 * `driven` has no grip, and then the inside has none either.
 */
export function CropRectangle({
  crop,
  driven,
  onGrab,
}: {
  readonly crop: Crop;
  readonly driven: ReadonlySet<CropSide>;
  readonly onGrab: (
    grip: CropGrip,
    event: React.PointerEvent<HTMLElement>,
  ) => void;
}) {
  const free = driven.size === 0;
  return (
    <div
      role={free ? "button" : undefined}
      aria-label={free ? "Crop rectangle" : undefined}
      className={cn(
        "absolute touch-none border border-selection shadow-[0_0_0_100vmax_rgb(0_0_0/0.55)] select-none",
        free && "cursor-move",
      )}
      style={{
        left: percent(crop.left),
        top: percent(crop.top),
        right: percent(crop.right),
        bottom: percent(crop.bottom),
      }}
      onPointerDown={free ? (event) => onGrab("move", event) : undefined}
    >
      {(Object.keys(grips) as CropSide[]).map((side) =>
        driven.has(side) ? (
          <span
            key={side}
            className={cn(
              "absolute bg-amber-300/50",
              grips[side].replace(/cursor-\S+/, ""),
            )}
            title={`${labels[side]} follows its Controller`}
          />
        ) : (
          <span
            key={side}
            role="slider"
            aria-label={labels[side]}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={crop[side]}
            data-crop-grip={side}
            className={cn(
              "absolute hover:bg-selection/40 active:bg-selection/60",
              grips[side],
            )}
            onPointerDown={(event) => onGrab(side, event)}
          />
        ),
      )}
    </div>
  );
}
