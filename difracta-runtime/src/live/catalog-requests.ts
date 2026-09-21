import type { Catalog, FilterDefinition } from "@difracta/core";

import type { RequestHandlers } from "./runtime-requests.ts";

/**
 * `catalog.list`: what this runtime can render, as metadata. Definitions
 * carry their implementation: JSON drops the functions, and a Filter's
 * shader source is left out here.
 */
export function catalogRequests(
  catalog: Catalog,
): RequestHandlers<"catalog.list"> {
  return {
    "catalog.list": () => ({
      ok: true,
      result: {
        visuals: catalog.visuals(),
        filters: catalog.filters().map((filter) => {
          const { fragment: _fragment, ...metadata } =
            filter as FilterDefinition & { fragment?: unknown };
          return metadata;
        }),
      },
    }),
  };
}
