import {
  isEnabledOn,
  resolveTarget,
  type Catalog,
  type Document,
} from "@difracta/core";

const NONE: ReadonlySet<string> = new Set();

/**
 * The Screen Shares an Output views: the ones a Visual Layer of the active
 * Scene names in a Media Parameter that accepts `live`, whether the Layer
 * is enabled or not, as long as its Target is on this Output. A disabled
 * Layer counts so that the Macro enabling it finds the picture there; a
 * Layer on another Output's Surface does not, since each Viewer is one
 * more encode for the Sharer. Pure, and asked once per document revision.
 */
export function wantedShares(
  document: Document,
  outputId: string,
  catalog: Catalog,
): ReadonlySet<string> {
  const scene = document.installation.activeScene;
  if (scene === null) return NONE;
  let wanted: Set<string> | undefined;
  for (const layer of Object.values(document.layers)) {
    if (layer.kind !== "visual" || layer.sceneId !== scene) continue;
    if (layer.visual === null) continue;
    const parameters = catalog.visual(layer.visual)?.parameters;
    if (parameters === undefined) continue;
    let onOutput: boolean | undefined;
    for (const [name, parameter] of Object.entries(parameters)) {
      if (parameter.kind !== "media" || parameter.accepts !== "live") continue;
      const value = layer.parameters[name];
      if (typeof value !== "string" || value === "") continue;
      if (document.media[value]?.kind !== "share") continue;
      onOutput ??= landsOn(document, layer.target, outputId);
      if (onOutput) (wanted ??= new Set()).add(value);
    }
  }
  return wanted ?? NONE;
}

function landsOn(
  document: Document,
  target: string | null,
  outputId: string,
): boolean {
  const surface = resolveTarget(document, target)?.surface;
  return surface !== undefined && isEnabledOn(surface, outputId);
}
