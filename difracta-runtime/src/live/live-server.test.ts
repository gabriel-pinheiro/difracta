import { DifractaClient } from "@difracta/client";
import {
  createBuiltInRegistry,
  defineCommand,
  emptyCatalog,
  type CommandDefinition,
} from "@difracta/core";
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from "@difracta/protocol";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { z } from "zod";

import { DocumentStore } from "../documents/document-store.ts";
import { buildRuntime, type Runtime } from "../server.ts";
import { LiveServer } from "./live-server.ts";

/** A `ws` socket as the LiveServer sees it, driven from the test. */
class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  readonly sent: ServerMessage[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMessage);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  receive(message: ClientMessage): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }

  reply(requestId: string): Extract<ServerMessage, { type: "reply" }> {
    const found = this.sent.find(
      (message) => message.type === "reply" && message.requestId === requestId,
    );
    if (found?.type !== "reply") throw new Error(`No reply to ${requestId}.`);
    return found;
  }
}

let dir: string;
let runtime: Runtime;
let url: string;

function waitFor<TValue>(
  read: () => TValue | undefined,
  timeoutMs = 2_000,
): Promise<TValue> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = (): void => {
      const value = read();
      if (value !== undefined) resolve(value);
      else if (Date.now() - started > timeoutMs)
        reject(new Error("Timed out."));
      else setTimeout(tick, 10);
    };
    tick();
  });
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-live-"));
  runtime = await buildRuntime({
    host: "127.0.0.1",
    port: 0,
    projectsDir: dir,
    openPath: undefined,
    studioDist: undefined,
    outputDist: undefined,
    autosaveIntervalMs: 60_000,
    oscPort: undefined,
  });
  const address = await runtime.listen();
  url = `${address.replace("http", "ws")}/live`;
});

