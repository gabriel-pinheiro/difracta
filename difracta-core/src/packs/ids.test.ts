import { describe, expect, it } from "vitest";

import {
  entryIdFor,
  FINGERPRINT_PATTERN,
  formatFingerprint,
  isSlug,
  packIdFor,
  slugOf,
  uniqueId,
  withoutExtension,
} from "./ids.ts";

describe("slugs", () => {
  it("lowercase and join runs of anything else with one dash", () => {
    expect(slugOf("Neon VJ Pack")).toBe("neon-vj-pack");
    expect(slugOf("  --Café_2026!! ")).toBe("cafe-2026");
    expect(slugOf("tunnels/04")).toBe("tunnels-04");
    expect(slugOf("###")).toBe("media");
    expect(slugOf("###", "pack")).toBe("pack");
    expect(isSlug("neon-k7f3")).toBe(true);
    expect(isSlug("Neon")).toBe(false);
    expect(isSlug("neon--x")).toBe(false);
    expect(isSlug("-neon")).toBe(false);
    expect(isSlug("")).toBe(false);
  });

  it("drop an extension but not a dot inside a folder name", () => {
    expect(withoutExtension("tunnels/04.mp4")).toBe("tunnels/04");
    expect(withoutExtension("v1.2/clip")).toBe("v1.2/clip");
    expect(withoutExtension(".hidden")).toBe(".hidden");
    expect(withoutExtension("noext")).toBe("noext");
  });
});

describe("entry ids", () => {
  it("slug the path without its extension and stay unique with a numeric suffix", () => {
    expect(entryIdFor("tunnels/04.mp4", [])).toBe("tunnels-04");
    expect(entryIdFor("Beam Scan.webm", [])).toBe("beam-scan");
    expect(entryIdFor("tunnels/04.mov", ["tunnels-04"])).toBe("tunnels-04-2");
    expect(entryIdFor("tunnels/04.png", ["tunnels-04", "tunnels-04-2"])).toBe(
      "tunnels-04-3",
    );
    expect(uniqueId("a", ["a", "a-2", "a-4"])).toBe("a-3");
  });
});

describe("pack ids", () => {
  it("are the folder's slug plus four random base-36 characters", () => {
    let calls = 0;
    const random = (): number => [0.0, 0.5, 0.99, 0.25][calls++ % 4] ?? 0;
    expect(packIdFor("Neon VJ", random)).toBe("neon-vj-as9j");
    expect(packIdFor("###", () => 0)).toBe("pack-aaaa");
    expect(isSlug(packIdFor("My Clips"))).toBe(true);
    expect(packIdFor("Neon")).toMatch(/^neon-[a-z0-9]{4}$/);
  });
});

describe("fingerprints", () => {
  it("keep sixteen hex characters of the hash and the size in base 36", () => {
    const hash =
      "3FA9C2E8B1D4A6F0DEADBEEF00112233445566778899AABBCCDDEEFF00112233";
    expect(formatFingerprint(hash, 75_035)).toBe("3fa9c2e8b1d4a6f0-1lwb");
    expect(formatFingerprint(hash, 0)).toBe("3fa9c2e8b1d4a6f0-0");
    expect(FINGERPRINT_PATTERN.test(formatFingerprint(hash, 1))).toBe(true);
    expect(FINGERPRINT_PATTERN.test("3fa9c2e8b1d4a6f-1k")).toBe(false);
    expect(FINGERPRINT_PATTERN.test("3fa9c2e8b1d4a6f0")).toBe(false);
  });
});
