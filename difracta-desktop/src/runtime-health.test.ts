import { describe, expect, it } from "vitest";

import { checkRuntime } from "./runtime-health.ts";

const origin = "http://10.0.0.5:4800";
const answering =
  (body: unknown, status = 200) =>
  (url: string) => {
    expect(url).toBe(`${origin}/health`);
    return Promise.resolve(Response.json(body, { status }));
  };

describe("checking a runtime elsewhere", () => {
  it("passes a Difracta runtime and reads its version", async () => {
    expect(
      await checkRuntime(origin, {
        fetch: answering({ name: "Difracta Runtime", version: "1.2.3" }),
      }),
    ).toEqual({ ok: true, health: { version: "1.2.3" } });
    expect(
      await checkRuntime(origin, {
        fetch: answering({ name: "Difracta Runtime" }),
      }),
    ).toEqual({ ok: true, health: { version: null } });
  });

  it("refuses another server on the port", async () => {
    for (const fetch of [
      answering({ name: "Something Else" }),
      answering("ok"),
      answering({ name: "Difracta Runtime" }, 500),
      () => Promise.resolve(new Response("<html>")),
    ]) {
      const check = await checkRuntime(origin, { fetch });
      expect(check).toMatchObject({ ok: false });
      if (!check.ok) expect(check.reason).toContain("10.0.0.5:4800");
    }
  });

  it("says so when nothing answers, or not in time", async () => {
    const refused = await checkRuntime(origin, {
      fetch: () => Promise.reject(new TypeError("fetch failed")),
    });
    expect(refused).toMatchObject({ ok: false });

    const slow = await checkRuntime(origin, {
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    });
    expect(slow).toMatchObject({ ok: false });
    if (!slow.ok) expect(slow.reason).toMatch(/^No Runtime answered/);
  });
});
