import {
  usesMatching,
  type AddressSource,
  type Catalog,
  type MediaUse,
} from "@difracta/core";

/** Every Layer Parameter and Macro action holding a reference into `packId`. */
export function packUses(
  document: AddressSource,
  catalog: Catalog,
  packId: string,
): readonly MediaUse[] {
  const prefix = `${packId}/`;
  return usesMatching(document, catalog, (reference) =>
    reference.startsWith(prefix),
  );
}

/**
 * What the confirm before detaching says: how many Layers and Macro
 * actions use the Pack's entries, and that they read as missing afterwards.
 */
export function detachDescription(
  name: string,
  uses: readonly MediaUse[],
): string {
  const layers = new Set(
    uses.flatMap((use) => (use.kind === "layer" ? [use.layerId] : [])),
  ).size;
  const actions = uses.filter((use) => use.kind === "macro").length;
  const parts = [
    ...(layers > 0
      ? [`${String(layers)} ${layers === 1 ? "Layer" : "Layers"}`]
      : []),
    ...(actions > 0
      ? [`${String(actions)} Macro ${actions === 1 ? "action" : "actions"}`]
      : []),
  ];
  if (parts.length === 0)
    return `Nothing in the Installation uses “${name}”. The folder stays on disk.`;
  const verb = layers + actions === 1 ? "uses" : "use";
  return `${parts.join(" and ")} ${verb} “${name}”. They keep their references and show nothing until the Pack is attached again. The folder stays on disk.`;
}
