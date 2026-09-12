import { emptyCatalog, type Catalog } from "../catalog/catalog.ts";
import type { CommandDefinition } from "../command/command.ts";
import { CommandRegistry } from "../command/registry.ts";
import { addressEdit } from "./address.edit.ts";
import { addressSet, addressToggle } from "./address.set.ts";
import { addressTrigger } from "./address.trigger.ts";
import { calibrationExit, calibrationSet } from "./calibration.ts";
import { controllerCreate } from "./controller.create.ts";
import { controllerDuplicate } from "./controller.duplicate.ts";
import { controllerMove } from "./controller.move.ts";
import { controllerRemove } from "./controller.remove.ts";
import { controllerRename } from "./controller.rename.ts";
import { controllerUngroup } from "./controller.ungroup.ts";
import { entityMove } from "./entity.move.ts";
import { layerCreate } from "./layer.create.ts";
import { layerDuplicate } from "./layer.duplicate.ts";
import { layerGroup, layerUngroup } from "./layer.group.ts";
import { layerFilter, layerVisual } from "./layer.pick.ts";
import { layerMove } from "./layer.move.ts";
import { layerRemove } from "./layer.remove.ts";
import { layerRename } from "./layer.rename.ts";
import { layerReset } from "./layer.reset.ts";
import { layerUpdate } from "./layer.update.ts";
import { linkCreate } from "./link.create.ts";
import { linkRemove } from "./link.remove.ts";
import { linkUpdate } from "./link.update.ts";
import { macroActionMove } from "./macro.action.move.ts";
import { macroActionRemove } from "./macro.action.remove.ts";
import { macroActionUpdate } from "./macro.action.update.ts";
import { macroActionsAdd } from "./macro.actions.add.ts";
import { macroCreate } from "./macro.create.ts";
import { macroDuplicate } from "./macro.duplicate.ts";
import { macroMove } from "./macro.move.ts";
import { macroRemove } from "./macro.remove.ts";
import { macroRename } from "./macro.rename.ts";
import { macroUngroup } from "./macro.ungroup.ts";
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
import { surfaceSize } from "./surface.size.ts";

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
  surfaceSize,
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
  layerVisual,
  layerFilter,
  layerReset,
  layerMove,
  layerDuplicate,
  layerGroup,
  layerUngroup,
  layerRemove,
  controllerCreate,
  controllerRename,
  controllerMove,
  controllerDuplicate,
  controllerUngroup,
  controllerRemove,
  linkCreate,
  linkUpdate,
  linkRemove,
  macroCreate,
  macroRename,
  macroMove,
  macroUngroup,
  macroDuplicate,
  macroRemove,
  macroActionsAdd,
  macroActionUpdate,
  macroActionRemove,
  macroActionMove,
  addressEdit,
  addressSet,
  addressToggle,
  addressTrigger,
  calibrationSet,
  calibrationExit,
  entityMove,
] as unknown as readonly CommandDefinition<never>[];

/** Every built-in command over `catalog`; a runtime passes the Catalog it ships. */
export function createBuiltInRegistry(
  catalog: Catalog = emptyCatalog,
): CommandRegistry {
  return new CommandRegistry(builtInCommands, catalog);
}
