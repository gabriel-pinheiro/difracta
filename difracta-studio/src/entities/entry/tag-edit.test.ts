import { describe, expect, it } from "vitest";

import { addTag, removeTag, tagSuggestions } from "./tag-edit";

describe("Editing an entry's tags", () => {
  it("adds a trimmed tag once, in the Pack's spelling", () => {
    expect(addTag(["loop"], " Organic ", ["organic", "loop"])).toEqual([
      "loop",
      "organic",
    ]);
    expect(addTag(["loop"], "LOOP", [])).toEqual(["loop"]);
    expect(addTag(["loop"], "   ", [])).toEqual(["loop"]);
    expect(addTag([], "Riser", [])).toEqual(["Riser"]);
  });

  it("removes a tag whatever its case", () => {
    expect(removeTag(["Loop", "hit"], "loop")).toEqual(["hit"]);
  });

  it("suggests the Pack's other tags, each once, sorted", () => {
    expect(
      tagSuggestions(["organic", "Loop", "hit", "Organic", "riser"], ["loop"]),
    ).toEqual(["hit", "organic", "riser"]);
  });
});
