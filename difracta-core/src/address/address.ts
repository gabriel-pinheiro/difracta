import { emptyCatalog, type Catalog } from "../catalog/catalog.ts";
import {
  ColorSchema,
  numberProblem,
  type NumberBounds,
  type ParameterDefinition,
  type ParameterValue,
} from "../catalog/parameters.ts";
import {
  BLEND_MODE_LABELS,
  BLEND_MODES,
  RENDER_SCALE,
  type Controller,
  type Document,
  type Layer,
  type Surface,
} from "../document/document.ts";
import { orderedEntries } from "../document/order.ts";
import { flattenTree } from "../document/tree.ts";
import type { PatchPath } from "../document/patch.ts";

/**
 * An Address names one controllable property or trigger in a Document, such
 * as `installation/blackout` or `layer/<id>/opacity`. Controllers,
 * Macros, Pads, OSC and the CLI all read and write Addresses, so adding an
 * entry here makes a property reachable from every control surface at once.
 *
 * A resolved Address carries everything a control needs: the value type,
 * the default, and for numbers the range and for choices the options. The
 * Studio inspector draws one row per Address from this alone, so a Layer's
 * opacity and a Visual's Parameter look and behave the same.
 */
export type AddressValueType =
  "boolean" | "number" | "color" | "choice" | "trigger";

export type AddressValue = ParameterValue;

export interface NumberRange extends NumberBounds {
  readonly unit?: string;
  /** Shown as 0 to 100 with a percent sign; the value itself stays 0 to 1. */
  readonly percent?: boolean;
}

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
}

export interface ResolvedAddress {
  readonly address: string;
  /** The property's own name, such as "Opacity" or "Speed". */
  readonly label: string;
  /** What the property belongs to, such as the Layer's name; absent for Installation-wide ones. */
  readonly owner?: string;
  readonly path: PatchPath;
  readonly type: AddressValueType;
  /** What the property starts at; a trigger has none. */
  readonly default?: AddressValue;
  readonly range?: NumberRange;
  readonly options?: readonly ChoiceOption[];
}

/** What resolving needs from a Document: the tables that own Addresses. */
export type AddressSource = Pick<
  Document,
  "layers" | "surfaces" | "controllers" | "scenes" | "macros"
>;

/** A source with nothing but the given entities, for resolving one entity's own Addresses. */
export function addressSource(partial: Partial<AddressSource>): AddressSource {
  return {
    layers: {},
    surfaces: {},
    controllers: {},
    scenes: {},
    macros: {},
    ...partial,
  };
}

interface AddressPattern {
  /** Segments; `*` captures one entity id (never a name: names resolve to ids in the CLI). */
  readonly pattern: readonly string[];
  resolve(
    source: AddressSource,
    catalog: Catalog,
    captures: readonly string[],
  ): Omit<ResolvedAddress, "address"> | undefined;
  list(source: AddressSource, catalog: Catalog): readonly (readonly string[])[];
}

function layerDefinition(layer: Layer, catalog: Catalog) {
  if (layer.kind === "visual")
    return layer.visual === null
      ? undefined
      : catalog.definition("visual", layer.visual);
  if (layer.kind === "filter")
    return layer.filter === null
      ? undefined
      : catalog.definition("filter", layer.filter);
  return undefined;
}

function fromParameter(
  layer: Layer,
  name: string,
  definition: ParameterDefinition,
): Omit<ResolvedAddress, "address"> {
  const base = {
    label: definition.label,
    owner: layer.name,
    path: ["layers", layer.id, "parameters", name] as const,
    default: definition.default,
  };
  switch (definition.kind) {
    case "number": {
      const range: NumberRange = {
        min: definition.min,
        max: definition.max,
        ...(definition.step === undefined ? {} : { step: definition.step }),
        ...(definition.unit === undefined ? {} : { unit: definition.unit }),
        ...(definition.percent === true ? { percent: true } : {}),
      };
      return { ...base, type: "number", range };
    }
    case "color":
      return { ...base, type: "color" };
    case "choice":
      return { ...base, type: "choice", options: definition.options };
    case "boolean":
      return { ...base, type: "boolean" };
  }
}

const layerIds = (document: AddressSource): readonly (readonly string[])[] =>
  orderedEntries(document.layers).map((layer) => [layer.id]);

const layersOfKind =
  (kind: Layer["kind"]) =>
  (document: AddressSource): readonly (readonly string[])[] =>
    orderedEntries(document.layers)
      .filter((layer) => layer.kind === kind)
      .map((layer) => [layer.id]);

