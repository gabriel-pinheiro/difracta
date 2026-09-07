import { describe, expect, it } from "vitest";

import { emptyDocument } from "../document/document.ts";
import { listAddresses, resolveAddress } from "./address.ts";

describe("addresses", () => {
  const document = emptyDocument("Test");

  it("resolves installation/blackout to the operational path", () => {
    expect(resolveAddress(document, "installation/blackout")).toEqual({
      address: "installation/blackout",
      label: "Blackout",
      path: ["operational", "blackout"],
      type: "boolean",
    });
  });

  it("rejects unknown addresses", () => {
    expect(resolveAddress(document, "installation/nope")).toBeUndefined();
    expect(resolveAddress(document, "blackout")).toBeUndefined();
  });

  it("lists every reachable address", () => {
    expect(listAddresses(document).map((entry) => entry.address)).toEqual([
      "installation/blackout",
    ]);
  });
});
