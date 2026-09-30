import type { DocumentView } from "@difracta/client";
import {
  effectiveValue,
  linkAt,
  resolveAddress,
  settings,
  type Controller,
  type Link,
  type Media,
  type Table,
  type VisualLayer,
} from "@difracta/core";
import { useCallback, useRef, useState } from "react";

import { SharePicture } from "@/entities/media/share-picture";
import { catalog, definitionOf } from "@/lib/catalog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useLatestWins } from "@/lib/use-latest-wins";

import {
  CROP_PARAMETERS,
  CROP_SIDES,
  dragCrop,
  shownCrop,
  sidesOf,
  type Crop,
  type CropGrip,
  type CropSide,
} from "./crop-drag";
import { CropRectangle } from "./crop-rectangle";

const cropAddress = (layerId: string, side: CropSide): string =>
  `layer/${layerId}/param/${CROP_PARAMETERS[side]}`;

/**
 * The Live Visual's crop editor, above its Parameters: the Screen Share's
 * picture with the rectangle its four crops leave, whose sides and whole
 * drag. A drag streams its values as the sliders do, one send in flight:
 * a side through `address.edit`, the whole rectangle through
 * `addresses.edit`, so either undoes as one step. The four crops stay
 * rows of their own below it. A crop a Controller drives shows where the
 * Controller puts it and does not drag; the whole rectangle drags only
 * while none is driven. With nobody sharing, or no Screen Share picked,
 * the frame is empty and the rectangle still drags.
 */
export function LiveCropEditor({
  view,
  layer,
}: {
  readonly view: DocumentView;
  readonly layer: VisualLayer;
}) {
  const command = useCommand(view);
  const media = useDocumentPath<Table<Media>>(view, ["media"]) ?? {};
  const links = useDocumentPath<Table<Link>>(view, ["links"]) ?? {};
  // A driven crop moves with its Controller's value.
  useDocumentPath<Table<Controller>>(view, ["controllers"]);
  const [dragging, setDragging] = useState<Crop | undefined>(undefined);
  const frame = useRef<HTMLDivElement>(null);

  const document = view.get();
  const valueOf = (side: CropSide): number => {
    const address = cropAddress(layer.id, side);
    const resolved =
      document === undefined
        ? undefined
        : resolveAddress(document, address, catalog);
    const value =
      document === undefined || resolved === undefined
        ? layer.parameters[CROP_PARAMETERS[side]]
        : effectiveValue(document, resolved);
    return typeof value === "number" ? value : 0;
  };
  const crop = shownCrop({
    left: valueOf("left"),
    top: valueOf("top"),
    right: valueOf("right"),
    bottom: valueOf("bottom"),
  });
  const driven = new Set(
    CROP_SIDES.filter(
      (side) => linkAt({ links }, cropAddress(layer.id, side)) !== undefined,
    ),
  );
  const parameter = definitionOf(layer).definition?.parameters.cropLeft;
  const grid = {
    step: parameter?.kind === "number" ? parameter.step : undefined,
    minSide: settings.shares.viewer.minCropSide,
  };

  const send = useLatestWins(
    useCallback(
      ({ grip, next }: { grip: CropGrip; next: Crop }) => {
        const edits = sidesOf(grip).map((side) => ({
          address: cropAddress(layer.id, side),
          value: next[side],
        }));
        const [only] = edits;
        return edits.length === 1 && only !== undefined
          ? command("address.edit", only)
          : command("addresses.edit", { edits });
      },
      [command, layer.id],
    ),
  );

  const grab = (
    grip: CropGrip,
    event: React.PointerEvent<HTMLElement>,
  ): void => {
    const box = frame.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0 || box.height === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const start = crop;
    const origin = { x: event.clientX, y: event.clientY };
    const move = (moved: PointerEvent): void => {
      const next = dragCrop(
        start,
        grip,
        (moved.clientX - origin.x) / box.width,
        (moved.clientY - origin.y) / box.height,
        grid,
      );
      setDragging(next);
      send({ grip, next });
    };
    const end = (): void => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", end);
      target.removeEventListener("pointercancel", end);
      setDragging(undefined);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", end);
    target.addEventListener("pointercancel", end);
  };

  const mediaId = layer.parameters.media;
  const slot =
    typeof mediaId === "string" && media[mediaId]?.kind === "share"
      ? mediaId
      : undefined;
  const rectangle = (
    <div ref={frame} className="absolute inset-0">
      <CropRectangle crop={dragging ?? crop} driven={driven} onGrab={grab} />
    </div>
  );
  return (
    <div className="grid gap-1.5" data-testid="crop-editor">
      <span className="text-xs text-muted-foreground">Crop</span>
      {slot === undefined ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-black">
          <p className="absolute inset-0 grid place-items-center p-3 text-center text-[0.6875rem]/relaxed text-muted-foreground">
            No Screen Share picked
          </p>
          {rectangle}
        </div>
      ) : (
        <SharePicture
          mediaId={slot}
          media={media}
          empty={`Nobody shares into “${media[slot]?.name ?? ""}”`}
        >
          {rectangle}
        </SharePicture>
      )}
      <p className="text-[0.6875rem]/relaxed text-muted-foreground">
        {driven.size === 0
          ? "Drag a side, or the rectangle, to crop the picture."
          : "A Controller drives a crop: its side stays where the Controller puts it, and only the other sides drag."}
      </p>
    </div>
  );
}