const patterns: readonly AddressPattern[] = [
  {
    pattern: ["installation", "blackout"],
    resolve: () => ({
      label: "Blackout",
      path: ["operational", "blackout"],
      type: "boolean",
      default: false,
    }),
    list: () => [[]],
  },
  {
    pattern: ["scene", "*", "play"],
    resolve: (document, _catalog, [id = ""]) => {
      const scene = document.scenes[id];
      if (scene === undefined) return undefined;
      return {
        label: "Play",
        owner: scene.name,
        path: ["scenes", id, "play"],
        type: "trigger",
      };
    },
    list: (document) =>
      orderedEntries(document.scenes).map((scene) => [scene.id]),
  },
  {
    pattern: ["macro", "*", "run"],
    resolve: (document, _catalog, [id = ""]) => {
      const macro = document.macros[id];
      if (macro === undefined || macro.kind === "group") return undefined;
      return {
        label: "Run",
        owner: macro.name,
        path: ["macros", id, "run"],
        type: "trigger",
      };
    },
    list: (document) =>
      flattenTree(document.macros)
        .filter((macro) => macro.kind === "macro")
        .map((macro) => [macro.id]),
  },
  {
    pattern: ["surface", "*", "render-scale"],
    resolve: (document, _catalog, [id = ""]) => {
      const surface = document.surfaces[id];
      if (surface === undefined) return undefined;
      return {
        label: "Render Scale",
        owner: surface.name,
        path: ["surfaces", id, "renderScale"],
        type: "number",
        default: 1,
        range: { ...RENDER_SCALE, unit: "×" },
      };
    },
    list: (document) =>
      orderedEntries(document.surfaces).map((surface) => [surface.id]),
  },
  {
    pattern: ["controller", "*", "value"],
    resolve: (document, _catalog, [id = ""]) => {
      const controller = document.controllers[id];
      if (controller === undefined || controller.kind === "group")
        return undefined;
      const base = {
        label: "Value",
        owner: controller.name,
        path: ["controllers", id, "value"] as const,
      };
      return controller.kind === "number"
        ? {
            ...base,
            type: "number",
            range: { min: 0, max: 1, step: 0.01, percent: true },
          }
        : { ...base, type: "color" };
    },
    list: (document) =>
      orderedEntries(document.controllers)
        .filter((controller) => controller.kind !== "group")
        .map((controller) => [controller.id]),
  },
  {
    pattern: ["layer", "*", "enabled"],
    resolve: (document, _catalog, [id = ""]) => {
      const layer = document.layers[id];
      if (layer === undefined) return undefined;
      return {
        label: "Enabled",
        owner: layer.name,
        path: ["layers", id, "enabled"],
        type: "boolean",
        default: true,
      };
    },
    list: layerIds,
  },
  {
    pattern: ["layer", "*", "opacity"],
    resolve: (document, _catalog, [id = ""]) => {
      const layer = document.layers[id];
      if (layer?.kind !== "visual") return undefined;
      return {
        label: "Opacity",
        owner: layer.name,
        path: ["layers", id, "opacity"],
        type: "number",
        default: 1,
        range: { min: 0, max: 1, step: 0.01, percent: true },
      };
    },
    list: layersOfKind("visual"),
  },
  {
    pattern: ["layer", "*", "blend"],
    resolve: (document, _catalog, [id = ""]) => {
      const layer = document.layers[id];
      if (layer?.kind !== "visual") return undefined;
      return {
        label: "Blend mode",
        owner: layer.name,
        path: ["layers", id, "blendMode"],
        type: "choice",
        default: "normal",
        options: BLEND_MODES.map((mode) => ({
          value: mode,
          label: BLEND_MODE_LABELS[mode],
        })),
      };
    },
    list: layersOfKind("visual"),
  },
  {
    pattern: ["layer", "*", "mix"],
    resolve: (document, _catalog, [id = ""]) => {
      const layer = document.layers[id];
      if (layer?.kind !== "filter") return undefined;
      return {
        label: "Mix",
        owner: layer.name,
        path: ["layers", id, "mix"],
        type: "number",
        default: 1,
        range: { min: 0, max: 1, step: 0.01, percent: true },
      };
    },
    list: layersOfKind("filter"),
  },
  {
    pattern: ["layer", "*", "param", "*"],
    resolve: (document, catalog, [id = "", name = ""]) => {
      const layer = document.layers[id];
      if (layer === undefined) return undefined;
      const parameter = layerDefinition(layer, catalog)?.parameters[name];
      return parameter === undefined
        ? undefined
        : fromParameter(layer, name, parameter);
    },
    list: (document, catalog) =>
      orderedEntries(document.layers).flatMap((layer) =>
        Object.keys(layerDefinition(layer, catalog)?.parameters ?? {}).map(
          (name) => [layer.id, name],
        ),
      ),
  },
  {
    pattern: ["layer", "*", "cue", "*"],
    resolve: (document, catalog, [id = "", key = ""]) => {
      const layer = document.layers[id];
      if (layer === undefined) return undefined;
      const cue = layerDefinition(layer, catalog)?.cues?.find(
        (candidate) => candidate.key === key,
      );
      return cue === undefined
        ? undefined
        : {
            label: cue.label,
            owner: layer.name,
            path: ["layers", id, "cue", key],
            type: "trigger",
          };
    },
    list: (document, catalog) =>
      orderedEntries(document.layers).flatMap((layer) =>
        (layerDefinition(layer, catalog)?.cues ?? []).map((cue) => [
          layer.id,
          cue.key,
        ]),
      ),
  },
];

