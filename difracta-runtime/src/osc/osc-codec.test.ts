import { describe, expect, it } from "vitest";

import { decodePacket, encodeMessage, messagesOf } from "./osc-codec.ts";

describe("OSC codec", () => {
  it("round-trips every argument type", () => {
    const message = {
      address: "/controller/energy",
      args: [
        { type: "int32", value: 7 },
        { type: "float32", value: 0.5 },
        { type: "double", value: 1.25 },
        { type: "int64", value: 9 },
        { type: "string", value: "hello" },
        { type: "blob", value: Uint8Array.from([1, 2, 3, 4, 5]) },
        { type: "color", value: [255, 102, 0, 255] },
        { type: "timetag", value: 1n },
        { type: "true" },
        { type: "false" },
        { type: "nil" },
        { type: "impulse" },
      ],
    } as const;
    const bytes = encodeMessage(message);
    expect(bytes.length % 4).toBe(0);
    expect(decodePacket(bytes)).toEqual(message);
  });

  it("reads a bundle's messages in order and a bare address without tags", () => {
    const first = encodeMessage({
      address: "/macro/hit",
      args: [],
    });
    const second = encodeMessage({
      address: "/controller/a",
      args: [{ type: "float32", value: 1 }],
    });
    const header = new TextEncoder().encode("#bundle\0");
    const timetag = new Uint8Array(8);
    const size = (bytes: Uint8Array): Uint8Array => {
      const out = new Uint8Array(4);
      new DataView(out.buffer).setInt32(0, bytes.length);
      return out;
    };
    const bundle = Uint8Array.from([
      ...header,
      ...timetag,
      ...size(first),
      ...first,
      ...size(second),
      ...second,
    ]);
    expect(messagesOf(decodePacket(bundle)).map((m) => m.address)).toEqual([
      "/macro/hit",
      "/controller/a",
    ]);
    expect(decodePacket(new TextEncoder().encode("/macro/x\0\0\0\0"))).toEqual({
      address: "/macro/x",
      args: [],
    });
    expect(() =>
      decodePacket(new TextEncoder().encode("nope\0\0\0\0")),
    ).toThrow(/address/);
  });
});
