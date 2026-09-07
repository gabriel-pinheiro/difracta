import { emptyDocument } from "@difracta/core";
import type { ClientMessage, ServerMessage } from "@difracta/protocol";
import { describe, expect, it, vi } from "vitest";

import { DifractaClient } from "./client.ts";

/** A scripted WebSocket: records what the client sends, lets the test reply. */
class FakeSocket {
  readyState: number = WebSocket.CONNECTING;
  readonly sent: ClientMessage[] = [];
  readonly #listeners = new Map<string, ((event: unknown) => void)[]>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as ClientMessage);
  }

  close(): void {
    this.readyState = WebSocket.CLOSED;
    this.#emit("close", {});
  }

  open(): void {
    this.readyState = WebSocket.OPEN;
    this.#emit("open", {});
  }

  receive(message: ServerMessage): void {
    this.#emit("message", { data: JSON.stringify(message) });
  }

  #emit(type: string, event: unknown): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

function connectedClient() {
  const sockets: FakeSocket[] = [];
  const client = new DifractaClient({
    url: "ws://test/live",
    kind: "studio",
    createSocket: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    scheduleFlush: (flush) => flush(),
  });
  const welcome = (socket: FakeSocket): void => {
    socket.open();
    socket.receive({
      type: "welcome",
      protocolVersion: 1,
      sessionId: "s1",
      runtime: { name: "test", version: "0" },
    });
  };
  welcome(sockets[0]!);
  const subscribes = (socket: FakeSocket) =>
    socket.sent.filter((message) => message.type === "subscribe");
  return { client, sockets, welcome, subscribes };
}

describe("DifractaClient subscriptions", () => {
  it("subscribes once per document however often openDocument is called", () => {
    const { client, sockets, subscribes } = connectedClient();
    const socket = sockets[0]!;

    const view = client.openDocument("doc");
    expect(client.openDocument("doc")).toBe(view);
    socket.receive({
      type: "snapshot",
      documentId: "doc",
      revision: 3,
      document: emptyDocument("Living"),
    });
    expect(client.openDocument("doc")).toBe(view);
    expect(view.revision.get()).toBe(3);
    expect(subscribes(socket)).toEqual([
      { type: "subscribe", documentId: "doc" },
    ]);
  });

  it("resubscribes after a reconnect and on a revision gap", () => {
    const { client, sockets, welcome, subscribes } = connectedClient();
    const view = client.openDocument("doc");
    sockets[0]!.receive({
      type: "snapshot",
      documentId: "doc",
      revision: 1,
      document: emptyDocument("Living"),
    });

    sockets[0]!.receive({
      type: "delta",
      documentId: "doc",
      fromRevision: 5,
      revision: 6,
      patches: [],
    });
    expect(view.revision.get()).toBe(1);
    expect(subscribes(sockets[0]!)).toHaveLength(2);

    vi.useFakeTimers();
    try {
      sockets[0]!.close();
      expect(client.phase.get()).toBe("reconnecting");
      vi.runOnlyPendingTimers();
      const next = sockets[1]!;
      welcome(next);
      expect(client.openDocument("doc")).toBe(view);
      expect(subscribes(next)).toEqual([
        { type: "subscribe", documentId: "doc" },
      ]);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks for live state when requested and routes live patches under the live root", () => {
    const { client, sockets, subscribes } = connectedClient();
    const socket = sockets[0]!;
    const view = client.openDocument("doc", { live: true });
    expect(subscribes(socket)).toEqual([
      { type: "subscribe", documentId: "doc", live: true },
    ]);
    socket.receive({
      type: "snapshot",
      documentId: "doc",
      revision: 1,
      document: emptyDocument("Living"),
      live: { outputs: {} },
    });
    const seen: unknown[] = [];
    view.subscribePath(["live", "outputs", "out_a"], () =>
      seen.push(view.valueAt(["live", "outputs", "out_a", "sessions"])),
    );
    socket.receive({
      type: "live",
      documentId: "doc",
      patches: [
        { op: "set", path: ["outputs", "out_a", "sessions", "s2"], value: {} },
      ],
    });
    expect(seen).toEqual([{ s2: {} }]);
    expect(view.revision.get()).toBe(1);
  });

  it("drops views of a replaced document and re-attaches after reconnect", () => {
    const { client, sockets, welcome } = connectedClient();
    const view = client.openDocument("old");
    client.attach("out_a");
    sockets[0]!.receive({
      type: "document",
      summary: {
        id: "new",
        name: "N",
        path: null,
        dirty: true,
        recovered: false,
        revision: 0,
        outputs: [],
      },
    });
    expect(client.document.get()?.id).toBe("new");
    expect(client.openDocument("old")).not.toBe(view);

    vi.useFakeTimers();
    try {
      sockets[0]!.close();
      vi.runOnlyPendingTimers();
      const next = sockets[1]!;
      welcome(next);
      expect(next.sent.filter((m) => m.type === "attach")).toEqual([
        { type: "attach", outputId: "out_a" },
      ]);
      client.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