export function formatAddress(segments: readonly string[]): string {
  return segments.join("/");
}

export function resolveAddress(
  document: AddressSource,
  address: string,
  catalog: Catalog = emptyCatalog,
): ResolvedAddress | undefined {
  const segments = address.split("/");
  for (const candidate of patterns) {
    if (candidate.pattern.length !== segments.length) continue;
    const captures: string[] = [];
    let matched = true;
    for (const [index, expected] of candidate.pattern.entries()) {
      const actual = segments[index] ?? "";
      if (expected === "*") captures.push(actual);
      else if (expected !== actual) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const resolved = candidate.resolve(document, catalog, captures);
    return resolved === undefined ? undefined : { ...resolved, address };
  }
  return undefined;
}

/** Every Address currently reachable in the Document, for OSCQuery and the CLI. */
export function listAddresses(
  document: AddressSource,
  catalog: Catalog = emptyCatalog,
): readonly ResolvedAddress[] {
  const result: ResolvedAddress[] = [];
  for (const candidate of patterns) {
    for (const captures of candidate.list(document, catalog)) {
      let captureIndex = 0;
      const segments = candidate.pattern.map((segment) =>
        segment === "*" ? (captures[captureIndex++] ?? "") : segment,
      );
      const address = formatAddress(segments);
      const resolved = resolveAddress(document, address, catalog);
      if (resolved !== undefined) result.push(resolved);
    }
  }
  return result;
}

/** The Addresses of one Layer, in inspector order: its own settings, its Parameters, then its Cues. */
export function layerAddresses(
  layer: Layer,
  catalog: Catalog = emptyCatalog,
): readonly ResolvedAddress[] {
  const document = addressSource({ layers: { [layer.id]: layer } });
  const own = ["enabled", "opacity", "blend", "mix"].map((field) =>
    resolveAddress(
      document,
      formatAddress(["layer", layer.id, field]),
      catalog,
    ),
  );
  const definition = layerDefinition(layer, catalog);
  const parameters = Object.keys(definition?.parameters ?? {}).map((name) =>
    resolveAddress(
      document,
      formatAddress(["layer", layer.id, "param", name]),
      catalog,
    ),
  );
  const cues = (definition?.cues ?? []).map((cue) =>
    resolveAddress(
      document,
      formatAddress(["layer", layer.id, "cue", cue.key]),
      catalog,
    ),
  );
  return [...own, ...parameters, ...cues].filter(
    (entry): entry is ResolvedAddress => entry !== undefined,
  );
}

/** The Addresses of one Surface, in inspector order. */
export function surfaceAddresses(surface: Surface): readonly ResolvedAddress[] {
  const document = addressSource({ surfaces: { [surface.id]: surface } });
  return ["render-scale"].flatMap((field) => {
    const resolved = resolveAddress(
      document,
      formatAddress(["surface", surface.id, field]),
    );
    return resolved === undefined ? [] : [resolved];
  });
}

/** The value Address of a Controller; a Group has none. */
export function controllerAddress(
  controller: Controller,
): ResolvedAddress | undefined {
  return resolveAddress(
    addressSource({ controllers: { [controller.id]: controller } }),
    formatAddress(["controller", controller.id, "value"]),
  );
}

/**
 * Whether a Controller of `kind` can drive `resolved`: Layer Addresses only,
 * a Number Controller onto numbers and booleans, a Color Controller onto
 * colors. Choices have no scale to map onto.
 */
export function linkable(
  resolved: ResolvedAddress,
  kind: "number" | "color",
): boolean {
  if (resolved.path[0] !== "layers") return false;
  return kind === "number"
    ? resolved.type === "number" || resolved.type === "boolean"
    : resolved.type === "color";
}

/**
 * Why `value` cannot be written to `resolved`, or undefined when it can. A
 * number must be within the range and on its step grid, the same rule a
 * Parameter value is held to.
 */
export function addressValueProblem(
  resolved: ResolvedAddress,
  value: unknown,
): string | undefined {
  switch (resolved.type) {
    case "boolean":
      return typeof value === "boolean" ? undefined : "must be true or false";
    case "number":
      return numberProblem(resolved.range, value);
    case "color":
      return ColorSchema.safeParse(value).success
        ? undefined
        : "must be a color of four components from 0 to 1";
    case "choice":
      return resolved.options?.some((option) => option.value === value)
        ? undefined
        : `must be one of ${(resolved.options ?? []).map((option) => option.value).join(", ")}`;
    case "trigger":
      return value === undefined || value === null
        ? undefined
        : "is a trigger and takes no value";
  }
}

export function isValidAddressValue(
  resolved: ResolvedAddress,
  value: unknown,
): boolean {
  return addressValueProblem(resolved, value) === undefined;
}

/** Whether two Address values are the same; colors compare by component. */
export function sameAddressValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((item, index) => item === b[index]);
  return a === b;
}
