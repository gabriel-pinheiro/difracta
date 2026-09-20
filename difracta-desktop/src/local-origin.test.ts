import { describe, expect, it } from "vitest";

import { isFromOrigin, linkTarget, localOrigin } from "./local-origin.ts";

const origin = localOrigin(4800);

describe("local origin", () => {
  it("is the runtime over loopback", () => {
    expect(origin).toBe("http://127.0.0.1:4800");
  });

  it("accepts frames of the local runtime only", () => {
    expect(isFromOrigin("http://127.0.0.1:4800/studio/", origin)).toBe(true);
    expect(isFromOrigin("http://127.0.0.1:4800/output/?output=a", origin)).toBe(
      true,
    );
    for (const url of [
      undefined,
      "",
      "not a url",
      "http://127.0.0.1:4801/studio/",
      "https://127.0.0.1:4800/studio/",
      "http://192.168.1.20:4800/studio/",
      "http://localhost:4800/studio/",
      "http://127.0.0.1:4800.evil.example/studio/",
      "file:///home/someone/studio/index.html",
      "about:blank",
    ])
      expect(isFromOrigin(url, origin), String(url)).toBe(false);
  });

  it("sorts links into app windows, the browser, and refused", () => {
    expect(linkTarget("http://127.0.0.1:4800/output/?output=a", origin)).toBe(
      "window",
    );
    expect(linkTarget("https://example.com/docs", origin)).toBe("browser");
    expect(linkTarget("http://192.168.1.20:4800/studio/", origin)).toBe(
      "browser",
    );
    for (const url of ["file:///etc/passwd", "javascript:alert(1)", "nope"])
      expect(linkTarget(url, origin), url).toBe("refused");
  });
});
