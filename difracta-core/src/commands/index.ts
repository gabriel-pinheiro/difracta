import type { CommandDefinition } from "../command/command.ts";
import { CommandRegistry } from "../command/registry.ts";
import { addressSet, addressToggle } from "./address.set.ts";
import { installationRename } from "./installation.rename.ts";
import { outputCreate } from "./output.create.ts";
import { outputRemove } from "./output.remove.ts";
import { outputRename } from "./output.rename.ts";

/** Every built-in command. Add one import line per new command file. */
export const builtInCommands: readonly CommandDefinition<never>[] = [
  installationRename,
  outputCreate,
  outputRename,
  outputRemove,
  addressSet,
  addressToggle,
] as unknown as readonly CommandDefinition<never>[];

export function createBuiltInRegistry(): CommandRegistry {
  return new CommandRegistry(builtInCommands);
}
