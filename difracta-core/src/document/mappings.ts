import type {
  Document,
  Output,
  Surface,
  SurfaceMapping,
  Table,
} from "./document.ts";
import type { Quad } from "./geometry.ts";
import { orderedEntries } from "./order.ts";
import { followedQuad } from "./slices.ts";

/** Whether the Surface renders on the Output. */
export function isEnabledOn(surface: Surface, outputId: string): boolean {
  return surface.mappings[outputId]?.enabled === true;
}

/**
 * Where the Surface lands on the Output, undefined while it is not on it:
 * its corners, or, when the mapping follows a Slice or the whole frame,
 * that rectangle of the Projection Frame.
 */
export function enabledCorners(
  document: Pick<Document, "outputs" | "slices">,
  surface: Surface,
  outputId: string,
): Quad | undefined {
  const mapping = surface.mappings[outputId];
  return mapping?.enabled === true
    ? resolvedCorners(document, mapping, outputId)
    : undefined;
}

/**
 * The quad a mapping puts Surface Space on, enabled or not: its corners, or
 * what it follows. A follow the Output can no longer resolve falls back to
 * the corners.
 */
export function resolvedCorners(
  document: Pick<Document, "outputs" | "slices">,
  mapping: SurfaceMapping,
  outputId: string,
): Quad {
  if (mapping.follow === undefined) return mapping.corners;
  const output = document.outputs[outputId];
  if (output === undefined) return mapping.corners;
  return (
    followedQuad(output, document.slices, mapping.follow) ?? mapping.corners
  );
}

/** The Outputs the Surface renders on, in Output order. */
export function enabledOutputs(
  surface: Surface,
  outputs: Table<Output>,
): readonly Output[] {
  return orderedEntries(outputs).filter((output) =>
    isEnabledOn(surface, output.id),
  );
}

export type PickedOutput =
  | { readonly ok: true; readonly outputId: string }
  | { readonly ok: false; readonly error: string };

/**
 * The Output a command about one mapping of the Surface acts on: the one
 * named, which the Surface must be on, or the only one it is on. With
 * several and none named it is refused by name, never guessed.
 */
export function pickOutput(
  document: Document,
  surface: Surface,
  requested: string | undefined,
): PickedOutput {
  const enabled = enabledOutputs(surface, document.outputs);
  if (requested !== undefined) {
    const output = document.outputs[requested];
    if (output === undefined)
      return { ok: false, error: `Output “${requested}” does not exist.` };
    if (!isEnabledOn(surface, requested))
      return {
        ok: false,
        error: `Surface “${surface.name}” is not on Output “${output.name}”.`,
      };
    return { ok: true, outputId: requested };
  }
  const [only, ...others] = enabled;
  if (only === undefined)
    return {
      ok: false,
      error: `Surface “${surface.name}” has no Output to calibrate on.`,
    };
  if (others.length > 0)
    return {
      ok: false,
      error: `Surface “${surface.name}” is on ${enabled
        .map((output) => `“${output.name}” (${output.id})`)
        .join(", ")}; name one as the output.`,
    };
  return { ok: true, outputId: only.id };
}
