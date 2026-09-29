import type { DocumentView } from "@difracta/client";

import { Badge } from "@/components/ui/badge";
import { useDocumentPath } from "@/lib/client";

import { useFramedLayerDisabled } from "./preview-state";
import { framedOn, type PreviewTarget } from "./preview-target";

/**
 * What the Preview shows, by name, and what sets it apart from the Outputs:
 * a Scene that is not the one playing, a Layer shown that is disabled, and
 * Blackout, which it ignores.
 */
export function PreviewShown({
  view,
  target,
  named,
}: {
  readonly view: DocumentView;
  readonly target: PreviewTarget;
  /** Whether to name what is shown; the picker already names an Output picked there. */
  readonly named: boolean;
}) {
  const on = framedOn(target);
  const [table, id] =
    target.framing === "layer"
      ? ["layers", target.layerId]
      : on.framing === "output"
        ? ["outputs", on.outputId]
        : ["surfaces", on.surfaceId];
  const name = useDocumentPath<string>(view, [table, id, "name"]);
  const scene = useDocumentPath<string>(view, [
    "scenes",
    on.sceneId ?? "",
    "name",
  ]);
  const disabled = useFramedLayerDisabled(view, target);
  const blackout =
    useDocumentPath<boolean>(view, ["operational", "blackout"]) ?? false;
  return (
    <>
      {named && name !== undefined && (
        <span className="min-w-0 truncate text-muted-foreground">{name}</span>
      )}
      {disabled && (
        <Badge
          variant="outline"
          title="This Layer is disabled, or for a Filter Layer a Group it is in, so the Preview draws nothing of it. Enable it to see it."
        >
          Disabled
        </Badge>
      )}
      {on.sceneId !== null && scene !== undefined && (
        <Badge
          variant="secondary"
          className="min-w-0"
          title="This Scene is not the one playing. Select the playing Scene, or pick an Output, to see what plays."
        >
          <span className="truncate">Scene: {scene}</span>
        </Badge>
      )}
      {blackout && (
        <Badge
          variant="destructive"
          title="The Outputs are dark. The Preview shows what they would without Blackout."
        >
          Blackout
        </Badge>
      )}
    </>
  );
}
