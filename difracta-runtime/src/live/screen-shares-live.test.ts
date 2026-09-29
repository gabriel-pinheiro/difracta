import {
  DifractaClient,
  type ShareEnd,
  type ShareViewerChange,
} from "@difracta/client";
import type {
  ClientKind,
  DocumentSummary,
  ShareViewing,
} from "@difracta/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRuntime, type Runtime } from "../server.ts";

let dir: string;
let runtime: Runtime;
let address: string;
let clients: DifractaClient[];

async function waitFor(done: () => boolean, timeoutMs = 3_000): Promise<void> {
  const started = Date.now();
  while (!done()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A client whose socket the test can drop, to see it reconnect. */
async function connect(
  kind: ClientKind,
  options: { actor?: string; reconnect?: boolean } = {},
): Promise<{ client: DifractaClient; drop: () => void }> {
  let socket: WebSocket | undefined;
  const client = new DifractaClient({
    url: `${address.replace("http", "ws")}/live`,
    kind,
    reconnect: options.reconnect ?? false,
    ...(options.actor === undefined ? {} : { actor: options.actor }),
    createSocket: (url) => (socket = new WebSocket(url)),
  });
  clients.push(client);
  await waitFor(() => client.phase.get() === "connected");
  return { client, drop: () => socket?.close() };
}

/** A Studio with an Installation holding a Screen Share `m_slides` and a file, watching the live state. */
async function studio() {
  const { client } = await connect("studio");
  const created = await client.request<DocumentSummary>("documents.new", {
    name: "Living",
    blank: true,
  });
  await client.command(created.id, "media.create", {
    id: "m_slides",
    kind: "share",
    name: "Slides",
  });
  await client.command(created.id, "media.create", {
    id: "m_logo",
    path: "logo.png",
  });
  const view = client.openDocument(created.id, { live: true });
  await waitFor(() => view.get() !== undefined);
  const slot = () => view.liveState.get().media.m_slides;
  return { client, view, documentId: created.id, slot };
}

/** What a client's Viewer side heard of `m_slides`, and its payloads. */
function watchViewer(client: DifractaClient) {
  const states: ShareViewing[] = [];
  const payloads: unknown[] = [];
  client.viewing.onViewing((_id, viewing) => states.push(viewing));
  client.viewing.onSignal((_id, payload) => payloads.push(payload));
  return { states, payloads };
}

function watchSharer(client: DifractaClient) {
  const viewers: ShareViewerChange[] = [];
  const ends: ShareEnd[] = [];
  const payloads: [string, unknown][] = [];
  client.sharing.onViewer((change) => viewers.push(change));
  client.sharing.onEnded((end) => ends.push(end));
  client.sharing.onSignal((_id, viewerId, payload) =>
    payloads.push([viewerId, payload]),
  );
  return { viewers, ends, payloads };
}

beforeEach(async () => {
  clients = [];
  dir = await mkdtemp(path.join(tmpdir(), "difracta-shares-"));
  runtime = await buildRuntime({
    host: "127.0.0.1",
    port: 0,
    documents: "free",
    openPath: undefined,
    studioDist: undefined,
    outputDist: undefined,
    thumbnailsDir: undefined,
    fontsDir: undefined,
    bundledDir: undefined,
    autosaveIntervalMs: 60_000,
    oscPort: undefined,
    discovery: false,
    mediaAnywhere: false,
  });
  address = await runtime.listen();
});

afterEach(async () => {
  for (const client of clients) client.close();
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe("Screen Shares over the live socket", () => {
  it("relays between a Sharer and two Viewers and shows one status per Media item", async () => {
    const { slot, view } = await studio();
    expect(slot()).toEqual({ status: "idle" });
    await waitFor(() => view.liveState.get().media.m_logo !== undefined);
    expect(view.liveState.get().media.m_logo).toEqual({ status: "unsaved" });

    const { client: one } = await connect("output");
    const { client: two } = await connect("studio");
    const heardOne = watchViewer(one);
    const heardTwo = watchViewer(two);
    one.viewing.view("m_slides");
    await waitFor(() => heardOne.states.length === 1);
    expect(heardOne.states).toEqual([{ status: "idle" }]);

    const { client: desktop } = await connect("desktop");
    const sharer = watchSharer(desktop);
    desktop.sharing.share("m_slides", { sharer: "Laptop", source: "window" });
    two.viewing.view("m_slides");
    await waitFor(() => sharer.viewers.length === 2);
    const [first, second] = sharer.viewers;
    expect(first).toEqual({
      mediaId: "m_slides",
      viewerId: one.sessionId.get(),
      joined: true,
    });
    expect(second?.viewerId).toBe(two.sessionId.get());
    await waitFor(() => slot()?.status === "live" && "viewers" in slot()!);
    await waitFor(() => (slot() as { viewers: number }).viewers === 2);
    expect(slot()).toMatchObject({ sharer: "Laptop", source: "window" });

    desktop.sharing.signal("m_slides", first!.viewerId, { sdp: "offer 1" });
    desktop.sharing.signal("m_slides", second!.viewerId, { sdp: "offer 2" });
    one.viewing.signal("m_slides", { sdp: "answer 1" });
    two.viewing.signal("m_slides", { candidate: "c2" });
    await waitFor(
      () =>
        sharer.payloads.length === 2 &&
        heardOne.payloads.length === 1 &&
        heardTwo.payloads.length === 1,
    );
    expect(heardOne.payloads).toEqual([{ sdp: "offer 1" }]);
    expect(heardTwo.payloads).toEqual([{ sdp: "offer 2" }]);
    expect(sharer.payloads).toEqual(
      expect.arrayContaining([
        [first!.viewerId, { sdp: "answer 1" }],
        [second!.viewerId, { candidate: "c2" }],
      ]),
    );

    // Asking for a new offer announces the Viewer again; closing a Viewer says it left.
    one.viewing.requestOffer("m_slides");
    two.close();
    await waitFor(() => sharer.viewers.length === 4);
    expect(sharer.viewers.slice(2)).toEqual(
      expect.arrayContaining([
        { mediaId: "m_slides", viewerId: first!.viewerId, joined: true },
        { mediaId: "m_slides", viewerId: second!.viewerId, joined: false },
      ]),
    );
    await waitFor(() => (slot() as { viewers: number }).viewers === 1);

    // A payload past the size bound never leaves the client.
    expect(() =>
      one.viewing.signal("m_slides", "x".repeat(70 * 1024)),
    ).toThrow();
  });

  it("stops by request from another client and ends when the slot is removed", async () => {
    const { client: owner, documentId, slot } = await studio();
    const { client: desktop } = await connect("desktop");
    const sharer = watchSharer(desktop);
    desktop.sharing.share("m_slides", { sharer: "Laptop", source: "screen" });
    await waitFor(() => slot()?.status === "live");

    const { client: cli } = await connect("cli");
    await expect(
      cli.request("shares.stop", { mediaId: "m_slides" }),
    ).resolves.toEqual({ mediaId: "m_slides", sharer: "Laptop" });
    await waitFor(() => sharer.ends.length === 1);
    expect(sharer.ends[0]).toMatchObject({ reason: "stopped" });
    expect(desktop.sharing.slots()).toEqual([]);
    await waitFor(() => slot()?.status === "idle");
    await expect(
      cli.request("shares.stop", { mediaId: "m_slides" }),
    ).rejects.toThrow("Nobody shares into “Slides”.");

    desktop.sharing.share("m_slides", { sharer: "Laptop", source: "screen" });
    await waitFor(() => slot()?.status === "live");
    await owner.command(documentId, "media.remove", { mediaId: "m_slides" });
    await waitFor(() => sharer.ends.length === 2);
    expect(sharer.ends[1]).toMatchObject({ reason: "removed" });
    await waitFor(() => slot() === undefined);
  });

  it("keeps a share through Save As and reopening, and ends it for another Installation", async () => {
    const { client: owner, documentId, view, slot } = await studio();
    const { client: desktop } = await connect("desktop");
    const sharer = watchSharer(desktop);
    desktop.sharing.share("m_slides", { sharer: "Laptop", source: "screen" });
    await waitFor(() => slot()?.status === "live");

    const file = path.join(dir, "living.difracta");
    await owner.request("documents.save", { documentId, path: file });
    await owner.request("documents.save", {
      documentId,
      path: path.join(dir, "copy.difracta"),
    });
    await owner.request("documents.open", { path: file });
    await owner.request("documents.revert", { documentId });
    await waitFor(() => view.get() !== undefined);
    expect(slot()).toMatchObject({ status: "live", sharer: "Laptop" });
    expect(sharer.ends).toEqual([]);

    await owner.request("documents.new", { name: "Foyer", discard: true });
    await waitFor(() => sharer.ends.length === 1);
    expect(sharer.ends[0]).toMatchObject({ reason: "removed" });
  });

  it("serves no file for a Screen Share", async () => {
    await studio();
    const response = await fetch(`${address}/media/m_slides`);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "“Slides” is a Screen Share, which has no file.",
    });
  });

  it("declares again and views again by itself after a reconnect", async () => {
    const { slot } = await studio();
    const desk = await connect("desktop", { actor: "desk", reconnect: true });
    const eye = await connect("output", { reconnect: true });
    const sharer = watchSharer(desk.client);
    const heard = watchViewer(eye.client);
    desk.client.sharing.share("m_slides", {
      sharer: "Laptop",
      source: "window",
    });
    eye.client.viewing.view("m_slides");
    await waitFor(() => sharer.viewers.length === 1);
    const since = (slot() as { since: number }).since;

    desk.drop();
    await waitFor(() => slot()?.status === "interrupted");
    await waitFor(() => heard.states.at(-1)?.status === "interrupted");
    await waitFor(() => slot()?.status === "live");
    expect(slot()).toMatchObject({ since, viewers: 1 });
    expect(heard.states.at(-1)?.status).toBe("live");

    // The Viewer comes back under a new id: the Sharer hears it leave and join.
    const before = eye.client.sessionId.get();
    eye.drop();
    await waitFor(
      () =>
        eye.client.sessionId.get() !== before &&
        sharer.viewers.some(
          (change) =>
            change.joined && change.viewerId === eye.client.sessionId.get(),
        ),
    );
    expect(sharer.viewers).toContainEqual({
      mediaId: "m_slides",
      viewerId: before,
      joined: false,
    });
    expect(sharer.ends).toEqual([]);
  });
});
