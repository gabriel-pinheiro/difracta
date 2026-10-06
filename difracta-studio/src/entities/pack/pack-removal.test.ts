import type { MediaUse } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { detachDescription } from "./pack-removal";

const layer = (layerId: string, reference: string): MediaUse => ({
  kind: "layer",
  reference,
  accepts: "video",
  layerId,
  parameter: "media",
  label: "Video",
});
const macro = (macroId: string, action: number): MediaUse => ({
  kind: "macro",
  reference: "neon-k7f3/a",
  accepts: "video",
  macroId,
  action,
  layerId: "layer_a",
});

describe("The confirm before detaching a Pack", () => {
  it("counts the Layers and Macro actions using its entries", () => {
    expect(
      detachDescription("Neon VJ", [
        layer("l1", "neon-k7f3/a"),
        layer("l2", "neon-k7f3/b"),
        macro("m1", 0),
      ]),
    ).toBe(
      "2 Layers and 1 Macro action use “Neon VJ”. They keep their references and show nothing until the Pack is attached again. The folder stays on disk.",
    );
    expect(detachDescription("Neon VJ", [layer("l1", "neon-k7f3/a")])).toBe(
      "1 Layer uses “Neon VJ”. They keep their references and show nothing until the Pack is attached again. The folder stays on disk.",
    );
  });

  it("says when nothing uses it", () => {
    expect(detachDescription("Neon VJ", [])).toBe(
      "Nothing in the Installation uses “Neon VJ”. The folder stays on disk.",
    );
  });
});
