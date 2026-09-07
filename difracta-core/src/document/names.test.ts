import { describe, expect, it } from "vitest";

import { sameName, uniqueName } from "./names.ts";

describe("names", () => {
  it("compares names ignoring case and surrounding whitespace", () => {
    expect(sameName("Projector", " projector ")).toBe(true);
    expect(sameName("Café", "Cafe")).toBe(false);
    expect(sameName("Projector", "Projector 1")).toBe(false);
  });

  it("returns the requested name when it is free", () => {
    expect(uniqueName([], "Foo")).toBe("Foo");
    expect(uniqueName(["Bar"], " Foo ")).toBe("Foo");
    expect(uniqueName(["Foo"], "Foo 1")).toBe("Foo 1");
  });

  it("numbers a taken name the way Chataigne does", () => {
    expect(uniqueName(["Foo"], "Foo")).toBe("Foo 1");
    expect(uniqueName(["Foo", "Foo 1"], "Foo")).toBe("Foo 2");
    expect(uniqueName(["Foo", "Foo 1"], "Foo 1")).toBe("Foo 2");
    expect(uniqueName(["Foo", "Foo 2"], "foo")).toBe("foo 1");
    expect(uniqueName(["Output 3"], "Output 3")).toBe("Output 1");
  });
});
