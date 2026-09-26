import type { MediaType } from "../document/media.ts";
import type { ParameterSchema } from "./parameters.ts";

/**
 * The Catalog is what a runtime knows it can show: the Visual and Filter
 * definitions Layers are made of, and the Bundled Media, the clips Difracta
 * ships, which a Media item of kind `bundled` refers to. A definition is
 * identified by a stable id the document refers to; Studio picks from the
 * Catalog and commands validate against it. An id the Catalog no longer has
 * stays in the document and shows as unavailable, so a changed Catalog
 * never invalidates a file. Ids are unique across the three kinds, since
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
 * One entry of the Bundled Media: an image or video Difracta ships, read
 * from the bundle's manifest. It has no backend, Parameters or Cues; a
 * Media item of kind `bundled` shows it through Image or Video. `file` is
 * relative to the bundle's folder.
 */
export interface MediaDefinition {
  readonly kind: "media";
  readonly id: string;
  readonly name: string;
  /** One sentence a person reads while choosing. */
  readonly description: string;
  /** How it reads on a Surface, what to stack it with, when to use it. */
  readonly notes?: string;
  /** Sorted first when picking: a good default. */
  readonly recommended?: boolean;
  readonly type: MediaType;
  /** Loops without a visible seam. */
  readonly loop?: boolean;
  /** Works as a one-shot on a beat. */
  readonly hit?: boolean;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  /** In seconds; videos only. */
  readonly duration?: number;
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
  readonly #media = new Map<string, MediaDefinition>();

  constructor({
    visuals = [],
    filters = [],
    media = [],
  }: {
    readonly visuals?: readonly VisualDefinition[];
    readonly filters?: readonly FilterDefinition[];
    readonly media?: readonly MediaDefinition[];
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
    for (const entry of media) {
      claim(entry.id, "Bundled Media entry");
      this.#media.set(entry.id, entry);
    }
  }

  visual(id: string): VisualDefinition | undefined {
    return this.#visuals.get(id);
  }

  filter(id: string): FilterDefinition | undefined {
    return this.#filters.get(id);
  }

  /** The Bundled Media entry `id` names. */
  mediaEntry(id: string): MediaDefinition | undefined {
    return this.#media.get(id);
  }

  /** The definition a Layer of `kind`, or a bundled Media item, refers to by `id`. */
  definition(kind: "media", id: string): MediaDefinition | undefined;
  definition(kind: "visual" | "filter", id: string): Definition | undefined;
  definition(
    kind: "visual" | "filter" | "media",
    id: string,
  ): Definition | MediaDefinition | undefined {
    if (kind === "media") return this.mediaEntry(id);
    return kind === "visual" ? this.visual(id) : this.filter(id);
  }

  visuals(): readonly VisualDefinition[] {
    return [...this.#visuals.values()].sort(byName);
  }

  filters(): readonly FilterDefinition[] {
    return [...this.#filters.values()].sort(byName);
  }

  /** The Bundled Media, by name. */
  media(): readonly MediaDefinition[] {
    return [...this.#media.values()].sort(byName);
  }
}

/** A runtime with nothing to pick from; commands still validate ids against it. */
export const emptyCatalog = new Catalog();
