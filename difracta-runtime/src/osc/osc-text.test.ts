import { createBuiltInRegistry, settings } from "@difracta/core";
import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DocumentStore } from "../documents/document-store.ts";
import type { DocumentSession } from "../documents/document-session.ts";
import { decodePacket, encodeMessage, type OscArgument } from "./osc-codec.ts";
import { OscServer } from "./osc-server.ts";
import { buildTree, controllerArguments, leavesOf } from "./osc-tree.ts";

let store: DocumentStore;
let session: DocumentSession;
let server: OscServer | undefined;
let port: number;
const logged: string[] = [];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function execute(name: string, payload: unknown): void {
  const result = session.execute(name, payload, "test");
  if (!result.ok) throw new Error(result.error);
}

const words = () => session.document.controllers.words;

/** One OSC message to the Text Controller, as a hub would send it. */
function receive(args: readonly OscArgument[]): void {
  server?.receive(encodeMessage({ address: "/controller/words", args }));
}

beforeEach(async () => {
  store = new DocumentStore({
    registry: createBuiltInRegistry(),
    autosaveIntervalMs: 60_000,
    log: () => undefined,
  });
  await store.create("Living", { blank: true });
  const current = store.currentSession();
  if (current === undefined) throw new Error("no session");
  session = current;
  execute("controller.create", { id: "g", kind: "group", name: "Titles" });
  execute("controller.create", {
    id: "words",
    kind: "text",
    name: "Words",
    parentId: "g",
  });
  port = 19_000 + Math.floor(Math.random() * 20_000);
  logged.length = 0;
  server = new OscServer({
    store,
    port,
    host: "127.0.0.1",
    advertise: false,
    log: (line) => logged.push(line),
  });
  await server.start();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("a Text Controller in the OSC tree", () => {
  it("is a string leaf, read and written, with its text as the value", () => {
    execute("address.set", {
      address: "controller/words/value",
      value: "Olá\nmundo",
    });
    expect(leavesOf(session.document).map((leaf) => leaf.node)).toEqual([
      {
        FULL_PATH: "/controller/words",
        DESCRIPTION: "Titles · Words",
        ACCESS: 3,
        TYPE: "s",
        VALUE: ["Olá\nmundo"],
      },
    ]);
    expect(
      buildTree(session.document).CONTENTS?.controller?.CONTENTS?.words,
    ).toMatchObject({ TYPE: "s", VALUE: ["Olá\nmundo"] });
  });

  it("goes out as one string argument, without the NUL that would end it early", () => {
    execute("address.set", {
      address: "controller/words/value",
      value: "one\0two\n",
    });
    const controller = words();
    if (controller === undefined) throw new Error("no Controller");
    expect(controllerArguments(controller)).toEqual([
      { type: "string", value: "onetwo\n" },
    ]);
    expect(leavesOf(session.document)[0]?.node.VALUE).toEqual(["onetwo\n"]);
    expect(
      decodePacket(
        encodeMessage({
          address: "/controller/words",
          args: controllerArguments(controller),
        }),
      ),
    ).toEqual({
      address: "/controller/words",
      args: [{ type: "string", value: "onetwo\n" }],
    });
  });
});

describe("OSC messages to a Text Controller", () => {
  it("write one string argument, line breaks, accents and the empty string included", () => {
    receive([{ type: "string", value: "Olá\nmundo" }]);
    expect(words()).toMatchObject({ value: "Olá\nmundo" });
    receive([{ type: "string", value: "" }]);
    expect(words()).toMatchObject({ value: "" });
    expect(logged).toEqual([]);
  });

  it("refuse anything but one string", () => {
    receive([{ type: "string", value: "kept" }]);
    receive([{ type: "float32", value: 0.5 }]);
    receive([{ type: "int32", value: 3 }]);
    receive([]);
    receive([
      { type: "string", value: "one" },
      { type: "string", value: "two" },
    ]);
    expect(words()).toMatchObject({ value: "kept" });
    // One line per reason per window; the rest are counted, not logged.
    expect(logged).toEqual(["OSC bad-arguments: /controller/words: float32"]);
  });

  it("cut text at the most a Text Controller holds, never through a character", () => {
    const most = settings.text.maxLength;
    receive([{ type: "string", value: "a".repeat(most + 50) }]);
    expect(words()).toMatchObject({ value: "a".repeat(most) });
    // The emoji is two code units and would straddle the limit.
    receive([{ type: "string", value: `${"b".repeat(most - 1)}🎉🎉` }]);
    expect(words()).toMatchObject({ value: "b".repeat(most - 1) });
    receive([{ type: "string", value: `${"c".repeat(most - 2)}🎉` }]);
    expect(words()).toMatchObject({ value: `${"c".repeat(most - 2)}🎉` });
    expect(logged).toEqual([]);
  });
});

describe("the OSCQuery websocket and a Text Controller", () => {
  it("streams the text to who listens and announces the leaf coming, renamed and going", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}`);
    const received: unknown[] = [];
    socket.on("message", (raw, isBinary) => {
      const bytes = raw as Buffer;
      received.push(
        isBinary ? decodePacket(new Uint8Array(bytes)) : bytes.toString(),
      );
    });
    await new Promise((resolve) => socket.once("open", resolve));
    socket.send(
      JSON.stringify({ COMMAND: "LISTEN", DATA: "/controller/words" }),
    );
    await wait(30);
    execute("address.set", {
      address: "controller/words/value",
      value: "Boa noite\nLisboa",
    });
    await wait(60);
    execute("controller.create", { id: "more", kind: "text", name: "More" });
    execute("controller.rename", { controllerId: "words", name: "Title" });
    await wait(60);
    execute("controller.remove", { controllerId: "words" });
    await wait(60);
    expect(received).toEqual([
      {
        address: "/controller/words",
        args: [{ type: "string", value: "Boa noite\nLisboa" }],
      },
      '{"COMMAND":"PATH_ADDED","DATA":"/controller/more"}',
      '{"COMMAND":"PATH_CHANGED","DATA":"/controller/words"}',
      '{"COMMAND":"PATH_REMOVED","DATA":"/controller/words"}',
    ]);
    socket.send(
      encodeMessage({
        address: "/controller/more",
        args: [{ type: "string", value: "from the hub" }],
      }),
      { binary: true },
    );
    await wait(50);
    expect(session.document.controllers.more).toMatchObject({
      value: "from the hub",
    });
    socket.close();
    await wait(30);
  });
});
