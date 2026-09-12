import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { defaultAnchors, linkAt, linkProblem } from "../address/links.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Link } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";
import { generateId } from "../ids.ts";

/**
 * Links one Controller to one or more Addresses in one step, so wiring a
 * Controller to the same Parameter on thirty Layers is one undo entry. An
 * Address already driven by another Controller moves to this one. Number
 * links start at the target's whole range unless anchors are given.
 */
export const linkCreate = defineCommand({
  name: "link.create",
  kind: "authoring",
  description:
    "Link a Controller to Addresses, e.g. layer/<id>/param/color; an Address linked elsewhere moves.",
  payload: z
    .object({
      controllerId: z.string().min(1),
      addresses: z.array(z.string().min(1)).min(1),
      /** Target values at Controller 0 and 1, for number targets. */
      anchors: z
        .object({ from: z.number(), to: z.number() })
        .strict()
        .optional(),
    })
    .strict(),
  label: ({ addresses, controllerId }, { document }) => {
    const name = document.controllers[controllerId]?.name ?? "Controller";
    return addresses.length === 1
      ? `Link to ${name}`
      : `Link ${String(addresses.length)} Parameters to ${name}`;
  },
  apply({ document, payload, catalog }) {
    const controller = document.controllers[payload.controllerId];
    if (controller === undefined)
      return rejected(`Controller “${payload.controllerId}” does not exist.`);
    const patches: Patch[] = [];
    for (const address of new Set(payload.addresses)) {
      const resolved = resolveAddress(document, address, catalog);
      if (resolved === undefined)
        return rejected(`Unknown address “${address}”.`);
      const problem = linkProblem(controller, resolved);
      if (problem !== undefined) return rejected(problem);
      const existing = linkAt(document, address);
      if (existing?.controllerId === controller.id) continue;
      if (existing !== undefined)
        patches.push({ op: "remove", path: ["links", existing.id] });
      const id = generateId("link");
      const link: Link = {
        id,
        controllerId: controller.id,
        address,
        anchors:
          resolved.type === "number"
            ? (payload.anchors ?? defaultAnchors(resolved))
            : null,
      };
      patches.push({ op: "set", path: ["links", id], value: link });
    }
    return accepted(patches);
  },
});
