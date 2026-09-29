import { framedOn, type PreviewTarget } from "./preview-target";

/** How close the Preview frames what is selected, widest first. */
export const FRAMINGS = ["output", "surface", "layer"] as const;
export type Framing = (typeof FRAMINGS)[number];

export const FRAMING_LABELS: Readonly<Record<Framing, string>> = {
  output: "Output",
  surface: "Surface",
  layer: "Layer",
};

export function isFraming(candidate: unknown): candidate is Framing {
  return (FRAMINGS as readonly unknown[]).includes(candidate);
}

/**
 * What the header holds: following the selection or staying on a named
 * Output, the closest framing following may take, what is shown either way,
 * so turning following off or selecting something the Preview cannot show
 * keeps it where it is, and whether the selection is outlined.
 */
export interface PreviewChoice {
  readonly follow: boolean;
  /** The Output shown, or the one shown last while a Surface is. */
  readonly outputId: string | null;
  readonly framing: Framing;
  /** The Surface shown flat; null while an Output is shown. */
  readonly surfaceId: string | null;
  /** The Layer shown in Layer framing; null while none is. */
  readonly layerId: string | null;
  readonly outline: boolean;
}

export const DEFAULT_CHOICE: PreviewChoice = {
  follow: true,
  outputId: null,
  framing: "output",
  surfaceId: null,
  layerId: null,
  outline: false,
};

/** A choice as storage holds it: one written before a field existed lacks it. */
export type StoredChoice = Pick<PreviewChoice, "follow" | "outputId"> &
  Partial<PreviewChoice>;

export function isStoredChoice(candidate: unknown): candidate is StoredChoice {
  if (typeof candidate !== "object" || candidate === null) return false;
  const { follow, outputId, framing, surfaceId, layerId, outline } =
    candidate as Record<string, unknown>;
  const optionalId = (id: unknown): boolean =>
    id === undefined || id === null || typeof id === "string";
  return (
    typeof follow === "boolean" &&
    (outputId === null || typeof outputId === "string") &&
    (framing === undefined || isFraming(framing)) &&
    optionalId(surfaceId) &&
    optionalId(layerId) &&
    (outline === undefined || typeof outline === "boolean")
  );
}

export function storedChoice(stored: StoredChoice | undefined): PreviewChoice {
  return { ...DEFAULT_CHOICE, ...stored };
}

/**
 * `choice` remembering `target` as what is shown, and `choice` itself when
 * it already does. An Output shown while the framing is Output leaves the
 * Surface last shown flat alone, so switching the framing back returns to it.
 * A Layer is remembered while it is shown, with the Output or the Surface
 * it is shown on.
 */
export function rememberTarget(
  choice: PreviewChoice,
  target: PreviewTarget,
): PreviewChoice {
  const on = framedOn(target);
  const next = {
    ...(on.framing === "output"
      ? {
          outputId: on.outputId,
          surfaceId: choice.framing === "output" ? choice.surfaceId : null,
        }
      : { outputId: choice.outputId, surfaceId: on.surfaceId }),
    layerId: target.framing === "layer" ? target.layerId : null,
  };
  return next.outputId === choice.outputId &&
    next.surfaceId === choice.surfaceId &&
    next.layerId === choice.layerId
    ? choice
    : { ...choice, ...next };
}
