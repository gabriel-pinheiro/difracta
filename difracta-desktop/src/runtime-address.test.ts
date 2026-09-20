import { describe, expect, it } from "vitest";

import {
  addressLabel,
  liveUrl,
  parseRuntimeAddress,
  remoteLabel,
} from "./runtime-address.ts";

const origin = (input: string): string | undefined => {
  const parsed = parseRuntimeAddress(input);
  return parsed.ok ? parsed.origin : undefined;
};

describe("runtime address", () => {
  it("takes a host, a host and port, or a URL of the runtime", () => {
    expect(origin("stage-pc")).toBe("http://stage-pc:4800");
    expect(origin("  10.0.0.5:4900 ")).toBe("http://10.0.0.5:4900");
    expect(origin("Stage-PC.local")).toBe("http://stage-pc.local:4800");
    expect(origin("http://10.0.0.5:4900/studio/")).toBe("http://10.0.0.5:4900");
    expect(origin("ws://10.0.0.5/live")).toBe("http://10.0.0.5:4800");
    expect(origin("https://show.example")).toBe("https://show.example:4800");
    expect(origin("[fe80::1]:4900")).toBe("http://[fe80::1]:4900");
  });

  it("keeps a typed port that is the scheme's default", () => {
    expect(origin("http://10.0.0.5:80")).toBe("http://10.0.0.5:80");
    expect(origin("https://show.example:443/studio/")).toBe(
      "https://show.example:443",
    );
  });

  it("says what is wrong with anything else", () => {
    for (const input of [
      "",
      "   ",
      "two words",
      "ftp://10.0.0.5",
      "file:///etc/passwd",
      "javascript://x",
      "someone:secret@10.0.0.5",
      "10.0.0.5:0",
      "10.0.0.5:70000",
      "http://",
      "fe80::1",
    ]) {
      const parsed = parseRuntimeAddress(input);
      expect(parsed.ok, input).toBe(false);
      if (!parsed.ok) expect(parsed.reason).not.toBe("");
    }
  });

  it("labels an origin the way it was typed, and finds its live socket", () => {
    expect(addressLabel("http://10.0.0.5:4800")).toBe("10.0.0.5:4800");
    expect(addressLabel("https://show.example:4800")).toBe(
      "https://show.example:4800",
    );
    expect(liveUrl("http://10.0.0.5:4800")).toBe("ws://10.0.0.5:4800/live");
    expect(liveUrl("https://show.example:4800")).toBe(
      "wss://show.example:4800/live",
    );
  });

  it("names a runtime elsewhere by its machine and its address", () => {
    expect(remoteLabel("http://10.0.0.5:4800", "Difracta on stage-pc")).toBe(
      "stage-pc — 10.0.0.5:4800",
    );
    expect(remoteLabel("http://10.0.0.5:4800", null)).toBe("10.0.0.5:4800");
  });
});
