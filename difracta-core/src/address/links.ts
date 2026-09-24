import { emptyCatalog, type Catalog } from "../catalog/catalog.ts";
import { numberProblem } from "../catalog/parameters.ts";
import type {
  Controller,
  Document,
  Layer,
  Link,
  Table,
} from "../document/document.ts";
import { getAtPath } from "../document/patch.ts";
import {
  linkable,
  resolveAddress,
  type AddressValue,
  type ResolvedAddress,
} from "./address.ts";

/**
 * Parameter Links resolved at read time. Nothing is materialized: a Layer
 * keeps its authored values in the document, and whoever needs what the
 * Layer is showing right now asks here. The Output does so once per frame
 * and Studio per row, both through the same rule, so the two never drift.
 */

const indexes = new WeakMap<Table<Link>, ReadonlyMap<string, Link>>();

/** Links by Address, built once per `links` table identity. */
export function linksByAddress(links: Table<Link>): ReadonlyMap<string, Link> {
  let index = indexes.get(links);
  if (index === undefined) {
    index = new Map(Object.values(links).map((link) => [link.address, link]));
    indexes.set(links, index);
  }
  return index;
}

/** The Link driving `address`, if any. */
export function linkAt(
  document: Pick<Document, "links">,
  address: string,
): Link | undefined {
  return linksByAddress(document.links).get(address);
}

/** The Links whose target is on the Layer, in no particular order. */
export function linksOfLayer(
  links: Table<Link>,
  layerId: string,
): readonly Link[] {
  const prefix = `layer/${layerId}/`;
  return Object.values(links).filter((link) => link.address.startsWith(prefix));
}

/**
 * What a Controller's value becomes at a target: a number link maps 0..1
 * onto its anchors, clamped to the target's range and snapped to its step
 * from the minimum; a boolean target is on from 0.5; a color copies.
 */
export function mappedValue(
  controller: Controller,
  link: Link,
  resolved: ResolvedAddress,
): AddressValue | undefined {
  if (controller.kind === "color")
    return resolved.type === "color" ? controller.value : undefined;
  if (controller.kind === "group") return undefined;
  const position = controller.value;
  if (resolved.type === "boolean") return position >= 0.5;
  if (resolved.type !== "number") return undefined;
  const { from, to } = link.anchors ?? { from: 0, to: 1 };
  let value = from + (to - from) * position;
  const range = resolved.range;
  if (range !== undefined) {
    if (range.step !== undefined && range.step > 0)
      value =
        range.min + Math.round((value - range.min) / range.step) * range.step;
    value = Math.min(range.max, Math.max(range.min, value));
  }
  return value;
}

/** The value an Address shows right now: its Controller's, mapped, or the authored one. */
export function effectiveValue(
  document: Document,
  resolved: ResolvedAddress,
): AddressValue {
  const authored = getAtPath(document, resolved.path) as AddressValue;
  const link = linkAt(document, resolved.address);
  if (link === undefined) return authored;
  const controller = document.controllers[link.controllerId];
  if (controller === undefined) return authored;
  return mappedValue(controller, link, resolved) ?? authored;
}

const layerCaches = new WeakMap<Document, Map<string, Layer>>();

/**
 * A Layer with every linked value replaced by what its Controller makes of
 * it, or the Layer itself when nothing on it is linked. Cached per document
 * revision, so a frame or a re-render costs one lookup.
 */
export function effectiveLayer(
  document: Document,
  layer: Layer,
  catalog: Catalog = emptyCatalog,
): Layer {
  let cache = layerCaches.get(document);
  if (cache === undefined) {
    cache = new Map();
    layerCaches.set(document, cache);
  }
  const cached = cache.get(layer.id);
  if (cached !== undefined) return cached;
  let result: Layer = layer;
  for (const link of linksOfLayer(document.links, layer.id)) {
    const controller = document.controllers[link.controllerId];
    if (controller === undefined) continue;
    const resolved = resolveAddress(document, link.address, catalog);
    if (resolved === undefined) continue;
    const value = mappedValue(controller, link, resolved);
    if (value === undefined) continue;
    result = withValue(result, resolved.path.slice(2), value);
  }
  cache.set(layer.id, result);
  return result;
}

/** The Document with every Layer replaced by its effective one; the same object when no Link exists. */
export function effectiveDocument(
  document: Document,
  catalog: Catalog = emptyCatalog,
): Document {
  if (Object.keys(document.links).length === 0) return document;
  const layers: Record<string, Layer> = {};
  for (const [id, layer] of Object.entries(document.layers))
    layers[id] = effectiveLayer(document, layer, catalog);
  return { ...document, layers };
}

/** `layer` with the value at `path` (relative to the Layer) replaced. */
function withValue(
  layer: Layer,
  path: readonly string[],
  value: AddressValue,
): Layer {
  const [head, ...rest] = path;
  if (head === undefined) return layer;
  const record = layer as unknown as Record<string, unknown>;
  const next =
    rest.length === 0
      ? value
      : {
          ...(record[head] as Record<string, unknown>),
          [rest[0] ?? ""]: value,
        };
  return { ...record, [head]: next } as unknown as Layer;
}

/** Why `controller` cannot drive `resolved`, or undefined when it can. */
export function linkProblem(
  controller: Controller,
  resolved: ResolvedAddress,
): string | undefined {
  if (controller.kind === "group") return "A Group has no value to link.";
  if (resolved.type === "media")
    return `“${resolved.label}” picks a Media item; it cannot be linked to a Controller.`;
  if (!linkable(resolved, controller.kind))
    return `“${resolved.label}” cannot be driven by a ${controller.kind === "number" ? "Number" : "Color"} Controller.`;
  return undefined;
}

/** The anchors a new number link starts with: the target's whole range. */
export function defaultAnchors(resolved: ResolvedAddress): Link["anchors"] {
  if (resolved.type !== "number") return null;
  const range = resolved.range ?? { min: 0, max: 1 };
  return { from: range.min, to: range.max };
}

/**
 * Why `anchors` cannot be stored for `resolved`, or undefined when they can:
 * only a number target has anchors, and each must be a value the target
 * accepts directly, within its range and on its step. Reversed anchors are
 * fine; they invert the Controller.
 */
export function anchorsProblem(
  resolved: ResolvedAddress,
  anchors: NonNullable<Link["anchors"]>,
): string | undefined {
  if (resolved.type !== "number")
    return `${resolved.label} is a ${resolved.type}; only a number target has anchors.`;
  const range = resolved.range ?? { min: 0, max: 1 };
  const grid =
    range.step === undefined ? "" : ` in steps of ${String(range.step)}`;
  for (const [end, value] of [
    ["0", anchors.from],
    ["1", anchors.to],
  ] as const) {
    const problem = numberProblem(range, value);
    if (problem !== undefined)
      return `${resolved.label} anchors must lie within ${String(range.min)} to ${String(range.max)}${grid}; the anchor at ${end} ${problem}.`;
  }
  return undefined;
}
