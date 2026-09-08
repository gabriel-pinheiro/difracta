import {
  CORNERS,
  type CornerName,
  type Point,
  type Quad,
} from "@difracta/core";
import {
  nudgeKeyHandler,
  PolygonEditor,
  type Outline,
} from "@/inspector/fields/polygon-editor";
import { cn } from "@/lib/utils";

const cornerLabels: Record<CornerName, string> = {
  topLeft: "Top left",
  topRight: "Top right",
  bottomRight: "Bottom right",
  bottomLeft: "Bottom left",
};
const cornerShortLabels: Record<CornerName, string> = {
  topLeft: "TL",
  topRight: "TR",
  bottomRight: "BR",
  bottomLeft: "BL",
};

export function quadPoints(quad: Quad): readonly Point[] {
  return CORNERS.map((corner) => quad[corner]);
}

/**
 * The Surface's quad inside its Output's Projection Frame: the polygon
 * editor plus one button per corner, laid out like the corners, for
 * selecting and nudging by keyboard.
 */
export function QuadEditor({
  corners,
  others,
  aspect,
  selected,
  onSelect,
  onSet,
  onNudge,
}: {
  readonly corners: Quad;
  /** Other Surfaces on the same Output, drawn as outlines for context. */
  readonly others: readonly Outline[];
  /** Projection Frame width divided by height. */
  readonly aspect: number;
  /** Index into CORNERS of the corner the buttons and keys act on. */
  readonly selected: number;
  readonly onSelect: (index: number) => void;
  readonly onSet: (corner: CornerName, point: Point) => Promise<unknown>;
  readonly onNudge: (corner: CornerName, by: Point) => void;
}) {
  const cornerAt = (index: number): CornerName => CORNERS[index] ?? "topLeft";
  const nudgeAt = (index: number, by: Point): void =>
    onNudge(cornerAt(index), by);
  return (
    <div className="grid gap-3">
      <PolygonEditor
        points={quadPoints(corners)}
        names={CORNERS.map((corner) => cornerShortLabels[corner])}
        outlines={others}
        aspect={aspect}
        selected={selected}
        onSelect={onSelect}
        onSet={(index, point) => onSet(cornerAt(index), point)}
        onNudge={nudgeAt}
        spaceLabel="Surface corners in the Output's frame"
      />
      <div
        className="grid grid-cols-2 gap-1"
        role="radiogroup"
        aria-label="Corner"
      >
        {CORNERS.map((corner, index) => (
          <button
            key={corner}
            type="button"
            role="radio"
            aria-checked={index === selected}
            title="Arrow keys move the corner; Shift for larger, Ctrl for finer steps"
            className={cn(
              "h-6 rounded-md border text-xs focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
              index === selected
                ? "border-selection bg-selection/15"
                : "border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              corner === "bottomRight" && "order-last",
            )}
            onClick={() => onSelect(index)}
            onKeyDown={nudgeKeyHandler(index, nudgeAt)}
          >
            {cornerLabels[corner]}
          </button>
        ))}
      </div>
    </div>
  );
}
