import path from "node:path";
import { describe, expect, it } from "vitest";

import { launchSchemeFile } from "./launch-scheme-file.ts";
import { LAUNCH_PAGE_URL, isLaunchPage } from "./launch-scheme.ts";

const dist = path.resolve("/opt/difracta/dist/studio");

describe("launch scheme", () => {
  it("serves the launch page and the assets it loads", () => {
    expect(launchSchemeFile(LAUNCH_PAGE_URL, dist)).toBe(
      path.join(dist, "launch.html"),
    );
    expect(
      launchSchemeFile("app://desktop/studio/assets/launch-abc.js?v=1", dist),
    ).toBe(path.join(dist, "assets", "launch-abc.js"));
  });

  it("serves nothing else, however the path is spelled", () => {
    for (const url of [
      "app://desktop/studio/index.html",
      "app://desktop/studio/",
      "app://desktop/main.js",
      "app://elsewhere/studio/launch.html",
      "http://desktop/studio/launch.html",
      "app://desktop/studio/assets/../../main.js",
      "app://desktop/studio/assets/%2e%2e/%2e%2e/main.js",
      "app://desktop/studio/assets/..%2F..%2Fmain.js",
      "app://desktop/studio/assets/..%5C..%5Cmain.js",
      "app://desktop/studio/assets/%00",
      "app://desktop/studio/assets/%E0%A4%A",
      "app://desktop/studio/assets",
      "not a url",
    ])
      expect(launchSchemeFile(url, dist), url).toBeUndefined();
  });

  it("recognises the launch page's frame, and nothing else, as the sender", () => {
    expect(isLaunchPage(LAUNCH_PAGE_URL)).toBe(true);
    expect(isLaunchPage(`${LAUNCH_PAGE_URL}?again#top`)).toBe(true);
    for (const url of [
      undefined,
      "",
      "app://desktop/studio/assets/launch-abc.js",
      "app://desktop/studio/index.html",
      "app://desktop.evil.example/studio/launch.html",
      "http://127.0.0.1:4800/studio/launch.html",
      "http://desktop/studio/launch.html",
      "file:///studio/launch.html",
      "about:blank",
    ])
      expect(isLaunchPage(url), String(url)).toBe(false);
  });
});
