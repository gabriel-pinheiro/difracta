import { createBuiltInRegistry } from "@difracta/core";
import { builtInCatalog } from "@difracta/visuals";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStore } from "../documents/document-store.ts";
import { buildRuntime } from "../server.ts";
import {
  discoveryTxt,
  instanceName,
  reachableFromNetwork,
  RuntimeAdvertisement,
  type Announcer,
  type DiscoveryTxt,
} from "./advertisement.ts";

class FakeAnnouncer implements Announcer {
  readonly announced: DiscoveryTxt[] = [];
  closed = false;

  announce(txt: DiscoveryTxt): void {
    this.announced.push(txt);
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

describe("reachable from the network", () => {
  it("is every host but loopback", () => {
    for (const host of ["0.0.0.0", "::", "192.168.1.20", "stage.local"])
      expect(reachableFromNetwork(host), host).toBe(true);
    for (const host of [
      "127.0.0.1",
      "127.8.0.1",
      "::1",
      "[::1]",
      "::ffff:127.0.0.1",
      "localhost",
      "LOCALHOST",
    ])
      expect(reachableFromNetwork(host), host).toBe(false);
  });

  it("keeps a runtime bound to loopback off the network", async () => {
    const runtime = await buildRuntime({
      host: "127.0.0.1",
      port: 0,
      documents: "free",
      openPath: undefined,
      studioDist: undefined,
      outputDist: undefined,
      thumbnailsDir: undefined,
      autosaveIntervalMs: 60_000,
      oscPort: undefined,
      discovery: true,
    });
    const address = await runtime.listen();
    const health = (await (await fetch(`${address}/health`)).json()) as {
      discovery: boolean;
    };
    expect(health.discovery).toBe(false);
    await runtime.close();
  });
});

describe("discovery TXT record", () => {
  it("carries the version and the open Installation's name, and no path", () => {
    expect(discoveryTxt("1.2.3", "Living")).toEqual({
      version: "1.2.3",
      document: "Living",
    });
    expect(discoveryTxt("1.2.3", undefined)).toEqual({ version: "1.2.3" });
    expect(discoveryTxt("1.2.3", "")).toEqual({ version: "1.2.3" });
  });

  it("keeps each entry within 255 bytes without splitting a character", () => {
    const { document } = discoveryTxt("1", "é".repeat(200));
    expect(document).toBe("é".repeat(123));
    expect(Buffer.byteLength(`document=${document ?? ""}`)).toBeLessThanOrEqual(
      255,
    );
  });
});

describe("discovery instance name", () => {
  it("names the machine, and the port when it is not the default", () => {
    expect(instanceName("mini-pc.local", 4800)).toBe("Difracta on mini-pc");
    expect(instanceName("mini-pc", 4900)).toBe("Difracta on mini-pc (4900)");
  });
});

describe("runtime advertisement", () => {
  let store: DocumentStore;
  let announcer: FakeAnnouncer;
  let advertisement: RuntimeAdvertisement;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new DocumentStore({
      registry: createBuiltInRegistry(builtInCatalog),
    });
    announcer = new FakeAnnouncer();
    advertisement = new RuntimeAdvertisement({
      store,
      version: "1.2.3",
      announcer,
      txtUpdateDelayMs: 1_000,
    });
  });

  afterEach(async () => {
    await advertisement.close();
    vi.useRealTimers();
  });

  it("announces at once, then again when the document's name has settled", async () => {
    expect(announcer.announced).toEqual([{ version: "1.2.3" }]);

    await store.create("Living");
    const session = store.currentSession();
    session?.execute("installation.rename", { name: "Living r" }, "test");
    vi.advanceTimersByTime(900);
    session?.execute("installation.rename", { name: "Living room" }, "test");
    vi.advanceTimersByTime(900);
    // Still within the delay of the last change.
    expect(announcer.announced).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(announcer.announced).toEqual([
      { version: "1.2.3" },
      { version: "1.2.3", document: "Living room" },
    ]);
  });

  it("stays quiet for changes that leave the record as it is", async () => {
    await store.create("Living");
    vi.advanceTimersByTime(1_000);
    expect(announcer.announced).toHaveLength(2);

    // Outputs are part of the summary, not of the TXT record. The first
    // change makes the document dirty, which is the autosave's timer, not ours.
    const session = store.currentSession();
    session?.execute("output.create", { id: "out_a", name: "TV" }, "test");
    const timers = vi.getTimerCount();
    session?.execute("output.create", { id: "out_b", name: "Wall" }, "test");
    expect(vi.getTimerCount()).toBe(timers);

    // Away and back within the delay ends where it started.
    session?.execute("installation.rename", { name: "Other" }, "test");
    session?.execute("installation.rename", { name: "Living" }, "test");
    vi.advanceTimersByTime(1_000);
    expect(announcer.announced).toHaveLength(2);
  });

  it("drops the name when the document closes, and stops with the runtime", async () => {
    const created = await store.create("Living");
    vi.advanceTimersByTime(1_000);
    await store.close(created.ok ? created.result.id : "", true);
    vi.advanceTimersByTime(1_000);
    expect(announcer.announced.at(-1)).toEqual({ version: "1.2.3" });

    await store.create("Again");
    await advertisement.close();
    vi.advanceTimersByTime(1_000);
    expect(announcer.closed).toBe(true);
    expect(announcer.announced).toHaveLength(3);
  });
});
