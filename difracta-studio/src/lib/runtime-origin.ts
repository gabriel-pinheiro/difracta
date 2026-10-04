import { runtimeOrigin } from "@difracta/client";

/** The runtime's HTTP origin, where Pack files and Bundled Fonts are fetched from. */
export function studioRuntimeOrigin(): string {
  return runtimeOrigin(
    new URLSearchParams(location.search).get("runtime"),
    location.origin,
  );
}
