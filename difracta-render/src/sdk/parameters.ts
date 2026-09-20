import {
  defaultParameterValues,
  type BooleanParameter,
  type ChoiceParameter,
  type Color,
  type ColorParameter,
  type NumberParameter,
  type ParameterDefinition,
  type ParameterSchema,
  type ParameterValues,
} from "@difracta/core";

/** The value type a Parameter declaration produces, so a Visual reads `params.speed` as a number. */
export type ParameterValueOf<P extends ParameterDefinition> =
  P extends NumberParameter
    ? number
    : P extends BooleanParameter
      ? boolean
      : P extends ColorParameter
        ? Color
        : P extends ChoiceParameter
          ? P["options"][number]["value"]
          : never;

export type ParameterValuesOf<S extends ParameterSchema> = {
  readonly [Name in keyof S]: ParameterValueOf<S[Name]>;
};

/**
 * A Layer's values completed with the schema's defaults, typed for the
 * Visual. A file saved before a Visual gained a Parameter has no value for
 * it, and the Visual must never see a hole.
 */
export function resolveParameters<S extends ParameterSchema>(
  schema: S,
  values: ParameterValues,
): ParameterValuesOf<S> {
  return {
    ...defaultParameterValues(schema),
    ...values,
  } as ParameterValuesOf<S>;
}

/**
 * The Parameter every event-driven Visual declares the same way: how many
 * times per second, on average, it fires on its own. Zero is off.
 */
export function automaticRate(
  overrides: Partial<
    Pick<NumberParameter, "default" | "max" | "step" | "description">
  > = {},
): NumberParameter {
  return {
    kind: "number",
    label: "Automatic Rate",
    default: 0.25,
    min: 0,
    max: 2,
    step: 0.05,
    unit: "/s",
    ...overrides,
  };
}

/**
 * The Parameter a costly shader Visual declares to render below its
 * Surface's resolution, always with the same label and range; its update
 * returns the value as `resolution`. Key it `renderResolution`: a Parameter
 * keyed `resolution` would clash with the engine's `u_resolution`.
 */
export function renderResolution(
  overrides: Partial<Pick<NumberParameter, "default" | "description">> = {},
): NumberParameter {
  return {
    kind: "number",
    label: "Resolution",
    default: 1,
    min: 0.25,
    max: 1,
    step: 0.05,
    percent: true,
    description:
      "The share of the Surface's pixels it renders at; lower is faster and softer.",
    ...overrides,
  };
}
