import { describe, expect, it } from "vitest";

import {
  DEFAULT_CHOICE,
  isStoredChoice,
  rememberTarget,
  storedChoice,
  type PreviewChoice,
} from "./preview-choice";

describe("isStoredChoice", () => {
  it("accepts a choice written before framing and outlines existed", () => {
    const old = { follow: false, outputId: "a" };
    expect(isStoredChoice(old)).toBe(true);
    expect(storedChoice(old)).toEqual({
      follow: false,
      outputId: "a",
      framing: "output",
      surfaceId: null,
      layerId: null,
      outline: false,
    });
  });

  it("accepts a whole choice and keeps it", () => {
    const choice: PreviewChoice = {
      follow: true,
      outputId: null,
      framing: "layer",
      surfaceId: "wall",
      layerId: "glow",
      outline: true,
    };
    expect(isStoredChoice(choice)).toBe(true);
    expect(storedChoice(choice)).toEqual(choice);
  });

  it("refuses anything else", () => {
    expect(isStoredChoice(null)).toBe(false);
    expect(isStoredChoice({ follow: true })).toBe(false);
    expect(isStoredChoice({ follow: true, outputId: 3 })).toBe(false);
    expect(
      isStoredChoice({ follow: true, outputId: null, framing: "region" }),
    ).toBe(false);
    expect(
      isStoredChoice({ follow: true, outputId: null, outline: "yes" }),
    ).toBe(false);
  });

  it("starts from the default with nothing stored", () => {
    expect(storedChoice(undefined)).toEqual(DEFAULT_CHOICE);
  });
});

describe("rememberTarget", () => {
  const choice: PreviewChoice = {
    ...DEFAULT_CHOICE,
    outputId: "a",
    framing: "surface",
    surfaceId: "wall",
  };

  it("is the choice itself when it already remembers the target", () => {
    expect(
      rememberTarget(choice, {
        framing: "surface",
        surfaceId: "wall",
        quadOutputId: "b",
        sceneId: "finale",
      }),
    ).toBe(choice);
  });

  it("remembers a Surface shown flat and keeps the Output shown last", () => {
    expect(
      rememberTarget(choice, {
        framing: "surface",
        surfaceId: "floor",
        quadOutputId: "b",
        sceneId: null,
      }),
    ).toEqual({ ...choice, surfaceId: "floor" });
  });

  it("forgets the Surface for an Output shown where a Surface could be", () => {
    expect(
      rememberTarget(choice, {
        framing: "output",
        outputId: "b",
        sceneId: null,
      }),
    ).toEqual({ ...choice, outputId: "b", surfaceId: null });
  });

  it("remembers a Layer shown, with what it is shown on, until another target", () => {
    const layered = { ...choice, framing: "layer" } as const;
    const shown = rememberTarget(layered, {
      framing: "layer",
      layerId: "blur",
      on: { framing: "output", outputId: "b", sceneId: null },
    });
    expect(shown).toEqual({
      ...layered,
      outputId: "b",
      surfaceId: null,
      layerId: "blur",
    });
    expect(
      rememberTarget(shown, {
        framing: "surface",
        surfaceId: "wall",
        quadOutputId: "b",
        sceneId: null,
      }),
    ).toEqual({ ...shown, surfaceId: "wall", layerId: null });
  });

  it("keeps the Surface while the framing is Output", () => {
    expect(
      rememberTarget(
        { ...choice, framing: "output" },
        { framing: "output", outputId: "b", sceneId: null },
      ),
    ).toEqual({ ...choice, framing: "output", outputId: "b" });
  });
});
