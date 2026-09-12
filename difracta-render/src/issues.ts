import type { FilterLayer, VisualLayer } from "@difracta/core";

import type { FilterStepReport } from "./filter-players.ts";
import type { StepReport } from "./layer-players.ts";

/**
 * A Layer that draws nothing because its Visual or Filter cannot run on
 * this Output: an instance threw, or a fragment failed to compile. The
 * compositor reports the issues of every frame so the Output can send them
 * with its telemetry and Studio can show them next to the Layer.
 */
export interface RenderIssue {
  readonly layerId: string;
  /** The Visual or Filter definition id. */
  readonly definition: string;
  readonly message: string;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Logs a failed instance once and returns the issue to report on every later frame. */
export function reportIssue(
  kind: "Visual" | "Filter",
  layer: VisualLayer | FilterLayer,
  definition: string,
  error: Error,
): RenderIssue {
  console.error(
    `${kind} “${definition}” on Layer “${layer.name}” (${layer.id}) failed and is stopped:`,
    error,
  );
  return { layerId: layer.id, definition, message: errorMessage(error) };
}

/**
 * The issues of one frame: the instances that failed, plus the Layers whose
 * program did not compile, looked up by definition id since programs are
 * compiled once per Visual or Filter and shared by their Layers.
 */
export function frameIssues(
  step: Pick<StepReport, "frames" | "issues">,
  chain: Pick<FilterStepReport, "passes" | "issues">,
  visualFailure: (id: string) => string | undefined,
  filterFailure: (id: string) => string | undefined,
): readonly RenderIssue[] {
  const issues = [...step.issues, ...chain.issues];
  for (const frame of step.frames) {
    if (frame.kind !== "shader") continue;
    const message = visualFailure(frame.visual.id);
    if (message !== undefined)
      issues.push({
        layerId: frame.draw.layer.id,
        definition: frame.visual.id,
        message,
      });
  }
  for (const pass of chain.passes) {
    const message = filterFailure(pass.filter.id);
    if (message !== undefined)
      issues.push({
        layerId: pass.draw.layer.id,
        definition: pass.filter.id,
        message,
      });
  }
  return issues;
}
