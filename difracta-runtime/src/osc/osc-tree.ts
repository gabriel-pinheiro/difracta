import {
  flattenTree,
  type Color,
  type Controller,
  type Document,
} from "@difracta/core";

import type { OscArgument } from "./osc-codec.ts";

/**
 * The OSCQuery tree: what Chataigne browses and maps. Two branches, one
 * leaf per Controller and per Macro, each named by its id so a rename or a
 * move into a Group never breaks a mapping; the name, with its Group, is
 * the node's DESCRIPTION. A Number Controller is a float with its range, a
 * Color Controller an RGBA color, a Macro an impulse. Groups are not nodes.
 */
export interface OscNode {
  readonly FULL_PATH: string;
  readonly DESCRIPTION?: string;
  /** 0 none, 1 read, 2 write, 3 both. */
  readonly ACCESS: 0 | 1 | 2 | 3;
  readonly TYPE?: string;
  readonly VALUE?: readonly unknown[];
  readonly RANGE?: readonly { readonly MIN?: number; readonly MAX?: number }[];
  readonly CLIPMODE?: readonly string[];
  readonly CONTENTS?: Readonly<Record<string, OscNode>>;
}

export const OSC_ATTRIBUTES = new Set([
  "ACCESS",
  "CLIPMODE",
  "CONTENTS",
  "DESCRIPTION",
  "FULL_PATH",
  "RANGE",
  "TYPE",
  "VALUE",
]);

export type OscTarget =
  | { readonly kind: "controller"; readonly id: string }
  | { readonly kind: "macro"; readonly id: string };

export function oscPathOf(target: OscTarget): string {
  return `/${target.kind}/${target.id}`;
}

/** The entity an incoming address names; undefined for anything else, patterns included. */
export function targetOf(address: string): OscTarget | undefined {
  const match = /^\/(controller|macro)\/([A-Za-z0-9_.-]+)$/.exec(address);
  if (match === null) return undefined;
  const [, kind = "", id = ""] = match;
  return kind === "controller" ? { kind, id } : { kind: "macro", id };
}

function colorHex(color: Color): string {
  return `#${color
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}

/** A Controller's value as OSC arguments: one float, or one RGBA color. */
export function controllerArguments(
  controller: Controller,
): readonly OscArgument[] {
  if (controller.kind === "number")
    return [{ type: "float32", value: controller.value }];
  if (controller.kind === "color")
    return [
      {
        type: "color",
        value: [
          Math.round(controller.value[0] * 255),
          Math.round(controller.value[1] * 255),
          Math.round(controller.value[2] * 255),
          Math.round(controller.value[3] * 255),
        ],
      },
    ];
  return [];
}

/** One leaf of the tree, kept flat for diffing between documents. */
export interface OscLeaf {
  readonly path: string;
  readonly target: OscTarget;
  readonly node: OscNode;
}

/** Every leaf the document exposes, in navigator order. */
export function leavesOf(document: Document | undefined): readonly OscLeaf[] {
  if (document === undefined) return [];
  const leaves: OscLeaf[] = [];
  const named = (
    entity: { readonly name: string; readonly parentId: string | null },
    table: Record<
      string,
      { readonly name: string; readonly parentId: string | null }
    >,
  ): string => {
    const names = [entity.name];
    let parentId = entity.parentId;
    while (parentId !== null) {
      const parent = table[parentId];
      if (parent === undefined) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }
    return names.join(" · ");
  };
  for (const controller of flattenTree(document.controllers)) {
    if (controller.kind === "group") continue;
    const target: OscTarget = { kind: "controller", id: controller.id };
    const path = oscPathOf(target);
    const description = named(controller, document.controllers);
    leaves.push({
      path,
      target,
      node:
        controller.kind === "number"
          ? {
              FULL_PATH: path,
              DESCRIPTION: description,
              ACCESS: 3,
              TYPE: "f",
              VALUE: [controller.value],
              RANGE: [{ MIN: 0, MAX: 1 }],
              CLIPMODE: ["both"],
            }
          : {
              FULL_PATH: path,
              DESCRIPTION: description,
              ACCESS: 3,
              TYPE: "r",
              VALUE: [colorHex(controller.value)],
            },
    });
  }
  for (const macro of flattenTree(document.macros)) {
    if (macro.kind === "group") continue;
    const target: OscTarget = { kind: "macro", id: macro.id };
    const path = oscPathOf(target);
    leaves.push({
      path,
      target,
      node: {
        FULL_PATH: path,
        DESCRIPTION: named(macro, document.macros),
        ACCESS: 2,
        TYPE: "I",
      },
    });
  }
  return leaves;
}

export function buildTree(
  document: Document | undefined,
  leaves: readonly OscLeaf[] = leavesOf(document),
): OscNode {
  const controllers: Record<string, OscNode> = {};
  const macros: Record<string, OscNode> = {};
  for (const leaf of leaves)
    (leaf.target.kind === "controller" ? controllers : macros)[leaf.target.id] =
      leaf.node;
  return {
    FULL_PATH: "/",
    DESCRIPTION: document?.installation.name ?? "No Installation open",
    ACCESS: 0,
    CONTENTS: {
      controller: {
        FULL_PATH: "/controller",
        DESCRIPTION: "Controllers",
        ACCESS: 0,
        CONTENTS: controllers,
      },
      macro: {
        FULL_PATH: "/macro",
        DESCRIPTION: "Macros",
        ACCESS: 0,
        CONTENTS: macros,
      },
    },
  };
}

export function nodeAt(root: OscNode, path: string): OscNode | undefined {
  if (path === "/") return root;
  if (!path.startsWith("/") || path.endsWith("/")) return undefined;
  let node = root;
  for (const segment of path.slice(1).split("/")) {
    const child = node.CONTENTS?.[segment];
    if (child === undefined) return undefined;
    node = child;
  }
  return node;
}

/** What the OSCQuery HOST_INFO query answers: who this is and which doors are open. */
export function hostInfo(name: string, port: number): Record<string, unknown> {
  return {
    NAME: name,
    EXTENSIONS: {
      ACCESS: true,
      CLIPMODE: true,
      DESCRIPTION: true,
      RANGE: true,
      TYPE: true,
      VALUE: true,
      LISTEN: true,
      PATH_ADDED: true,
      PATH_REMOVED: true,
      PATH_CHANGED: true,
    },
    OSC_PORT: port,
    OSC_TRANSPORT: "UDP",
    WS_PORT: port,
  };
}
