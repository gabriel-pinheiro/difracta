import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";

/** The anchors of a number Link: what the target shows at Controller 0 and 1. */
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
  apply({ document, payload }) {
    const link = document.links[payload.linkId];
    if (link === undefined)
      return rejected(`Link “${payload.linkId}” does not exist.`);
    if (link.anchors === null)
      return rejected("A color Link has no mapping to change.");
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
