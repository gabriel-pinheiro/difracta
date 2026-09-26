import { DifractaClient } from "@difracta/client";
import { createBuiltInRegistry } from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";
import type {
  ClientKind,
  DisplayAction,
  DisplayHostLive,
  DisplayHostReport,
  DocumentSummary,
  ServerMessage,
} from "@difracta/protocol";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DocumentStore } from "../documents/document-store.ts";
import { buildRuntime, type Runtime } from "../server.ts";
import { DisplayHosts } from "./display-hosts.ts";
import { DisplayRequests } from "./display-requests.ts";

let dir: string;
let runtime: Runtime;
let url: string;
let clients: DifractaClient[];

async function waitFor(done: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!done()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function connect(kind: ClientKind): Promise<DifractaClient> {
  const client = new DifractaClient({ url, kind, reconnect: false });
  clients.push(client);
  await waitFor(() => client.phase.get() === "connected");
  return client;
}

const report: DisplayHostReport = {
  name: "Stage PC",
  displays: [
    {
      id: "1",
      label: "Monitor",
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      scaleFactor: 1,
      primary: true,
      internal: false,
    },
    {
      id: "2",
      label: "Projector",
      bounds: { x: 2560, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
      primary: false,
      internal: false,
    },
  ],
  showing: {},
};

/** A Desktop as the runtime sees it: offers two Displays and keeps track of what they show. */
async function connectHost(): Promise<{
  desktop: DifractaClient;
  actions: DisplayAction[];
}> {
  const desktop = await connect("desktop");
  const actions: DisplayAction[] = [];
  const showing = new Map<string, string>();
  desktop.displayHost.onAction((action) => {
    actions.push(action);
    if (action.action === "show") showing.set(action.display, action.output);
    else if (!showing.delete(action.display))
      return { ok: false, error: "That Display shows nothing." };
    desktop.displayHost.offer({
      ...report,
      showing: Object.fromEntries(showing),
    });
    return { ok: true };
  });
  desktop.displayHost.offer(report);
  return { desktop, actions };
}

/** A Studio with an Installation holding one Output, subscribed with live state. */
async function connectStudio() {
  const studio = await connect("studio");
  const created = await studio.request<DocumentSummary>("documents.new", {
    name: "Living",
  });
  await studio.command(created.id, "output.create", {
    id: "out_a",
    name: "Wall",
  });
  const view = studio.openDocument(created.id, { live: true });
  await waitFor(() => view.get() !== undefined);
  return { studio, view, documentId: created.id };
}

beforeEach(async () => {
  clients = [];
  dir = await mkdtemp(path.join(tmpdir(), "difracta-displays-"));
  runtime = await buildRuntime({
    host: "127.0.0.1",
    port: 0,
    documents: "free",
    openPath: undefined,
    studioDist: undefined,
    outputDist: undefined,
    thumbnailsDir: undefined,
    bundledDir: undefined,
    autosaveIntervalMs: 60_000,
    oscPort: undefined,
    discovery: false,
    mediaAnywhere: false,
  });
  const address = await runtime.listen();
  url = `${address.replace("http", "ws")}/live`;
});

afterEach(async () => {
  for (const client of clients) client.close();
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

describe("Display Hosts over the live socket", () => {
  it("shows a host to every live subscriber and routes show and hide to it", async () => {
    const { studio, view } = await connectStudio();
    const { actions } = await connectHost();
    const hosts = (): Record<string, DisplayHostLive> =>
      view.liveState.get().displayHosts;
    await waitFor(() => hosts()["stage-pc"] !== undefined);
    expect(hosts()["stage-pc"]).toMatchObject({ ...report, id: "stage-pc" });

    const cli = await connect("cli");
    const listed = await cli.request<DisplayHostLive[]>("displays.list", {});
    expect(listed).toEqual([hosts()["stage-pc"]]);

    // By name and label, ignoring case; the reply carries the ids.
    await expect(
      cli.request("displays.show", {
        host: "stage pc",
        display: "projector",
        output: "out_a",
      }),
    ).resolves.toEqual({ host: "stage-pc", display: "2", output: "out_a" });
    expect(actions).toEqual([
      { action: "show", display: "2", output: "out_a" },
    ]);
    await waitFor(() => hosts()["stage-pc"]?.showing["2"] === "out_a");

    await expect(
      studio.request("displays.hide", { host: "stage-pc", display: "2" }),
    ).resolves.toEqual({ host: "stage-pc", display: "2" });
    await waitFor(() => hosts()["stage-pc"]?.showing["2"] === undefined);

    // What the host refuses reaches the requester in the host's words.
    await expect(
      cli.request("displays.hide", { host: "stage-pc", display: "2" }),
    ).rejects.toThrow("That Display shows nothing.");
  });

  it("refuses what it can tell is wrong without asking the host", async () => {
    const { studio } = await connectStudio();
    await expect(
      studio.request("displays.show", {
        host: "stage-pc",
        display: "2",
        output: "out_a",
      }),
    ).rejects.toThrow("No Display Host “stage-pc”: none is connected.");

    const { actions } = await connectHost();
    let listed: unknown[] = [];
    await waitFor(() => {
      void studio
        .request<unknown[]>("displays.list", {})
        .then((hosts) => (listed = hosts));
      return listed.length === 1;
    });
    const show = (payload: { host: string; display: string; output: string }) =>
      studio.request("displays.show", payload);
    await expect(
      show({ host: "foyer", display: "2", output: "out_a" }),
    ).rejects.toThrow("No Display Host “foyer”. Connected: stage-pc.");
    await expect(
      show({ host: "stage-pc", display: "7", output: "out_a" }),
    ).rejects.toThrow(
      "Display Host “stage-pc” has no Display “7”. It has: 1, 2.",
    );
    await expect(
      show({ host: "stage-pc", display: "2", output: "out_gone" }),
    ).rejects.toThrow("Output “out_gone” is not in the open Installation.");
    await expect(
      studio.request("displays.hide", { host: "stage-pc" } as never),
    ).rejects.toThrow("Invalid payload for “displays.hide”");
    expect(actions).toEqual([]);
  });

  it("takes Displays from a Desktop connection only", async () => {
    const { studio, view } = await connectStudio();
    studio.displayHost.offer(report);
    await waitFor(() => studio.lastError.get() !== undefined);
    expect(studio.lastError.get()).toBe(
      "Only a connection of kind “desktop” can be a Display Host; this one is “studio”.",
    );
    expect(view.liveState.get().displayHosts).toEqual({});
    expect(await studio.request("displays.list", {})).toEqual([]);
  });

  it("drops a host with its connection and fails who was waiting for it", async () => {
    const { studio, view } = await connectStudio();
    const { desktop } = await connectHost();
    await waitFor(
      () => view.liveState.get().displayHosts["stage-pc"] !== undefined,
    );
    let asked = false;
    desktop.displayHost.onAction(() => {
      asked = true;
      return new Promise(() => undefined);
    });
    const pending = studio.request("displays.show", {
      host: "stage-pc",
      display: "1",
      output: "out_a",
    });
    await waitFor(() => asked);
    desktop.close();
    await expect(pending).rejects.toThrow(
      "Display Host “stage-pc” disconnected before answering.",
    );
    await waitFor(
      () => view.liveState.get().displayHosts["stage-pc"] === undefined,
    );

    // A host may also step down and keep its connection.
    const { desktop: second } = await connectHost();
    await waitFor(
      () => view.liveState.get().displayHosts["stage-pc"] !== undefined,
    );
    second.displayHost.withdraw();
    await waitFor(
      () => view.liveState.get().displayHosts["stage-pc"] === undefined,
    );
    expect(second.phase.get()).toBe("connected");
  });

  it("keeps hosts when the document is replaced: they belong to connections", async () => {
    const { studio, view, documentId } = await connectStudio();
    const { desktop } = await connectHost();
    await waitFor(
      () => view.liveState.get().displayHosts["stage-pc"] !== undefined,
    );

    // The same Installation id under another session: the view survives and is snapshotted again.
    const file = path.join(dir, "living.difracta");
    await studio.request("documents.save", { documentId, path: file });
    await studio.request("documents.save", {
      documentId,
      path: path.join(dir, "copy.difracta"),
    });
    const before = runtime.store.currentSession();
    await studio.request("documents.open", { path: file });
    expect(runtime.store.currentSession()).not.toBe(before);
    expect(studio.view(documentId)).toBe(view);
    expect(Object.keys(view.liveState.get().displayHosts)).toEqual([
      "stage-pc",
    ]);
    desktop.displayHost.offer({ ...report, showing: { "1": "out_a" } });
    await waitFor(
      () =>
        view.liveState.get().displayHosts["stage-pc"]?.showing["1"] === "out_a",
    );

    // Another Installation: its first snapshot already has the host, and the old Output is refused.
    const next = await studio.request<DocumentSummary>("documents.new", {
      name: "Foyer",
    });
    expect(next.id).not.toBe(documentId);
    const nextView = studio.openDocument(next.id, { live: true });
    await waitFor(() => nextView.get() !== undefined);
    expect(nextView.liveState.get().displayHosts["stage-pc"]).toMatchObject({
      name: "Stage PC",
      showing: { "1": "out_a" },
    });
    await expect(
      studio.request("displays.show", {
        host: "stage-pc",
        display: "1",
        output: "out_a",
      }),
    ).rejects.toThrow("Output “out_a” is not in the open Installation.");
  });
});

describe("a Display Host that does not answer", () => {
  it("fails the request after the timeout and ignores a late or foreign reply", async () => {
    const store = new DocumentStore({
      registry: createBuiltInRegistry(builtInCatalog),
    });
    const created = await store.create("Living");
    if (!created.ok) throw new Error(created.error);
    store
      .session(created.result.id)
      ?.execute("output.create", { id: "out_a", name: "Wall" }, "test");
    const hosts = new DisplayHosts();
    hosts.report("s1", report);
    const sent: ServerMessage[] = [];
    const requests = new DisplayRequests({
      hosts,
      store,
      send: (_sessionId, message) => sent.push(message) > 0,
      timeoutMs: 30,
    });
    const handlers = requests.handlers();
    const show = (): Promise<unknown> =>
      Promise.resolve(
        handlers["displays.show"]({
          host: "stage-pc",
          display: "1",
          output: "out_a",
        }),
      );

    const unanswered = show();
    const [first] = sent;
    if (first?.type !== "display-request") throw new Error("Nothing sent.");
    // Only the asked connection may answer.
    requests.settle("s2", first.requestId, { ok: true });
    await expect(unanswered).resolves.toEqual({
      ok: false,
      error: "Display Host “stage-pc” did not answer.",
    });
    requests.settle("s1", first.requestId, { ok: true });

    const answered = show();
    const second = sent[1];
    if (second?.type !== "display-request") throw new Error("Nothing sent.");
    expect(second.requestId).not.toBe(first.requestId);
    requests.settle("s1", second.requestId, { ok: true });
    await expect(answered).resolves.toEqual({
      ok: true,
      result: { host: "stage-pc", display: "1", output: "out_a" },
    });
    await store.close(created.result.id, true);
  });
});
