import { DifractaClient } from "@difracta/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRuntime, type Runtime } from "../server.ts";

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
    expect(pageView.liveState.get()).toEqual({ outputs: {} });

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
});
