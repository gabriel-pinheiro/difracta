import type { Patch } from "@difracta/core";
import type { Display, DisplayHostReport } from "@difracta/protocol";
import { describe, expect, it } from "vitest";

import { DisplayHosts, findDisplay, slugOf } from "./display-hosts.ts";

function display(id: string, label: string): Display {
  return {
    id,
    label,
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    scaleFactor: 1,
    primary: id === "1",
    internal: false,
  };
}

const report: DisplayHostReport = {
  name: "Stage PC",
  displays: [display("1", "Monitor"), display("2", "Projector")],
  showing: {},
};

function tracked(): { hosts: DisplayHosts; patches: Patch[] } {
  const hosts = new DisplayHosts({ now: () => 42 });
  const patches: Patch[] = [];
  hosts.onChange((emitted) => patches.push(...emitted));
  return { hosts, patches };
}

describe("Display Hosts in the live state", () => {
  it("registers a host whole, then replicates only what changed", () => {
    const { hosts, patches } = tracked();
    hosts.report("s1", report);
    const host = {
      id: "stage-pc",
      sessionId: "s1",
      connectedAt: 42,
      ...report,
    };
    expect(patches).toEqual([
      { op: "set", path: ["displayHosts", "stage-pc"], value: host },
    ]);
    expect(hosts.state()).toEqual({ displayHosts: { "stage-pc": host } });

    patches.length = 0;
    hosts.report("s1", report);
    expect(patches).toEqual([]);

    hosts.report("s1", { ...report, showing: { "2": "out_a" } });
    hosts.report("s1", { ...report, showing: { "1": "out_a" } });
    expect(patches).toEqual([
      {
        op: "set",
        path: ["displayHosts", "stage-pc", "showing", "2"],
        value: "out_a",
      },
      { op: "remove", path: ["displayHosts", "stage-pc", "showing", "2"] },
      {
        op: "set",
        path: ["displayHosts", "stage-pc", "showing", "1"],
        value: "out_a",
      },
    ]);

    patches.length = 0;
    const unplugged = [display("1", "Monitor")];
    hosts.report("s1", { name: "Booth", displays: unplugged, showing: {} });
    expect(patches).toEqual([
      { op: "set", path: ["displayHosts", "stage-pc", "name"], value: "Booth" },
      {
        op: "set",
        path: ["displayHosts", "stage-pc", "displays"],
        value: unplugged,
      },
      { op: "remove", path: ["displayHosts", "stage-pc", "showing", "1"] },
    ]);
    // The id outlives a rename: it is what people already typed.
    expect(hosts.ofSession("s1")?.id).toBe("stage-pc");

    patches.length = 0;
    hosts.withdraw("s1");
    hosts.withdraw("s1");
    expect(patches).toEqual([
      { op: "remove", path: ["displayHosts", "stage-pc"] },
    ]);
    expect(hosts.state()).toEqual({ displayHosts: {} });
  });

  it("numbers the id of a host whose slug is taken and frees it again", () => {
    const { hosts } = tracked();
    hosts.report("s1", report);
    hosts.report("s2", report);
    hosts.report("s3", { ...report, name: "stage pc!" });
    expect(hosts.list().map((host) => host.id)).toEqual([
      "stage-pc",
      "stage-pc-2",
      "stage-pc-3",
    ]);
    hosts.withdraw("s1");
    hosts.report("s4", report);
    expect(hosts.ofSession("s4")?.id).toBe("stage-pc");
  });

  it("makes ids a person can type", () => {
    expect(slugOf("Stage PC (left)")).toBe("stage-pc-left");
    expect(slugOf("Estúdio São João")).toBe("estudio-sao-joao");
    expect(slugOf("gabriel-ThinkPad.local")).toBe("gabriel-thinkpad-local");
    expect(slugOf("舞台")).toBe("host");
  });

  it("finds a host by id, or by a name only one has", () => {
    const { hosts } = tracked();
    expect(hosts.find("stage-pc")).toEqual({
      ok: false,
      error: "No Display Host “stage-pc”: none is connected.",
    });
    hosts.report("s1", report);
    hosts.report("s2", { ...report, name: "Booth" });
    expect(hosts.find("stage-pc")).toMatchObject({
      value: { sessionId: "s1" },
    });
    expect(hosts.find("BOOTH")).toMatchObject({ value: { sessionId: "s2" } });
    expect(hosts.find("foyer")).toEqual({
      ok: false,
      error: "No Display Host “foyer”. Connected: stage-pc, booth.",
    });
    hosts.report("s3", report);
    expect(hosts.find("Stage PC")).toEqual({
      ok: false,
      error:
        "2 Display Hosts are named “Stage PC”; use an id: stage-pc, stage-pc-2.",
    });
    // An id wins over a name.
    hosts.report("s4", { ...report, name: "stage-pc-2" });
    expect(hosts.find("stage-pc-2")).toMatchObject({
      value: { sessionId: "s3" },
    });
  });

  it("finds a Display by id, or by a label only one has", () => {
    const { hosts } = tracked();
    hosts.report("s1", {
      ...report,
      displays: [...report.displays, display("3", "Projector")],
    });
    const host = hosts.ofSession("s1");
    if (host === undefined) throw new Error("No host.");
    expect(findDisplay(host, "2")).toMatchObject({ value: { id: "2" } });
    expect(findDisplay(host, "monitor")).toMatchObject({ value: { id: "1" } });
    expect(findDisplay(host, "Projector")).toEqual({
      ok: false,
      error:
        "2 Displays of “stage-pc” are labelled “Projector”; use an id: 2, 3.",
    });
    expect(findDisplay(host, "9")).toEqual({
      ok: false,
      error: "Display Host “stage-pc” has no Display “9”. It has: 1, 2, 3.",
    });
  });
});
