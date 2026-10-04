import { z } from "zod";

import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { Share } from "../document/document.ts";
import { uniqueName } from "../document/names.ts";
import { orderedEntries } from "../document/order.ts";
import { orderKeyForNew } from "../document/tree.ts";
import { generateId, id } from "../ids.ts";

/**
 * A new Screen Share: a named slot a Sharer shares a screen or window into,
 * last among the Screen Shares or right after the one `after` names (null
 * for first). Named "Screen Share" unless a name is given, numbered while
 * another holds the name.
 */
export const shareCreate = defineCommand({
  name: "share.create",
  kind: "authoring",
  description:
    "Add a Screen Share, a named slot a Difracta Desktop shares a screen or window into, shown by the Live Visual; named “Screen Share” unless a name is given.",
  payload: z
    .object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      /** Screen Share to land after; null for first, absent for last. */
      after: z.string().min(1).nullable().optional(),
    })
    .strict(),
  label: () => "Add Screen Share",
  apply({ document, payload }) {
    const shareId =
      payload.id === undefined ? generateId("share") : id("share", payload.id);
    if (shareId in document.shares)
      return rejected(`Screen Share “${shareId}” already exists.`);
    const siblings = orderedEntries(document.shares);
    const after =
      payload.after === undefined
        ? (siblings.at(-1)?.id ?? null)
        : payload.after;
    const order = orderKeyForNew(siblings, after, "Screen Share");
    if (typeof order !== "string") return rejected(order.error);
    const share: Share = {
      id: shareId,
      name: uniqueName(
        siblings.map((sibling) => sibling.name),
        payload.name ?? "Screen Share",
      ),
      order,
    };
    return accepted([{ op: "set", path: ["shares", shareId], value: share }]);
  },
});
