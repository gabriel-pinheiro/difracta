import { describe, expect, it } from "vitest";

import {
  defaultParameterValues,
  numberProblem,
  validateParameterValues,
  type ParameterSchema,
} from "./parameters.ts";

const schema: ParameterSchema = {
  speed: { kind: "number", label: "Speed", default: 1, min: 0, max: 4 },
  tint: { kind: "color", label: "Tint", default: [1, 0.5, 0, 1] },
  shape: {
    kind: "choice",
    label: "Shape",
    default: "dot",
    options: [
      { value: "dot", label: "Dot" },
      { value: "ring", label: "Ring" },
    ],
  },
  mirrored: { kind: "boolean", label: "Mirrored", default: false },
};

describe("parameters", () => {
  it("takes every default", () => {
    expect(defaultParameterValues(schema)).toEqual({
      speed: 1,
      tint: [1, 0.5, 0, 1],
      shape: "dot",
      mirrored: false,
    });
  });

  it("accepts a complete valid set and names the first problem otherwise", () => {
    const values = defaultParameterValues(schema);
    expect(validateParameterValues(schema, values)).toBeUndefined();
    expect(validateParameterValues(schema, { ...values, speed: 9 })).toBe(
      "Parameter “speed” must be between 0 and 4.",
    );
    expect(validateParameterValues(schema, { ...values, shape: "star" })).toBe(
      "Parameter “shape” must be one of dot, ring.",
    );
    expect(
      validateParameterValues(schema, { ...values, tint: [1, 2, 0, 1] }),
    ).toBe("Parameter “tint” must be a color of four components from 0 to 1.");
    expect(validateParameterValues(schema, { ...values, mirrored: 1 })).toBe(
      "Parameter “mirrored” must be true or false.",
    );
    expect(validateParameterValues(schema, { ...values, extra: 1 })).toBe(
      "Parameter “extra” is not declared.",
    );
    const { speed: _speed, ...missing } = values;
    expect(validateParameterValues(schema, missing)).toBe(
      "Parameter “speed” is missing.",
    );
  });

  it("holds a stepped number to its grid from the minimum, within float noise", () => {
    const stepped: ParameterSchema = {
      rate: {
        kind: "number",
        label: "Rate",
        default: 2.5,
        min: 0.1,
        max: 20,
        step: 0.1,
      },
    };
    expect(validateParameterValues(stepped, { rate: 0.37 })).toBe(
      "Parameter “rate” must be a multiple of 0.1 from 0.1 (got 0.37).",
    );
    expect(validateParameterValues(stepped, { rate: 2.5 })).toBeUndefined();
    expect(validateParameterValues(stepped, { rate: 20 })).toBeUndefined();
    // 0.1 + 0.2 is 0.30000000000000004: a grid point with float noise.
    expect(
      validateParameterValues(stepped, { rate: 0.1 + 0.2 }),
    ).toBeUndefined();
    expect(validateParameterValues(stepped, { rate: 21 })).toBe(
      "Parameter “rate” must be between 0.1 and 20.",
    );
    // Without a step any value in the range goes.
    expect(
      validateParameterValues(schema, {
        ...defaultParameterValues(schema),
        speed: 0.37,
      }),
    ).toBeUndefined();

    expect(
      numberProblem({ min: 0, max: 2000, step: 10 }, 1000),
    ).toBeUndefined();
    expect(numberProblem({ min: 0, max: 2000, step: 10 }, 1005)).toBe(
      "must be a multiple of 10 from 0 (got 1005)",
    );
    expect(numberProblem(undefined, 1005)).toBeUndefined();
    expect(numberProblem(undefined, Number.NaN)).toBe("must be a number");
  });
});
