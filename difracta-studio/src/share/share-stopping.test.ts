import { Signal } from "@difracta/client";
import { describe, expect, it } from "vitest";

import { stopEverything } from "./share-stopping";
import type { RunningShare } from "./sharer";

function running(...slots: string[]) {
  const shares = new Signal<readonly RunningShare[]>(
    slots.map((mediaId) => ({ mediaId }) as RunningShare),
  );
  let stops = 0;
  const live = new Set(slots);
  const listeners = new Set<() => void>();
  return {
    sharer: { shares, stopAll: () => (stops += 1) },
    installation: {
      stillShared: (asked: readonly string[], sharer: string) =>
        sharer === "laptop" && asked.some((slot) => live.has(slot)),
      onLive: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    stops: () => stops,
    listeners: () => listeners.size,
    /** The runtime says a slot is idle. */
    idle(slot: string): void {
      live.delete(slot);
      for (const listener of [...listeners]) listener();
    },
  };
}

describe("Stopping every share before the window goes", () => {
  it("is done at once when nothing is shared", async () => {
    const page = running();
    await stopEverything(page.sharer, page.installation, "laptop");
    expect(page.stops()).toBe(1);
    expect(page.listeners()).toBe(0);
  });

  it("waits until the runtime says every slot is no longer this computer's", async () => {
    const page = running("m_wall", "m_side");
    let done = false;
    const stopped = stopEverything(
      page.sharer,
      page.installation,
      "laptop",
    ).then(() => (done = true));
    page.idle("m_wall");
    await Promise.resolve();
    expect(done).toBe(false);
    page.idle("m_side");
    await stopped;
    expect(done).toBe(true);
    expect(page.stops()).toBe(1);
    expect(page.listeners()).toBe(0);
  });
});
