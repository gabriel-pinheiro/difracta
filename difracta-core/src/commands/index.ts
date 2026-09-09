import type { CommandDefinition } from "../command/command.ts";
import { CommandRegistry } from "../command/registry.ts";
import { addressSet, addressToggle } from "./address.set.ts";
import { calibrationExit, calibrationSet } from "./calibration.ts";
import { entityMove } from "./entity.move.ts";
import { layerCreate } from "./layer.create.ts";
import { layerDuplicate } from "./layer.duplicate.ts";
import { layerGroup, layerUngroup } from "./layer.group.ts";
import { layerMove } from "./layer.move.ts";
import { layerRemove } from "./layer.remove.ts";
import { layerRename } from "./layer.rename.ts";
import { layerUpdate } from "./layer.update.ts";
import { installationRename } from "./installation.rename.ts";
import { maskCreate } from "./mask.create.ts";
import {
  maskPointAdd,
  maskPointNudge,
  maskPointRemove,
  maskPointSet,
} from "./mask.point.ts";
import { maskRemove } from "./mask.remove.ts";
import { maskRename } from "./mask.rename.ts";
import { maskUpdate } from "./mask.update.ts";
import { outputCreate } from "./output.create.ts";
import { outputRemove } from "./output.remove.ts";
import { outputRename } from "./output.rename.ts";
import { outputUpdate } from "./output.update.ts";
import { sceneCreate } from "./scene.create.ts";
import { sceneDuplicate } from "./scene.duplicate.ts";
import { scenePlay } from "./scene.play.ts";
import { sceneRemove } from "./scene.remove.ts";
import { sceneRename } from "./scene.rename.ts";
import { surfaceAssign } from "./surface.assign.ts";
import { surfaceCornerNudge, surfaceCornerSet } from "./surface.corner.ts";
import { surfaceCreate } from "./surface.create.ts";
import { surfaceRemove } from "./surface.remove.ts";
import { surfaceRename } from "./surface.rename.ts";

/** Every built-in command. Add one import line per new command file. */
export const builtInCommands: readonly CommandDefinition<never>[] = [
  installationRename,
  outputCreate,
  outputRename,
  outputUpdate,
  outputRemove,
  surfaceCreate,
  surfaceRename,
  surfaceAssign,
  surfaceCornerSet,
  surfaceCornerNudge,
  surfaceRemove,
  maskCreate,
  maskRename,
  maskUpdate,
  maskPointSet,
  maskPointNudge,
  maskPointAdd,
  maskPointRemove,
  maskRemove,
  sceneCreate,
  sceneRename,
  sceneDuplicate,
  scenePlay,
  sceneRemove,
  layerCreate,
  layerRename,
  layerUpdate,
  layerMove,
  layerDuplicate,
  layerGroup,
  layerUngroup,
  layerRemove,
  addressSet,
  addressToggle,
  calibrationSet,
  calibrationExit,
  entityMove,
] as unknown as readonly CommandDefinition<never>[];

export function createBuiltInRegistry(): CommandRegistry {
  return new CommandRegistry(builtInCommands);
}
