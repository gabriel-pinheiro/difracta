import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { anchorsProblem } from "../address/links.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";

/**
 * The anchors of a number Link: what the target shows at Controller 0 and
 * 1. Each must be a value the target accepts, within its range and on its
 * step; reversed anchors invert.
 */
export const linkUpdate = defineCommand({
  name: "link.update",
  kind: "authoring",
  description: "Change what a number Link maps the Controller's 0 and 1 to.",
  payload: z
    .object({
      linkId: z.string().min(1),
      anchors: z.object({ from: z.number(), to: z.number() }).strict(),
    })
    .strict(),
  label: () => "Change Link mapping",
  coalesceKey: ({ linkId }) => `link.update:${linkId}`,
  apply({ document, payload, catalog }) {
    const link = document.links[payload.linkId];
    if (link === undefined)
      return rejected(`Link “${payload.linkId}” does not exist.`);
    if (link.anchors === null)
      return rejected("A color Link has no mapping to change.");
    const resolved = resolveAddress(document, link.address, catalog);
    if (resolved === undefined)
      return rejected(`The Link's target “${link.address}” no longer exists.`);
    const problem = anchorsProblem(resolved, payload.anchors);
    if (problem !== undefined) return rejected(problem);
    if (
      link.anchors.from === payload.anchors.from &&
      link.anchors.to === payload.anchors.to
    )
      return accepted([]);
    return accepted([
      {
        op: "set",
        path: ["links", link.id, "anchors"],
        value: payload.anchors,
      },
    ]);
  },
});
