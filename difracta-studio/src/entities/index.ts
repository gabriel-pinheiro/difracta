import type { DocumentView } from "@difracta/client";
import type { ComponentType } from "react";

import { outputEntity } from "./output/output-entity";

/**
 * What one entity kind contributes to Studio: its navigator section and its
 * inspector. Each kind lives in its own folder under `entities/`; adding a
 * kind is one folder plus one line in `entities` below.
 */
export interface EntityModule {
  /** Section label in the navigator, plural. */
  readonly label: string;
  readonly Section: ComponentType<{ readonly view: DocumentView }>;
  readonly Inspector: ComponentType<{
    readonly view: DocumentView;
    readonly id: string;
  }>;
}

export const entities = {
  output: outputEntity,
} as const satisfies Record<string, EntityModule>;

export type EntityKind = keyof typeof entities;

export const entityKinds = Object.keys(entities) as readonly EntityKind[];
