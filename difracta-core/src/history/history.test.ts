import { describe, expect, it } from "vitest";

import type { Patch } from "../document/patch.ts";
import { History } from "./history.ts";

function set(path: string[], value: unknown): Patch {
  return { op: "set", path, value };
}

describe("History", () => {
  it("undoes the caller's own last entry and redoes it", () => {
    const history = new History();
    history.push({
      sessionId: "studio",
      label: "A",
      forward: [set(["a"], 1)],
      inverse: [set(["a"], 0)],
    });
    history.push({
      sessionId: "cli",
      label: "B",
      forward: [set(["b"], 1)],
      inverse: [set(["b"], 0)],
    });

    const undone = history.undo("studio");
    expect(undone.ok && undone.entry.label).toBe("A");
    expect(undone.ok && undone.patches).toEqual([set(["a"], 0)]);
    expect(history.peekUndo("studio")).toBeUndefined();
    expect(history.peekUndo("cli")?.label).toBe("B");

    const redone = history.redo("studio");
    expect(redone.ok && redone.patches).toEqual([set(["a"], 1)]);
  });

  it("refuses to undo under a later conflicting change by someone else", () => {
    const history = new History();
    history.push({
      sessionId: "studio",
      label: "Rename",
      forward: [set(["x", "name"], "A")],
      inverse: [set(["x", "name"], "0")],
    });
    history.push({
      sessionId: "cli",
      label: "Remove",
      forward: [{ op: "remove", path: ["x"] }],
      inverse: [set(["x"], { name: "A" })],
    });

    const result = history.undo("studio");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("later change");
    expect(history.undo("cli").ok).toBe(true);
    expect(history.undo("studio").ok).toBe(true);
  });

  it("coalesces consecutive same-key entries from one session", () => {
    const history = new History({ coalesceWindowMs: 1_000 });
    history.push({
      sessionId: "s",
      label: "Rename",
      coalesceKey: "k",
      at: 0,
      forward: [set(["n"], "a")],
      inverse: [set(["n"], "")],
    });
    history.push({
      sessionId: "s",
      label: "Rename",
      coalesceKey: "k",
      at: 500,
      forward: [set(["n"], "ab")],
      inverse: [set(["n"], "a")],
    });
    history.push({
      sessionId: "s",
      label: "Rename",
      coalesceKey: "k",
      at: 5_000,
      forward: [set(["n"], "abc")],
      inverse: [set(["n"], "ab")],
    });

    const late = history.undo("s");
    expect(late.ok && late.patches).toEqual([set(["n"], "ab")]);
    const merged = history.undo("s");
    expect(merged.ok && merged.patches).toEqual([
      set(["n"], "a"),
      set(["n"], ""),
    ]);
  });

  it("clears redo on a new push", () => {
    const history = new History();
    history.push({
      sessionId: "s",
      label: "A",
      forward: [set(["a"], 1)],
      inverse: [set(["a"], 0)],
    });
    history.undo("s");
    history.push({
      sessionId: "s",
      label: "B",
      forward: [set(["b"], 1)],
      inverse: [set(["b"], 0)],
    });
    expect(history.redo("s").ok).toBe(false);
  });
});
