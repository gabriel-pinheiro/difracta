import { emptyDocument } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { parseDocumentFile, serializeDocument } from "./document-file.ts";

describe("parseDocumentFile", () => {
  it("reads Media items written before Media Groups as files at the root", () => {
    const file = JSON.parse(serializeDocument(emptyDocument("Old"))) as Record<
      string,
      unknown
    >;
    file.media = {
      m_logo: { id: "m_logo", name: "Logo", order: "a0", path: "logo.png" },
    };
    const parsed = parseDocumentFile(JSON.stringify(file));
    expect(parsed.ok && parsed.document.media.m_logo).toEqual({
      id: "m_logo",
      kind: "file",
      name: "Logo",
      order: "a0",
      parentId: null,
      path: "logo.png",
    });
  });

  it("reads a Surface written with one Output as that mapping enabled", () => {
    const corners = {
      topLeft: { x: 0.1, y: 0 },
      topRight: { x: 1, y: 0 },
      bottomRight: { x: 1, y: 1 },
      bottomLeft: { x: 0, y: 1 },
    };
    const file = JSON.parse(serializeDocument(emptyDocument("Old"))) as Record<
      string,
      unknown
    >;
    const surface = { name: "Wall", order: "a0", renderScale: 1, size: null };
    file.surfaces = {
      sur_a: {
        ...surface,
        id: "sur_a",
        output: "out_b",
        mappings: { out_a: { corners }, out_b: { corners } },
      },
      sur_b: { ...surface, id: "sur_b", output: null, mappings: {} },
      sur_c: {
        ...surface,
        id: "sur_c",
        output: null,
        mappings: { out_a: { corners } },
      },
    };
    const parsed = parseDocumentFile(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.document.surfaces).toEqual({
      sur_a: {
        ...surface,
        id: "sur_a",
        mappings: {
          out_a: { enabled: false, corners },
          out_b: { enabled: true, corners },
        },
      },
      sur_b: { ...surface, id: "sur_b", mappings: {} },
      sur_c: {
        ...surface,
        id: "sur_c",
        mappings: { out_a: { enabled: false, corners } },
      },
    });
    // Written back in the new shape, which reads the same.
    const again = parseDocumentFile(serializeDocument(parsed.document));
    expect(again.ok && again.document.surfaces).toEqual(
      parsed.document.surfaces,
    );
  });
});
