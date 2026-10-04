import { DEFAULT_ORDER_KEY, emptyDocument } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { parseDocumentFile, serializeDocument } from "./document-file.ts";

describe("parseDocumentFile", () => {
  it("reads a format 1 file, carrying its Screen Shares and dropping its other Media items", () => {
    const file = JSON.parse(serializeDocument(emptyDocument("Old"))) as Record<
      string,
      unknown
    >;
    file.formatVersion = 1;
    delete file.packs;
    delete file.shares;
    file.media = {
      m_logo: { id: "m_logo", name: "Logo", order: "a0", path: "logo.png" },
      m_beam: {
        id: "m_beam",
        kind: "bundled",
        bundled: "beam",
        name: "Beam",
        order: "a1",
        parentId: null,
      },
      g_art: {
        id: "g_art",
        kind: "group",
        name: "Art",
        order: "a2",
        parentId: null,
      },
      m_in_group: {
        id: "m_in_group",
        kind: "share",
        name: "Inside",
        order: "a0",
        parentId: "g_art",
      },
      m_slides: {
        id: "m_slides",
        kind: "share",
        name: "Slides",
        order: "a3",
        parentId: null,
      },
      m_old: { id: "m_old", kind: "share", name: "Old" },
    };
    const parsed = parseDocumentFile(JSON.stringify(file));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.document.shares).toEqual({
      m_slides: { id: "m_slides", name: "Slides", order: "a3" },
      m_old: { id: "m_old", name: "Old", order: DEFAULT_ORDER_KEY },
    });
    expect(parsed.document.packs).toEqual({});
    expect("media" in parsed.document).toBe(false);
    // Written back as format 2, which reads the same.
    const again = parseDocumentFile(serializeDocument(parsed.document));
    expect(again.ok && again.document.shares).toEqual(parsed.document.shares);
    expect(JSON.parse(serializeDocument(parsed.document))).toMatchObject({
      formatVersion: 2,
    });
  });

  it("refuses a format it does not know", () => {
    const file = JSON.parse(serializeDocument(emptyDocument("New"))) as Record<
      string,
      unknown
    >;
    file.formatVersion = 3;
    expect(parseDocumentFile(JSON.stringify(file)).ok).toBe(false);
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
