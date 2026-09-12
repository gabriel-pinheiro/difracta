import type { DocumentView } from "@difracta/client";
import {
  linkAt,
  linkable,
  listAddresses,
  orderedEntries,
  type Controller,
  type Document,
} from "@difracta/core";
import { useMemo } from "react";

import {
  AddressPicker,
  type PickerCandidate,
} from "@/inspector/fields/address-picker";
import { catalog, definitionOf } from "@/lib/catalog";
import { useCommand, useSignal } from "@/lib/client";

/**
 * Picks the Addresses a Controller will drive: every compatible one in the
 * Installation, grouped by Scene, and linked in one step. Built for "this
 * Controller onto the same Parameter of thirty Layers": type two words,
 * select all, link.
 */
export function LinkPicker({
  view,
  controller,
  onClose,
}: {
  readonly view: DocumentView;
  readonly controller: Controller & { readonly kind: "number" | "color" };
  readonly onClose: () => void;
}) {
  const command = useCommand(view);
  const document = useSignal(view.document);
  const candidates = useMemo(
    () => (document === undefined ? [] : collect(document, controller)),
    [document, controller],
  );
  return (
    <AddressPicker
      title={`Link to ${controller.name}`}
      testId="link-picker"
      candidates={candidates}
      empty="No compatible Parameter in the Installation."
      submitLabel={(count) => `Link ${count > 0 ? String(count) : ""}`}
      onSubmit={(addresses) =>
        void command("link.create", { controllerId: controller.id, addresses })
      }
      onClose={onClose}
    />
  );
}

/** Every Address the Controller could drive, in Scene then Layer order. */
function collect(
  document: Document,
  controller: Controller & { readonly kind: "number" | "color" },
): PickerCandidate[] {
  const sceneOrder = new Map<string, number>(
    orderedEntries(document.scenes).map((scene, position) => [
      scene.id,
      position,
    ]),
  );
  const result: (PickerCandidate & { readonly sceneId: string })[] = [];
  for (const resolved of listAddresses(document, catalog)) {
    if (!linkable(resolved, controller.kind)) continue;
    const layer = document.layers[resolved.path[1] ?? ""];
    if (layer === undefined || layer.kind === "group") continue;
    const scene = document.scenes[layer.sceneId];
    const detail = definitionOf(layer).definition?.name ?? "";
    const existing = linkAt(document, resolved.address);
    const elsewhere =
      existing === undefined || existing.controllerId === controller.id
        ? undefined
        : (document.controllers[existing.controllerId]?.name ?? "another");
    result.push({
      key: resolved.address,
      group: scene?.name ?? "",
      owner: layer.name,
      label: resolved.label,
      detail,
      haystack:
        `${scene?.name ?? ""} ${layer.name} ${detail} ${resolved.label}`.toLowerCase(),
      taken: existing?.controllerId === controller.id ? "linked" : undefined,
      note:
        elsewhere === undefined
          ? undefined
          : {
              text: elsewhere,
              title: `Controlled by ${elsewhere}; linking moves it here`,
            },
      sceneId: layer.sceneId,
    });
  }
  return result.sort(
    (a, b) =>
      (sceneOrder.get(a.sceneId) ?? 0) - (sceneOrder.get(b.sceneId) ?? 0),
  );
}
