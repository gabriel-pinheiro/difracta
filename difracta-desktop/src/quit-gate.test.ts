import { describe, expect, it } from "vitest";

import { QuitGate } from "./quit-gate.ts";

/** A gate whose question is answered by the test, with what it did counted. */
function gate() {
  const seen = { asked: 0, prevented: 0, quits: 0 };
  let answer: (yes: boolean) => void = () => undefined;
  const quitGate = new QuitGate(() => {
    seen.asked += 1;
    return new Promise<boolean>((resolve) => (answer = resolve));
  });
  const event = { preventDefault: () => (seen.prevented += 1) };
  return {
    seen,
    quitGate,
    beforeQuit: () => quitGate.beforeQuit(event, () => (seen.quits += 1)),
    answer: async (yes: boolean) => {
      answer(yes);
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

describe("the quit gate", () => {
  it("holds the quit while it asks, then quits again and lets that one through", async () => {
    const { seen, quitGate, beforeQuit, answer } = gate();
    beforeQuit();
    // A second Ctrl+Q while the dialog is up asks nothing more.
    beforeQuit();
    expect(seen).toEqual({ asked: 1, prevented: 2, quits: 0 });
    expect(quitGate.agreed).toBe(false);

    await answer(true);
    expect(seen.quits).toBe(1);
    expect(quitGate.agreed).toBe(true);
    beforeQuit();
    expect(seen).toEqual({ asked: 1, prevented: 2, quits: 1 });
  });

  it("stays on Cancel, and asks again the next time", async () => {
    const { seen, quitGate, beforeQuit, answer } = gate();
    beforeQuit();
    await answer(false);
    expect(seen.quits).toBe(0);
    expect(quitGate.agreed).toBe(false);

    beforeQuit();
    expect(seen.asked).toBe(2);
    await answer(true);
    expect(seen.quits).toBe(1);
  });

  it("quits when the question itself fails", async () => {
    let quits = 0;
    new QuitGate(() => Promise.reject(new Error("broken"))).beforeQuit(
      { preventDefault: () => undefined },
      () => (quits += 1),
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(quits).toBe(1);
  });
});
