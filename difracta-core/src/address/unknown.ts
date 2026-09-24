import type { Catalog } from "../catalog/catalog.ts";
import { catalogHint } from "../catalog/parameters.ts";
import { layerDefinition, type AddressSource } from "./address.ts";

/**
 * Why an Address resolves to nothing, said so the caller can fix it: a
 * Layer's Parameter or Cue that its Visual or Filter does not declare comes
 * back with the keys it does declare and where to read them.
 */
export function unknownAddress(
  document: AddressSource,
  address: string,
  catalog: Catalog,
): string {
  const base = `Unknown address “${address}”`;
  const [head, id = "", field, key] = address.split("/");
  const layer = head === "layer" ? document.layers[id] : undefined;
  if (layer === undefined || key === undefined) return `${base}.`;
  if (field !== "param" && field !== "cue") return `${base}.`;
  if (layer.kind === "group")
    return `${base}: Layer “${layer.name}” is a Group; it has no Parameters or Cues.`;
  const definition = layerDefinition(layer, catalog);
  if (definition === undefined) {
    const picked = layer.kind === "visual" ? layer.visual : layer.filter;
    const noun = layer.kind === "visual" ? "Visual" : "Filter";
    return picked === null
      ? `${base}: Layer “${layer.name}” has no ${noun} yet.`
      : `${base}: ${noun} “${picked}” is not in the Catalog.`;
  }
  const keys =
    field === "param"
      ? Object.keys(definition.parameters)
      : (definition.cues ?? []).map((cue) => cue.key);
  const noun = field === "param" ? "Parameters" : "Cues";
  const declared =
    keys.length === 0
      ? `declares no ${noun}`
      : `declares the ${noun} ${keys.join(", ")}`;
  return `${base}: ${definition.name} ${declared}. ${catalogHint(definition.id)}`;
}
