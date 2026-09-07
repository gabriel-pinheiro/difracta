import type { CommandDefinition } from "./command.ts";

export class CommandRegistry {
  readonly #commands = new Map<string, CommandDefinition<never>>();

  constructor(definitions: readonly CommandDefinition<never>[] = []) {
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
