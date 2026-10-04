import type { ParameterSchema } from "./parameters.ts";

/**
 * The Catalog is what a runtime knows it can show: the Visual and Filter
 * definitions Layers are made of and the Bundled Fonts its text Visuals
 * draw with. A definition is
 * identified by a stable id the document refers to; Studio picks from the
 * Catalog and commands validate against it. An id the Catalog no longer has
 * stays in the document and shows as unavailable, so a changed Catalog
 * never invalidates a file. Ids are unique across the kinds, since
 * they name thumbnails in one folder.
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

/**
 * One Bundled Font: a typeface Difracta ships, so text looks the same on
 * every Output. `files` are relative to the fonts' folder, the first the
 * face most text needs and the rest its further character ranges.
 */
export interface FontDefinition {
  readonly kind: "font";
  readonly id: string;
  readonly name: string;
  /** One sentence a person reads while choosing. */
  readonly description: string;
  readonly files: readonly string[];
}

export function usesPath(definition: Definition): boolean {
  return definition.kind === "visual" && (definition.paths?.length ?? 0) > 0;
}

export function hasCues(definition: Definition): boolean {
  return (definition.cues?.length ?? 0) > 0;
}

function byName(
  a: { readonly name: string },
  b: { readonly name: string },
): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

export class Catalog {
  readonly #visuals = new Map<string, VisualDefinition>();
  readonly #filters = new Map<string, FilterDefinition>();
  readonly #fonts = new Map<string, FontDefinition>();

  constructor({
    visuals = [],
    filters = [],
    fonts = [],
  }: {
    readonly visuals?: readonly VisualDefinition[];
    readonly filters?: readonly FilterDefinition[];
    readonly fonts?: readonly FontDefinition[];
  } = {}) {
    const seen = new Map<string, string>();
    const claim = (id: string, label: string): void => {
      const previous = seen.get(id);
      if (previous !== undefined)
        throw new Error(
          previous === label
            ? `${label} “${id}” is in the Catalog twice.`
            : `${label} “${id}” has the id of a ${previous} in the Catalog.`,
        );
      seen.set(id, label);
    };
    for (const visual of visuals) {
      claim(visual.id, "Visual");
      this.#visuals.set(visual.id, visual);
    }
    for (const filter of filters) {
      claim(filter.id, "Filter");
      this.#filters.set(filter.id, filter);
    }
    for (const font of fonts) {
      claim(font.id, "Bundled Font");
      this.#fonts.set(font.id, font);
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

  /** The Bundled Font `id` names. */
  font(id: string): FontDefinition | undefined {
    return this.#fonts.get(id);
  }

  /** The Bundled Fonts, in the order they were given: the one every other falls back to first. */
  fonts(): readonly FontDefinition[] {
    return [...this.#fonts.values()];
  }
}

/** A runtime with nothing to pick from; commands still validate ids against it. */
export const emptyCatalog = new Catalog();
