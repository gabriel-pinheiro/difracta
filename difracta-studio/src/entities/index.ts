import type { DocumentView } from "@difracta/client";
import type { Document } from "@difracta/core";
import type { ComponentType } from "react";

import type { RowParent } from "@/navigator/ancestor-rows";

import { controllerEntity } from "./controller/controller-entity";
import { entryEntity } from "./entry/entry-entity";
import { layerEntity } from "./layer/layer-entity";
import { macroEntity } from "./macro/macro-entity";
import { maskEntity } from "./mask/mask-entity";
import { outputEntity } from "./output/output-entity";
import { packEntity } from "./pack/pack-entity";
import { pathEntity } from "./path/path-entity";
import { regionEntity } from "./region/region-entity";
import { sceneEntity } from "./scene/scene-entity";
import { shareEntity } from "./share/share-entity";
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
  /** What to confirm before removing, for a removal worth a question; undefined removes at once. */
  readonly confirm?: (document: Document, id: string) => string | undefined;
}

/**
 * What one entity kind contributes to Studio: its navigator section, its
 * inspector, how it is removed and the row its rows nest under. Each kind
 * lives in its own folder under `entities/`; adding a kind is one folder
 * plus one line in `entities` below.
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
  /** Absent for a kind nothing removes, such as a Pack entry; Remove then does nothing on it. */
  readonly removal?: Removal;
  /** The row this kind's row is nested under; absent for a kind whose rows never nest. */
  readonly parent?: RowParent;
}

export const entities = {
  output: outputEntity,
  surface: surfaceEntity,
  region: regionEntity,
  mask: maskEntity,
  path: pathEntity,
  pack: packEntity,
  entry: entryEntity,
  share: shareEntity,
  scene: sceneEntity,
  layer: layerEntity,
  controller: controllerEntity,
  macro: macroEntity,
} as const satisfies Record<string, EntityModule>;

export type EntityKind = keyof typeof entities;

export const entityKinds = Object.keys(entities) as readonly EntityKind[];
