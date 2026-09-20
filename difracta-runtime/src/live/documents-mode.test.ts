import { DifractaClient } from "@difracta/client";
import { createBuiltInRegistry, emptyCatalog } from "@difracta/core";
import { PROTOCOL_VERSION, type DocumentsMode } from "@difracta/protocol";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";

import { DocumentStore } from "../documents/document-store.ts";
import { buildRuntime } from "../server.ts";
import { documentsModeFor } from "./documents-mode.ts";
import { FakeSocket } from "./fake-socket.ts";
import { LiveServer } from "./live-server.ts";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-mode-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A store holding `living.difracta`, and a peer of a runtime in `mode`. */
async function connect(mode: DocumentsMode, remoteAddress: string | undefined) {
  const store = new DocumentStore({ registry: createBuiltInRegistry() });
  const filePath = path.join(dir, "living.difracta");
  const opened = await store.openOrCreate(filePath);
  const documentId = opened.ok ? opened.result.id : "";
  const live = new LiveServer({
    store,
    catalog: emptyCatalog,
    runtimeName: "test",
    runtimeVersion: "0",
    documents: mode,
    log: () => undefined,
  });
  const socket = new FakeSocket();
  live.accept(socket as unknown as WebSocket, remoteAddress);
  socket.receive({
    type: "hello",
    protocolVersion: PROTOCOL_VERSION,
    client: { kind: "cli" },
  });
  let counter = 0;
  const request = async (name: string, payload: unknown) => {
    counter += 1;
    const requestId = `r${String(counter)}`;
    socket.receive({ type: "request", requestId, name, payload });
    // Requests reply after the store's file work.
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const found = socket.sent.find(
        (message) =>
          message.type === "reply" && message.requestId === requestId,
      );
      if (found?.type === "reply") return found.outcome;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`No reply to ${name}.`);
  };
  return { store, live, socket, request, documentId, filePath };
}

describe("document modes", () => {
  it("gives the free mode to loopback peers of a free runtime only", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      expect(documentsModeFor("free", address)).toBe("free");
      expect(documentsModeFor("pinned", address)).toBe("pinned");
    }
    expect(documentsModeFor("free", "192.168.1.20")).toBe("pinned");
    expect(documentsModeFor("free", "::ffff:192.168.1.20")).toBe("pinned");
    expect(documentsModeFor("free", undefined)).toBe("pinned");
  });

  it("a pinned runtime keeps its file: new, open, close and save as are refused", async () => {
    const { live, socket, request, documentId, filePath, store } =
      await connect("pinned", "127.0.0.1");
    expect(socket.sent[0]).toMatchObject({
      type: "welcome",
      documents: "pinned",
    });

    for (const [name, payload] of [
      ["documents.new", { name: "Other" }],
      ["documents.open", { path: path.join(dir, "other.difracta") }],
      ["documents.close", { documentId }],
      ["documents.save", { documentId, path: path.join(dir, "copy") }],
    ] as const) {
      const outcome = await request(name, payload);
      expect(outcome.ok).toBe(false);
      expect(!outcome.ok && outcome.error).toContain("pinned");
    }
    expect(store.current()).toMatchObject({ id: documentId, path: filePath });

    store
      .currentSession()!
      .execute("installation.rename", { name: "Living Room" }, "test");
    expect((await request("documents.save", { documentId })).ok).toBe(true);
    // Its own path is a plain save, with or without the extension.
    const same = await request("documents.save", {
      documentId,
      path: path.join(dir, "living"),
    });
    expect(same.ok).toBe(true);
    expect(await readFile(filePath, "utf8")).toContain("Living Room");
    expect((await request("documents.revert", { documentId })).ok).toBe(true);
    live.close();
  });

  it("a free runtime lets a loopback peer replace the document", async () => {
    const { live, socket, request, documentId } = await connect(
      "free",
      "::ffff:127.0.0.1",
    );
    expect(socket.sent[0]).toMatchObject({
      type: "welcome",
      documents: "free",
    });
    const copy = await request("documents.save", {
      documentId,
      path: path.join(dir, "copy"),
    });
    expect(copy.ok && copy.result).toMatchObject({
      path: path.join(dir, "copy.difracta"),
    });
    expect((await request("documents.new", { name: "Other" })).ok).toBe(true);
    expect(
      (await request("documents.open", { path: path.join(dir, "living") })).ok,
    ).toBe(true);
    expect((await request("documents.close", { documentId })).ok).toBe(true);
    live.close();
  });

  it("a free runtime treats a peer from elsewhere as pinned", async () => {
    const { live, socket, request, documentId } = await connect(
      "free",
      "192.168.1.20",
    );
    expect(socket.sent[0]).toMatchObject({
      type: "welcome",
      documents: "pinned",
    });
    expect((await request("documents.new", { name: "Other" })).ok).toBe(false);
    expect((await request("documents.save", { documentId })).ok).toBe(true);
    live.close();
  });

  it("a pinned runtime creates its file at start and tells clients its mode", async () => {
    const filePath = path.join(dir, "shows", "tonight.difracta");
    const runtime = await buildRuntime({
      host: "127.0.0.1",
      port: 0,
      documents: "pinned",
      openPath: filePath,
      studioDist: undefined,
      outputDist: undefined,
      autosaveIntervalMs: 60_000,
      oscPort: undefined,
      discovery: false,
    });
    const address = await runtime.listen();
    expect(runtime.store.current()).toMatchObject({
      name: "tonight",
      path: filePath,
      dirty: false,
    });
    expect(await readFile(filePath, "utf8")).toContain('"name": "tonight"');

    const client = new DifractaClient({
      url: `${address.replace("http", "ws")}/live`,
      kind: "cli",
      reconnect: false,
    });
    await new Promise<void>((resolve) => {
      client.phase.subscribe((phase) => {
        if (phase === "connected") resolve();
      });
    });
    expect(client.documents.get()).toBe("pinned");
    await expect(
      client.request("documents.new", { name: "Other" }),
    ).rejects.toThrow(/pinned/);
    client.close();
    await runtime.close();
  });

  it("a pinned runtime refuses to start on a file it cannot read", async () => {
    const filePath = path.join(dir, "broken.difracta");
    await writeFile(filePath, "nope");
    const runtime = await buildRuntime({
      host: "127.0.0.1",
      port: 0,
      documents: "pinned",
      openPath: filePath,
      studioDist: undefined,
      outputDist: undefined,
      autosaveIntervalMs: 60_000,
      oscPort: undefined,
      discovery: false,
    });
    await expect(runtime.listen()).rejects.toThrow(/broken\.difracta/);
    await runtime.close();
  });
});
