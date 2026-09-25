import type { DocumentView } from "@difracta/client";
import type { Document } from "@difracta/core";
import type { ComponentType } from "react";

import { controllerEntity } from "./controller/controller-entity";
import { layerEntity } from "./layer/layer-entity";
import { macroEntity } from "./macro/macro-entity";
import { maskEntity } from "./mask/mask-entity";
import { mediaEntity } from "./media/media-entity";
import { outputEntity } from "./output/output-entity";
import { pathEntity } from "./path/path-entity";
import { sceneEntity } from "./scene/scene-entity";
import { surfaceEntity } from "./surface/surface-entity";

/**
 * How Remove (the Delete key, Edit ▸ Remove) takes one entity of a kind away:
 * the same command its row's context menu runs.
 */
export interface Removal {
  /** Singular, as in "Removed Scene “Intro”". */
  readonly noun: string;
  readonly command: string;
  readonly payload: (id: string) => unknown;
  /** The entity, or `undefined` once it is gone. */
  readonly find: (
    document: Document,
    id: string,
  ) => { readonly name: string } | undefined;
  /** Why this one may not go now, worded as its context menu words it. */
  readonly refusal?: (document: Document, id: string) => string | undefined;
}

/**
 * What one entity kind contributes to Studio: its navigator section, its
 * inspector and how it is removed. Each kind lives in its own folder under `entities/`; adding a
 * kind is one folder plus one line in `entities` below.
 */
export interface EntityModule {
  /** Section label in the navigator, plural. */
  readonly label: string;
  /** Top-level kinds have a section; child kinds render rows under their parent instead. */
  readonly Section?: ComponentType<{ readonly view: DocumentView }>;
  readonly Inspector: ComponentType<{
    readonly view: DocumentView;
    readonly id: string;
  }>;
  readonly removal: Removal;
}

export const entities = {
  output: outputEntity,
  surface: surfaceEntity,
  mask: maskEntity,
  path: pathEntity,
  media: mediaEntity,
  scene: sceneEntity,
  layer: layerEntity,
  controller: controllerEntity,
  macro: macroEntity,
} as const satisfies Record<string, EntityModule>;

export type EntityKind = keyof typeof entities;

export const entityKinds = Object.keys(entities) as readonly EntityKind[];
