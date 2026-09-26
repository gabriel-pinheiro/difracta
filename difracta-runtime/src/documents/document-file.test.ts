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
});
