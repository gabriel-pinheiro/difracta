import { executeCommand } from "../command/execute.ts";
import type { CommandRegistry } from "../command/registry.ts";
import { generateId } from "../ids.ts";
import { emptyDocument, type Document } from "./document.ts";

/** The Visual a new Installation's first Layer shows. */
export const STARTER_VISUAL = "zoom-rush";

/**
 * A new Installation that shows something as soon as its Output opens: one
 * Output, a full-frame Surface on it, one Scene with one Visual Layer
 * targeting that Surface and showing `STARTER_VISUAL` at its default
 * Parameters. It is built by running the commands, so it follows their
 * defaults (a Surface lands on the first Output, the first Scene is
 * active, a Layer targets the first Surface and takes its Visual's name).
 * Nothing enters undo history; the caller starts it clean. The registry's
 * Catalog must hold `STARTER_VISUAL`: a rejected step throws.
 */
export function starterDocument(
  name: string,
  registry: CommandRegistry,
): Document {
  const sceneId = generateId("scene");
  const layerId = generateId("layer");
  const steps: readonly (readonly [string, unknown])[] = [
    ["output.create", { name: "Output 1" }],
    ["surface.create", { name: "Full Frame" }],
    ["scene.create", { id: sceneId, name: "Scene 1" }],
    ["layer.create", { id: layerId, kind: "visual", sceneId }],
    ["layer.visual", { layerId, visual: STARTER_VISUAL }],
  ];
  let document = emptyDocument(name);
  for (const [command, payload] of steps) {
    const result = executeCommand(registry, document, command, payload);
    if (!result.ok)
      throw new Error(
        `The starter Installation failed at “${command}”: ${result.error}`,
      );
    document = result.document;
  }
  return document;
}
