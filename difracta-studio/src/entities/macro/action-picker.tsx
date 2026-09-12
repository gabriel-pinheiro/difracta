import type { DocumentView } from "@difracta/client";
import {
  getAtPath,
  linkAt,
  listAddresses,
  orderedEntries,
  type AddressValue,
  type Document,
  type ResolvedAddress,
  type RunnableMacro,
} from "@difracta/core";
import { useMemo } from "react";

import {
  AddressPicker,
  type PickerCandidate,
} from "@/inspector/fields/address-picker";
import { catalog, definitionOf } from "@/lib/catalog";
import { useCommand, useSignal } from "@/lib/client";

/**
 * Picks the Addresses a Macro will act on: every one in the Installation,
 * grouped by Scene for a Layer's, under their own headings for the rest.
 * Each pick captures what the Address holds now, so ticking fifteen
 * opacities writes the state the wall is in; a trigger Address becomes a
 * trigger action.
 */
export function ActionPicker({
  view,
  macro,
  onClose,
}: {
  readonly view: DocumentView;
  readonly macro: RunnableMacro;
  readonly onClose: () => void;
}) {
  const command = useCommand(view);
  const document = useSignal(view.document);
  const candidates = useMemo(
    () => (document === undefined ? [] : collect(document, macro)),
    [document, macro],
  );
  return (
    <AddressPicker
      title={`Add actions to ${macro.name}`}
      testId="action-picker"
      candidates={candidates}
      empty="Nothing to act on in the Installation yet."
      submitLabel={(count) => `Add ${count > 0 ? String(count) : ""}`}
      onSubmit={(addresses) => {
        if (document === undefined) return;
        const actions = addresses
          .map((address) => actionFor(document, address))
          .filter((action) => action !== undefined);
        if (actions.length > 0)
          void command("macro.actions.add", { macroId: macro.id, actions });
      }}
      onClose={onClose}
    />
  );
}

/** A set of the current value, or a trigger, for the Address. */
function actionFor(
  document: Document,
  address: string,
):
  | { readonly kind: "trigger"; readonly address: string }
  | {
      readonly kind: "set";
      readonly address: string;
      readonly value: AddressValue;
    }
  | undefined {
  const resolved = listAddresses(document, catalog).find(
    (candidate) => candidate.address === address,
  );
  if (resolved === undefined) return undefined;
  if (resolved.type === "trigger") return { kind: "trigger", address };
  return {
    kind: "set",
    address,
    value: getAtPath(document, resolved.path) as AddressValue,
  };
}

const HEADING_RANK: Record<string, number> = {
  Installation: 0,
  Scenes: 1,
  Controllers: 3,
  Macros: 4,
  Surfaces: 5,
};

/** Every Address, with the words that find it, in the order the picker lists them. */
function collect(document: Document, macro: RunnableMacro): PickerCandidate[] {
  const sceneOrder = new Map<string, number>(
    orderedEntries(document.scenes).map((scene, position) => [
      scene.id,
      position,
    ]),
  );
  const result: (PickerCandidate & { readonly rank: number })[] = [];
  for (const resolved of listAddresses(document, catalog)) {
    const placed = place(document, resolved, macro);
    if (placed === undefined) continue;
    const link = linkAt(document, resolved.address);
    const controller =
      link === undefined ? undefined : document.controllers[link.controllerId];
    result.push({
      key: resolved.address,
      group: placed.group,
      owner: placed.owner,
      label: resolved.label,
      detail: placed.detail,
      haystack:
        `${placed.group} ${placed.owner} ${placed.detail ?? ""} ${resolved.label}`.toLowerCase(),
      note:
        controller === undefined
          ? undefined
          : {
              text: controller.name,
              title: `Controlled by ${controller.name}; a set action is skipped while it is`,
            },
      rank:
        placed.sceneId === undefined
          ? (HEADING_RANK[placed.group] ?? 9)
          : 2 + (sceneOrder.get(placed.sceneId) ?? 0) / 1000,
    });
  }
  return result.sort((a, b) => a.rank - b.rank);
}

function place(
  document: Document,
  resolved: ResolvedAddress,
  macro: RunnableMacro,
):
  | {
      readonly group: string;
      readonly owner: string;
      readonly detail?: string | undefined;
      readonly sceneId?: string | undefined;
    }
  | undefined {
  const [kind, id = ""] = resolved.address.split("/");
  switch (kind) {
    case "installation":
      return { group: "Installation", owner: "" };
    case "scene":
      return { group: "Scenes", owner: resolved.owner ?? "" };
    case "surface":
      return { group: "Surfaces", owner: resolved.owner ?? "" };
    case "controller":
      return { group: "Controllers", owner: resolved.owner ?? "" };
    case "macro":
      return id === macro.id
        ? undefined
        : { group: "Macros", owner: resolved.owner ?? "" };
    case "layer": {
      const layer = document.layers[id];
      if (layer === undefined) return undefined;
      return {
        group: document.scenes[layer.sceneId]?.name ?? "",
        owner: layer.name,
        detail:
          layer.kind === "group"
            ? undefined
            : definitionOf(layer).definition?.name,
        sceneId: layer.sceneId,
      };
    }
    default:
      return undefined;
  }
}
