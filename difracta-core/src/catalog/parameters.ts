import { z } from "zod";

import type { MediaType } from "../document/media.ts";
import { settings } from "../settings.ts";

/**
 * A Parameter is one adjustable value a Visual or Filter declares. The
 * declaration (kind, default, bounds, label) lives in the definition; the
 * value lives on the Layer using it, keyed by the Parameter's name. Studio
 * generates a Control from the declaration.
 */
export const ColorSchema = z
  .tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ])
  .readonly();
/** Red, green, blue and alpha, each 0 to 1. */
export type Color = z.infer<typeof ColorSchema>;

export const ParameterValueSchema = z.union([
  z.number(),
  z.string(),
  z.boolean(),
  ColorSchema,
]);
export type ParameterValue = z.infer<typeof ParameterValueSchema>;

export const ParameterValuesSchema = z.record(
  z.string().min(1),
  ParameterValueSchema,
);
export type ParameterValues = Readonly<Record<string, ParameterValue>>;

interface ParameterBase {
  readonly label: string;
  readonly description?: string;
}

/** What a number is checked against: a Parameter's bounds or an Address's range. */
export interface NumberBounds {
  readonly min: number;
  readonly max: number;
  /** Values sit on `min + k·step`; absent, any value within the bounds goes. */
  readonly step?: number;
}

export interface NumberParameter extends ParameterBase, NumberBounds {
  readonly kind: "number";
  readonly default: number;
  /** Shown after the value, such as "px" or "Hz". */
  readonly unit?: string;
  /** Shown as 0 to 100 with a percent sign; the value itself stays 0 to 1. */
  readonly percent?: boolean;
}

export interface ColorParameter extends ParameterBase {
  readonly kind: "color";
  readonly default: Color;
}

export interface ChoiceParameter extends ParameterBase {
  readonly kind: "choice";
  readonly default: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
  }[];
}

export interface BooleanParameter extends ParameterBase {
  readonly kind: "boolean";
  readonly default: boolean;
}

/**
 * A Media item to show, by id, or `""` for none; only files of the accepted
 * type fit. Its value is a reference into the Installation, so the
 * Address is not linkable and removing the item clears the value.
 */
export interface MediaParameter extends ParameterBase {
  readonly kind: "media";
  readonly accepts: MediaType;
  readonly default: "";
}

export type ParameterDefinition =
  | NumberParameter
  | ColorParameter
  | ChoiceParameter
  | BooleanParameter
  | MediaParameter;

export type ParameterKind = ParameterDefinition["kind"];

/** Parameters by name, in the order the inspector shows them. */
export type ParameterSchema = Readonly<Record<string, ParameterDefinition>>;

export function defaultParameterValues(
  schema: ParameterSchema,
): ParameterValues {
  return Object.fromEntries(
    Object.entries(schema).map(([name, definition]) => [
      name,
      definition.default,
    ]),
  );
}

/**
 * Why `value` is not a number acceptable within `bounds`, or undefined when
 * it is: finite, between min and max, and on the step grid anchored at min.
 * The one rule behind every direct write of a number, whether it arrives as
 * a Parameter value or through an Address; a Link's mapping snaps at read
 * time instead. Float noise within `settings.numbers.stepTolerance` of a
 * grid point counts as on it.
 */
export function numberProblem(
  bounds: NumberBounds | undefined,
  value: unknown,
): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value))
    return "must be a number";
  if (bounds === undefined) return undefined;
  if (value < bounds.min || value > bounds.max)
    return `must be between ${bounds.min} and ${bounds.max}`;
  const step = bounds.step;
  if (step === undefined || step <= 0) return undefined;
  const steps = (value - bounds.min) / step;
  return Math.abs(steps - Math.round(steps)) <= settings.numbers.stepTolerance
    ? undefined
    : `must be a multiple of ${step} from ${bounds.min} (got ${value})`;
}

/** Why `value` is not acceptable for `definition`, or undefined when it is. */
export function validateParameterValue(
  definition: ParameterDefinition,
  value: ParameterValue,
): string | undefined {
  switch (definition.kind) {
    case "number":
      return numberProblem(definition, value);
    case "color":
      return ColorSchema.safeParse(value).success
        ? undefined
        : "must be a color of four components from 0 to 1";
    case "choice":
      return definition.options.some((option) => option.value === value)
        ? undefined
        : `must be one of ${definition.options.map((option) => option.value).join(", ")}`;
    case "boolean":
      return typeof value === "boolean" ? undefined : "must be true or false";
    case "media":
      return typeof value === "string"
        ? undefined
        : `must be the id of ${definition.accepts === "image" ? "an image" : "a video"} Media item, or "" for none`;
  }
}

/** "the declared ones are count, speed", or "none is declared". */
function declaredKeys(schema: ParameterSchema): string {
  const keys = Object.keys(schema);
  return keys.length === 0
    ? "none is declared"
    : `the declared ones are ${keys.join(", ")}`;
}

/** The sentence that ends a message about a definition's Parameters or Cues: where to read them all. */
export function catalogHint(definitionId: string): string {
  return `See \`difracta catalog ${definitionId}\`.`;
}

/**
 * Checks a complete set of values against a schema: every declared Parameter
 * present and valid, nothing undeclared. Returns the first problem.
 */
export function validateParameterValues(
  schema: ParameterSchema,
  values: ParameterValues,
): string | undefined {
  for (const name of Object.keys(values)) {
    if (!(name in schema))
      return `Parameter “${name}” is not declared; ${declaredKeys(schema)}.`;
  }
  for (const [name, definition] of Object.entries(schema)) {
    const value = values[name];
    if (value === undefined) return `Parameter “${name}” is missing.`;
    const problem = validateParameterValue(definition, value);
    if (problem !== undefined) return `Parameter “${name}” ${problem}.`;
  }
  return undefined;
}
