import { describe, expect, it } from "vitest";

import { dispositionFileName, documentUrl } from "./document-transfer.ts";

describe("documentUrl", () => {
  it("is the runtime's HTTP address for a live URL", () => {
    expect(documentUrl("ws://127.0.0.1:4800/live")).toBe(
      "http://127.0.0.1:4800/document",
    );
    expect(documentUrl("wss://rig.example:4800/live")).toBe(
      "https://rig.example:4800/document",
    );
  });

  it("stays under a prefix the live URL was given", () => {
    expect(documentUrl("ws://rig.local:80/difracta/live")).toBe(
      "http://rig.local/difracta/document",
    );
  });
});

describe("dispositionFileName", () => {
  it("prefers the encoded name and falls back to the plain one", () => {
    expect(
      dispositionFileName(
        `attachment; filename="T_rreo.difracta"; filename*=UTF-8''T%C3%A9rreo.difracta`,
      ),
    ).toBe("Térreo.difracta");
    expect(dispositionFileName('attachment; filename="show.difracta"')).toBe(
      "show.difracta",
    );
    expect(dispositionFileName("attachment")).toBeUndefined();
    expect(dispositionFileName(null)).toBeUndefined();
  });

  it("never yields a path", () => {
    expect(
      dispositionFileName(`attachment; filename*=UTF-8''..%2F..%2Fetc%2Fx`),
    ).toBe("x");
    expect(
      dispositionFileName('attachment; filename="..\\.."'),
    ).toBeUndefined();
  });
});
