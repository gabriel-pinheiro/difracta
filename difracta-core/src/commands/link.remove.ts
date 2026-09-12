import { z } from "zod";

import { resolveAddress } from "../address/address.ts";
import { effectiveValue } from "../address/links.ts";
import { accepted, defineCommand, rejected } from "../command/command.ts";
import type { CommandContext } from "../command/command.ts";
import type { Link } from "../document/document.ts";
import type { Patch } from "../document/patch.ts";

/**
 * Patches that end a Link: the target keeps what it was showing, so nothing
 * on the wall changes when a Controller lets go, then the Link is removed.
 */
export function releaseLink(
  { document, catalog }: Pick<CommandContext<unknown>, "document" | "catalog">,
  link: Link,
): Patch[] {
  const patches: Patch[] = [];
  const resolved = resolveAddress(document, link.address, catalog);
  if (resolved !== undefined)
    patches.push({
      op: "set",
      path: resolved.path,
      value: effectiveValue(document, resolved),
    });
  patches.push({ op: "remove", path: ["links", link.id] });
  return patches;
}

export const linkRemove = defineCommand({
  name: "link.remove",
  kind: "authoring",
  description:
    "Unlink an Address from its Controller; the Address keeps its current value.",
  payload: z.object({ linkId: z.string().min(1) }).strict(),
  label: ({ linkId }, { document, catalog }) => {
    const link = document.links[linkId];
    const label =
      link === undefined
        ? undefined
        : resolveAddress(document, link.address, catalog)?.label;
    return label === undefined ? "Unlink" : `Unlink ${label}`;
  },
  apply(context) {
    const link = context.document.links[context.payload.linkId];
    if (link === undefined)
      return rejected(`Link “${context.payload.linkId}” does not exist.`);
    return accepted(releaseLink(context, link));
  },
});
