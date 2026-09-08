import type { CommandDefinition } from "../command/command.ts";
import { CommandRegistry } from "../command/registry.ts";
import { addressSet, addressToggle } from "./address.set.ts";
import { entityMove } from "./entity.move.ts";
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
  addressSet,
  addressToggle,
  entityMove,
] as unknown as readonly CommandDefinition<never>[];

export function createBuiltInRegistry(): CommandRegistry {
  return new CommandRegistry(builtInCommands);
}