afterEach(async () => {
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe("live protocol", () => {
  it("replicates commands as deltas to every subscriber and supports undo", async () => {
    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
      scheduleFlush: (flush) => setTimeout(flush, 0),
    });
    const output = new DifractaClient({
      url,
      kind: "output",
      reconnect: false,
    });
    await waitFor(() =>
      studio.phase.get() === "connected" ? true : undefined,
    );
    await waitFor(() =>
      output.phase.get() === "connected" ? true : undefined,
    );

    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Living",
    });
    await waitFor(() => output.document.get() ?? undefined);

    const studioView = studio.openDocument(created.id);
    const outputView = output.openDocument(created.id);
    await waitFor(() => outputView.get());

    const names: (string | undefined)[] = [];
    outputView.subscribePath(["outputs"], () =>
      names.push(
        Object.values(outputView.get()?.outputs ?? {})
          .map((o) => o.name)
          .join(","),
      ),
    );

    const reply = await studio.command<{ revision: number; changed: boolean }>(
      created.id,
      "output.create",
      { id: "out_a", name: "TV" },
    );
    expect(reply).toMatchObject({ revision: 1, changed: true });
    // The caller's own delta precedes its reply, so the view already has it.
    expect(studioView.get()?.outputs.out_a?.name).toBe("TV");
    await waitFor(() => (outputView.revision.get() === 1 ? true : undefined));
    expect(names).toEqual(["TV"]);
    expect(studioView.get()?.outputs.out_a?.name).toBe("TV");

    // Performance input: no reply, replicated, not undoable.
    studio.input(created.id, "installation/blackout", true);
    await waitFor(() =>
      outputView.get()?.operational.blackout === true ? true : undefined,
    );
    expect(studioView.get()?.operational.blackout).toBe(true);

    const undo = await studio.command<{ label: string }>(
      created.id,
      "history.undo",
      {},
    );
    expect(undo.label).toBe("Create Output “TV”");
    await waitFor(() =>
      outputView.get()?.outputs.out_a === undefined ? true : undefined,
    );
    expect(outputView.get()?.operational.blackout).toBe(true);

    await expect(
      studio.command(created.id, "output.rename", {
        outputId: "missing",
        name: "x",
      }),
    ).rejects.toThrow("does not exist");

    studio.close();
    output.close();
  });

  it("clears Calibration Mode when the session that entered it closes", async () => {
    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    const watcher = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    await waitFor(() =>
      studio.phase.get() === "connected" ? true : undefined,
    );
    await waitFor(() =>
      watcher.phase.get() === "connected" ? true : undefined,
    );
    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Living",
    });
    await studio.command(created.id, "output.create", {
      id: "out_a",
      name: "TV",
    });
    await studio.command(created.id, "surface.create", {
      id: "sur_a",
      name: "Wall",
    });
    await studio.command(created.id, "calibration.set", {
      surfaceId: "sur_a",
      maskId: null,
      pathId: null,
      corner: "topLeft",
      point: null,
      view: "selected",
      owner: studio.sessionId.get(),
    });
    await waitFor(() => watcher.document.get() ?? undefined);
    const view = watcher.openDocument(created.id);
    await waitFor(() =>
      view.get()?.operational.calibration?.surfaceId === "sur_a"
        ? true
        : undefined,
    );
    studio.close();
    await waitFor(() =>
      view.get()?.operational.calibration === null ? true : undefined,
    );
    watcher.close();
  });

  it("tracks Output Sessions in the live root for live subscribers only", async () => {
    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    const page = new DifractaClient({ url, kind: "output", reconnect: false });
    await waitFor(() =>
      studio.phase.get() === "connected" ? true : undefined,
    );
    await waitFor(() => (page.phase.get() === "connected" ? true : undefined));
    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Living",
    });
    await studio.command(created.id, "output.create", {
      id: "out_a",
      name: "TV",
    });

    const studioView = studio.openDocument(created.id, { live: true });
    const pageView = page.openDocument(created.id);
    await waitFor(() => studioView.get());
    await waitFor(() => pageView.get());

    page.attach("out_a");
    const pageSessionId = page.sessionId.get() ?? "";
    await waitFor(() =>
      studioView.valueAt([
        "live",
        "outputs",
        "out_a",
        "sessions",
        pageSessionId,
      ]),
    );
    page.report({
      width: 1920,
      height: 1080,
      pixelRatio: 1,
      frameIntervalMs: 16.7,
      renderWorkMs: 1.5,
      workload: {
        canvasVisuals: { executedPerFrame: 0, enabled: 0, relevant: 0 },
        shaderVisuals: { executedPerFrame: 0, enabled: 0, relevant: 0 },
        filters: { executedPerFrame: 0, enabled: 0, relevant: 0 },
      },
    });
    await waitFor(
      () =>
        studioView.valueAt<{ telemetry: { width: number } | null }>([
          "live",
          "outputs",
          "out_a",
          "sessions",
          pageSessionId,
        ])?.telemetry ?? undefined,
    );
    expect(studioView.revision.get()).toBe(1);
    // The Output page did not ask for live state and never receives it.
    expect(pageView.liveState.get()).toEqual({
      osc: { port: null, listeners: 0 },
      outputs: {},
    });

    // Removing the Output drops its sessions; closing the page drops the rest.
    await studio.command(created.id, "output.remove", { outputId: "out_a" });
    await waitFor(() =>
      studioView.valueAt(["live", "outputs", "out_a"]) === undefined
        ? true
        : undefined,
    );
    studio.close();
    page.close();
  });

  it("replaces the document and refuses to drop unsaved changes silently", async () => {
    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    await waitFor(() =>
      studio.phase.get() === "connected" ? true : undefined,
    );
    const first = await studio.request<{ id: string }>("documents.new", {
      name: "First",
    });
    await expect(
      studio.request("documents.new", { name: "Second" }),
    ).rejects.toThrow("unsaved changes");
    const second = await studio.request<{ id: string }>("documents.new", {
      name: "Second",
      discard: true,
    });
    await waitFor(() =>
      studio.document.get()?.id === second.id ? true : undefined,
    );
    expect(second.id).not.toBe(first.id);
    studio.close();
  });

  it("announces fired Cues to every subscriber without touching the document", async () => {
    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    const output = new DifractaClient({
      url,
      kind: "output",
      reconnect: false,
    });
    await waitFor(() =>
      studio.phase.get() === "connected" && output.phase.get() === "connected"
        ? true
        : undefined,
    );
    const created = await studio.request<{ id: string }>("documents.new", {
      name: "Living",
    });
    await waitFor(() => output.document.get() ?? undefined);
    const outputView = output.openDocument(created.id);
    await waitFor(() => outputView.get());
    const heard: string[] = [];
    outputView.subscribeEvents((address) => heard.push(address));
    for (const [name, payload] of [
      ["scene.create", { id: "s", name: "Live" }],
      ["layer.create", { id: "v", sceneId: "s", kind: "visual" }],
      ["layer.visual", { layerId: "v", visual: "thunder" }],
    ] as const)
      await studio.command(created.id, name, payload);
    const before = await studio.command<{ revision: number }>(
      created.id,
      "address.trigger",
      { address: "layer/v/cue/flash" },
    );
    await waitFor(() => (heard.length === 1 ? true : undefined));
    expect(heard).toEqual(["layer/v/cue/flash"]);
    expect(before.revision).toBe(outputView.revision.get());
    await expect(
      studio.command(created.id, "address.trigger", {
        address: "layer/v/cue/x",
      }),
    ).rejects.toThrow("Unknown address");
    studio.close();
    output.close();
  });

  it("answers a command whose apply throws with ok:false and keeps serving", async () => {
    const registry = createBuiltInRegistry();
    registry.register(
      defineCommand({
        name: "test.explode",
        kind: "authoring",
        description: "Throws inside apply.",
        payload: z.object({}).strict(),
        apply() {
          throw new Error("boom");
        },
      }) as unknown as CommandDefinition<never>,
    );
    const store = new DocumentStore({ projectsDir: dir, registry });
    const logged: string[] = [];
    const live = new LiveServer({
      store,
      catalog: emptyCatalog,
      runtimeName: "test",
      runtimeVersion: "0",
      log: (message) => logged.push(message),
    });
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    const socket = new FakeSocket();
    live.accept(socket as unknown as WebSocket);
    socket.receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      client: { kind: "cli" },
    });

    socket.receive({
      type: "command",
      requestId: "r1",
      documentId,
      name: "test.explode",
      payload: {},
    });
    expect(socket.reply("r1").outcome).toEqual({
      ok: false,
      error: "Command “test.explode” failed inside the runtime: boom",
    });
    expect(logged).toEqual(["command “test.explode” threw: boom"]);

    socket.receive({
      type: "command",
      requestId: "r2",
      documentId,
      name: "output.create",
      payload: { id: "out_a", name: "TV" },
    });
    expect(socket.reply("r2").outcome).toEqual({
      ok: true,
      result: {
        revision: 1,
        changed: true,
        label: "Create Output “TV”",
        created: [{ table: "outputs", id: "out_a" }],
      },
    });
    expect(socket.readyState).toBe(socket.OPEN);
    live.close();
  });

  it("replies with every payload issue, for commands and requests alike", async () => {
    const store = new DocumentStore({
      projectsDir: dir,
      registry: createBuiltInRegistry(),
    });
    const live = new LiveServer({
      store,
      catalog: emptyCatalog,
      runtimeName: "test",
      runtimeVersion: "0",
      log: () => undefined,
    });
    const created = await store.create("Living");
    const documentId = created.ok ? created.result.id : "";
    const socket = new FakeSocket();
    live.accept(socket as unknown as WebSocket);
    socket.receive({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      client: { kind: "cli" },
    });
    socket.receive({
      type: "command",
      requestId: "r1",
      documentId,
      name: "output.create",
      payload: { name: 3, limitPixelRatio: "yes" },
    });
    expect(socket.reply("r1").outcome).toEqual({
      ok: false,
      error:
        'Invalid payload for “output.create”: payload.name: Invalid input: expected string, received number; payload: Unrecognized key: "limitPixelRatio"',
      issues: [
        "payload.name: Invalid input: expected string, received number",
        'payload: Unrecognized key: "limitPixelRatio"',
      ],
    });
    socket.receive({
      type: "request",
      requestId: "r2",
      name: "documents.save",
      payload: { path: 1 },
    });
    expect(socket.reply("r2").outcome).toEqual({
      ok: false,
      error:
        "Invalid payload for “documents.save”: payload.documentId: Invalid input: expected string, received undefined; payload.path: Invalid input: expected string, received number",
      issues: [
        "payload.documentId: Invalid input: expected string, received undefined",
        "payload.path: Invalid input: expected string, received number",
      ],
    });
    live.close();
  });

  it("reports the Catalog as metadata without implementations", async () => {
    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    await waitFor(() =>
      studio.phase.get() === "connected" ? true : undefined,
    );
    const catalog = await studio.request<{
      visuals: Record<string, unknown>[];
      filters: Record<string, unknown>[];
    }>("catalog.list", {});
    expect(catalog.visuals.map((visual) => visual.id)).toEqual([
      "barcode-runner",
      "beam-web",
      "blink",
      "bubbles",
      "chevron-flight",
      "contour-drift",
      "conveyor",
      "flash-matrix",
      "frame-electric",
      "gradient",
      "koi-pond",
      "lightning-strikes",
      "moving-head-spot",
      "pixel-bar",
      "radial-streaks",
      "scanner-shot",
      "solid-color",
      "spot",
      "star-field",
      "strobe",
      "tension-lines",
      "thunder",
      "tunnel",
      "water-caustics",
    ]);
    expect(catalog.filters.map((filter) => filter.id)).toEqual([
      "impact-shake",
      "signal-distortion",
      "tile-scramble",
    ]);
    expect(catalog.filters[0]).not.toHaveProperty("fragment");
    const koi = catalog.visuals.find((visual) => visual.id === "koi-pond")!;
    expect(koi.parameters).toHaveProperty("speed");
    expect(koi).not.toHaveProperty("create");
    expect(typeof koi.notes).toBe("string");
    studio.close();
  });
});
