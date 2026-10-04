import { describe, expect, it } from "vitest";

import { FOLDER_GATE_REASON, folderGate } from "./pack-gate";

describe("Naming a folder on the runtime's disk", () => {
  it("is allowed with the Desktop bridge or a free loopback connection, refused with a reason elsewhere", () => {
    expect(folderGate(true, false)).toBeUndefined();
    expect(folderGate(false, true)).toBeUndefined();
    expect(folderGate(true, true)).toBeUndefined();
    expect(folderGate(false, false)).toBe(FOLDER_GATE_REASON);
  });
});
