import { z } from "zod";

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

export interface NumberParameter extends ParameterBase {
  readonly kind: "number";
  readonly default: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
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

export type ParameterDefinition =
  NumberParameter | ColorParameter | ChoiceParameter | BooleanParameter;

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

/** Why `value` is not acceptable for `definition`, or undefined when it is. */
export function validateParameterValue(
  definition: ParameterDefinition,
  value: ParameterValue,
): string | undefined {
  switch (definition.kind) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value))
        return "must be a number";
      if (value < definition.min || value > definition.max)
        return `must be between ${definition.min} and ${definition.max}`;
      return undefined;
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
  }
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
    if (!(name in schema)) return `Parameter “${name}” is not declared.`;
  }
  for (const [name, definition] of Object.entries(schema)) {
    const value = values[name];
    if (value === undefined) return `Parameter “${name}” is missing.`;
    const problem = validateParameterValue(definition, value);
    if (problem !== undefined) return `Parameter “${name}” ${problem}.`;
  }
  return undefined;
}
