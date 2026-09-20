import { DifractaClient } from "@difracta/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildRuntime, type Runtime } from "../server.ts";

let dir: string;
let runtime: Runtime;
let url: string;

async function waitFor(done: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now();
  while (!done()) {
    if (Date.now() - started > timeoutMs) throw new Error("Timed out.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-swap-"));
  runtime = await buildRuntime({
    host: "127.0.0.1",
    port: 0,
    documents: "free",
    openPath: undefined,
    studioDist: undefined,
    outputDist: undefined,
    thumbnailsDir: undefined,
    autosaveIntervalMs: 60_000,
    oscPort: undefined,
    discovery: false,
  });
  const address = await runtime.listen();
  url = `${address.replace("http", "ws")}/live`;
});

afterEach(async () => {
  await runtime.close();
  await rm(dir, { recursive: true, force: true });
});

/** Writes `a.difracta` and its Save As copy `b.difracta`: one Installation id, Outputs named apart. */
async function writeCopies(): Promise<{ a: string; b: string; id: string }> {
  const { store } = runtime;
  const a = path.join(dir, "a.difracta");
  const b = path.join(dir, "b.difracta");
  const created = await store.create("Living");
  if (!created.ok) throw new Error(created.error);
  const { id } = created.result;
  const session = store.session(id);
  session?.execute("output.create", { id: "out_a", name: "A side" }, "test");
  await store.save(id, a);
  session?.execute(
    "output.rename",
    { outputId: "out_a", name: "B side" },
    "test",
  );
  await store.save(id, b);
  return { a, b, id };
}

describe("a session replaced by another with the same Installation id", () => {
  it("gives subscribers the new session's state and its deltas", async () => {
    const { a, b, id } = await writeCopies();
    const opened = await runtime.store.open(a);
    expect(opened.ok && opened.result.id).toBe(id);

    const studio = new DifractaClient({
      url,
      kind: "studio",
      reconnect: false,
    });
    await waitFor(() => studio.document.get()?.path === a);
    const view = studio.openDocument(id, { live: true });
    await waitFor(() => view.get() !== undefined);
    expect(view.get()?.outputs.out_a?.name).toBe("A side");
    // Both files load at revision 0, so the revision cannot tell them apart.
    expect(view.revision.get()).toBe(0);

    await studio.request("documents.open", { path: b });
    await waitFor(() => view.get()?.outputs.out_a?.name === "B side");
    // Same id: the view survives the swap instead of being dropped.
    expect(studio.view(id)).toBe(view);
    expect(studio.document.get()?.path).toBe(b);

    await studio.command(id, "output.create", { id: "out_b", name: "TV" });
    expect(view.get()?.outputs.out_b?.name).toBe("TV");
    expect(view.get()?.outputs.out_a?.name).toBe("B side");
    const session = runtime.store.currentSession();
    expect(view.get()).toEqual(session?.document);
    expect(view.revision.get()).toBe(session?.revision);

    // A change that does not come from this client reaches it too.
    session?.execute(
      "output.rename",
      { outputId: "out_b", name: "Projector" },
      "test",
    );
    await waitFor(() => view.get()?.outputs.out_b?.name === "Projector");
    studio.close();
  });
});
