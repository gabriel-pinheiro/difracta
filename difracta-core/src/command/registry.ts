import { emptyCatalog, type Catalog } from "../catalog/catalog.ts";
import type { CommandDefinition } from "./command.ts";

export class CommandRegistry {
  readonly #commands = new Map<string, CommandDefinition<never>>();
  readonly catalog: Catalog;

  constructor(
    definitions: readonly CommandDefinition<never>[] = [],
    catalog: Catalog = emptyCatalog,
  ) {
    this.catalog = catalog;
    for (const definition of definitions) this.register(definition);
  }

  register(definition: CommandDefinition<never>): void {
    if (this.#commands.has(definition.name)) {
      throw new Error(`Command “${definition.name}” is already registered.`);
    }
    this.#commands.set(definition.name, definition);
  }

  get(name: string): CommandDefinition<never> | undefined {
    return this.#commands.get(name);
  }

  list(): readonly CommandDefinition<never>[] {
    return [...this.#commands.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
}
