import type { ParameterSchema } from "./parameters.ts";

/**
 * The Catalog is what Layers are made of: the Visual and Filter definitions
 * a runtime knows. A definition is code, identified by a stable id the
 * document refers to; Studio picks from the Catalog and commands validate
 * against it. An id the Catalog no longer has stays in the document and
 * shows as unavailable, so a changed Catalog never invalidates a file.
 */
export const VISUAL_BACKENDS = ["canvas", "shader"] as const;
export type VisualBackend = (typeof VISUAL_BACKENDS)[number];

/** A named event a definition reacts to, triggered on a Layer during a show. */
export interface CueDefinition {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

/** A Path a Visual needs bound before it can render, by the key its code reads it under. */
export interface PathRequirement {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

interface DefinitionBase {
  readonly id: string;
  readonly name: string;
  /** One or two sentences a person reads while choosing. */
  readonly description: string;
  /**
   * For whoever composes with it, human or agent: how it reads on a Surface,
   * which Parameters interact, what it costs, what to stack it with.
   * Paragraphs of plain text; the Catalog reference is generated from the
   * rest of the definition, so this is only what code cannot say.
   */
  readonly notes?: string;
  readonly backend: VisualBackend;
  /** Sorted first when picking: a good default for most Installations. */
  readonly recommended?: boolean;
  readonly parameters: ParameterSchema;
  readonly cues?: readonly CueDefinition[];
}

export interface VisualDefinition extends DefinitionBase {
  readonly kind: "visual";
  readonly paths?: readonly PathRequirement[];
}

export interface FilterDefinition extends DefinitionBase {
  readonly kind: "filter";
}

export type Definition = VisualDefinition | FilterDefinition;

export function usesPath(definition: Definition): boolean {
  return definition.kind === "visual" && (definition.paths?.length ?? 0) > 0;
}

export function hasCues(definition: Definition): boolean {
  return (definition.cues?.length ?? 0) > 0;
}

function byName(a: Definition, b: Definition): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export class Catalog {
  readonly #visuals = new Map<string, VisualDefinition>();
  readonly #filters = new Map<string, FilterDefinition>();

  constructor({
    visuals = [],
    filters = [],
  }: {
    readonly visuals?: readonly VisualDefinition[];
    readonly filters?: readonly FilterDefinition[];
  } = {}) {
    for (const visual of visuals) {
      if (this.#visuals.has(visual.id))
        throw new Error(`Visual “${visual.id}” is in the Catalog twice.`);
      this.#visuals.set(visual.id, visual);
    }
    for (const filter of filters) {
      if (this.#filters.has(filter.id))
        throw new Error(`Filter “${filter.id}” is in the Catalog twice.`);
      this.#filters.set(filter.id, filter);
    }
  }

  visual(id: string): VisualDefinition | undefined {
    return this.#visuals.get(id);
  }

  filter(id: string): FilterDefinition | undefined {
    return this.#filters.get(id);
  }

  /** The definition a Layer of `kind` refers to by `id`. */
  definition(kind: "visual" | "filter", id: string): Definition | undefined {
    return kind === "visual" ? this.visual(id) : this.filter(id);
  }

  visuals(): readonly VisualDefinition[] {
    return [...this.#visuals.values()].sort(byName);
  }

  filters(): readonly FilterDefinition[] {
    return [...this.#filters.values()].sort(byName);
  }
}

/** A runtime with nothing to pick from; commands still validate ids against it. */
export const emptyCatalog = new Catalog();
