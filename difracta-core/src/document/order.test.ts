import { describe, expect, it } from "vitest";

import {
  appendOrderKey,
  DEFAULT_ORDER_KEY,
  orderedEntries,
  orderKeysForMove,
} from "./order.ts";

const table = {
  b: { id: "b", order: "a1" },
  a: { id: "a", order: "a0" },
  c: { id: "c", order: "a2" },
};

describe("order keys", () => {
  it("sorts by key, then by id for ties", () => {
    expect(orderedEntries(table).map((entity) => entity.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    const tied = { y: { id: "y", order: "a0" }, x: { id: "x", order: "a0" } };
    expect(orderedEntries(tied).map((entity) => entity.id)).toEqual(["x", "y"]);
  });

  it("appends after the last key and starts from the default", () => {
    expect(appendOrderKey({})).toBe(DEFAULT_ORDER_KEY);
    expect(appendOrderKey(table) > "a2").toBe(true);
  });

  it("moves with a single key between the new neighbours", () => {
    const siblings = orderedEntries({ a: table.a, b: table.b });
    const changes = orderKeysForMove(siblings, table.c, "a");
    expect([...changes.keys()]).toEqual(["c"]);
    const key = changes.get("c") ?? "";
    expect(key > "a0" && key < "a1").toBe(true);
    expect([...orderKeysForMove(siblings, table.c, null).keys()]).toEqual([
      "c",
    ]);
  });

  it("renumbers everyone when the neighbours tie", () => {
    const tied = orderedEntries({
      a: { id: "a", order: "a0" },
      b: { id: "b", order: "a0" },
    });
    const changes = orderKeysForMove(tied, { id: "c", order: "a0" }, "a");
    const keyOf = (id: string) => changes.get(id) ?? "a0";
    expect(changes.size).toBeGreaterThanOrEqual(2);
    expect(keyOf("a") < keyOf("c") && keyOf("c") < keyOf("b")).toBe(true);
  });
});
