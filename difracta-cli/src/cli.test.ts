import {
  DocumentView,
  receiveSnapshot,
  type DifractaClient,
} from "@difracta/client";
import { emptyDocument, settings } from "@difracta/core";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Cli } from "./cli.ts";

/** The part of a client `replica` uses, around a real view. */
function fakeClient(view: DocumentView) {
  const client = { openDocument: () => view } as unknown as DifractaClient;
  const snapshot = (document: unknown): void => {
    receiveSnapshot(view, { revision: 1, document });
  };
  return { client, snapshot };
}

describe("Cli.replica", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves with a snapshot that reads, naming on stderr the tables it shows empty", async () => {
    const view = new DocumentView("doc");
    const { client, snapshot } = fakeClient(view);
    const warn = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const replica = new Cli(new Command()).replica(client, "doc");
    snapshot({ ...emptyDocument("Living"), surfaces: "not surfaces" });
    const { document } = await replica;
    expect(document.installation.name).toBe("Living");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("surfaces"));
  });

  it("fails with the reason when the snapshot does not read", async () => {
    const view = new DocumentView("doc");
    const { client, snapshot } = fakeClient(view);
    const replica = new Cli(new Command()).replica(client, "doc");
    const { installation: _installation, ...withoutInstallation } =
      emptyDocument("Living");
    snapshot(withoutInstallation);
    await expect(replica).rejects.toThrow(/installation: missing/);
  });

  it("fails when no snapshot arrives in time", async () => {
    vi.useFakeTimers();
    const view = new DocumentView("doc");
    const { client } = fakeClient(view);
    const replica = new Cli(new Command()).replica(client, "doc");
    const failed = expect(replica).rejects.toThrow(/no Installation/);
    vi.advanceTimersByTime(settings.cli.snapshotTimeoutMs);
    await failed;
  });
});
