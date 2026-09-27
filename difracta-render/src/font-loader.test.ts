import { Catalog, type FontDefinition } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { FontLoader, fontFamily, fontStack } from "./font-loader.ts";

const sans: FontDefinition = {
  kind: "font",
  id: "sans",
  name: "Sans",
  description: "The one others fall back to.",
  files: ["sans.woff2", "sans-ext.woff2"],
};
const display: FontDefinition = {
  kind: "font",
  id: "display",
  name: "Display",
  description: "Capitals.",
  files: ["display.woff2"],
};

describe("fontStack", () => {
  it("lists the font's files, then the fallback's, then the system's", () => {
    expect(fontStack(display, sans)).toBe(
      '"Difracta display", "Difracta sans", "Difracta sans 2", system-ui, sans-serif',
    );
  });

  it("names the fallback once when it is the font itself", () => {
    expect(fontStack(sans, sans)).toBe(
      '"Difracta sans", "Difracta sans 2", system-ui, sans-serif',
    );
    expect(fontStack(display, undefined)).toBe(
      '"Difracta display", system-ui, sans-serif',
    );
  });

  it("gives every file a family of its own", () => {
    expect(fontFamily("sans")).toBe("Difracta sans");
    expect(fontFamily("sans", 1)).toBe("Difracta sans 2");
  });
});

describe("FontLoader", () => {
  const catalog = new Catalog({ fonts: [sans, display] });

  it("has no font ready where the page cannot load one", () => {
    const loader = new FontLoader({ catalog, fontUrl: () => undefined });
    expect(loader.stack("sans")).toBeUndefined();
    expect(loader.stack("display")).toBeUndefined();
    expect(loader.version).toBe(0);
  });

  it("refuses a font the Catalog lacks", () => {
    const loader = new FontLoader({ catalog, fontUrl: () => undefined });
    expect(() => loader.stack("comic")).toThrow(/not a Bundled Font/);
  });
});
