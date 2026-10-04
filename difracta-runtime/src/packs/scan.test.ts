import { describe, expect, it } from "vitest";

import { scanManifest, type ScannedFile } from "./scan.ts";

const files: ScannedFile[] = [
  { file: "tunnels/04.mp4", fingerprint: "aaaaaaaaaaaaaaaa-1" },
  { file: "Logo Final.PNG", fingerprint: "bbbbbbbbbbbbbbbb-2" },
  { file: "tunnels/04.webm", fingerprint: "cccccccccccccccc-3" },
  { file: "notes.txt", fingerprint: "dddddddddddddddd-4" },
];
const random = () => 0.5;

describe("scanManifest", () => {
  it("creates a manifest with slug ids, names from file names and unique ids", () => {
    const { manifest, missing, changed } = scanManifest(
      "Neon VJ",
      files,
      undefined,
      random,
    );
    expect(changed).toBe(true);
    expect(missing).toEqual([]);
    expect(manifest.id).toMatch(/^neon-vj-[a-z0-9]{4}$/);
    expect(manifest.name).toBe("Neon VJ");
    expect(
      manifest.entries.map((entry) => [
        entry.id,
        entry.file,
        entry.type,
        entry.name,
      ]),
    ).toEqual([
      ["logo-final", "Logo Final.PNG", "image", "Logo Final"],
      ["tunnels-04", "tunnels/04.mp4", "video", "04"],
      ["tunnels-04-2", "tunnels/04.webm", "video", "04"],
    ]);
    expect(manifest.entries[0]).toMatchObject({
      tags: [],
      fingerprint: "bbbbbbbbbbbbbbbb-2",
    });
  });

  it("keeps entries and metadata, adds new files, re-attaches by fingerprint and reports the rest missing", () => {
    const first = scanManifest("neon", files, undefined, random).manifest;
    const edited = {
      ...first,
      entries: first.entries.map((entry) =>
        entry.id === "tunnels-04"
          ? { ...entry, name: "Tunnel", tags: ["loop"], beats: 16 }
          : entry,
      ),
    };
    const later: ScannedFile[] = [
      { file: "tunnels/renamed.mp4", fingerprint: "aaaaaaaaaaaaaaaa-1" },
      { file: "new/fresh.webm", fingerprint: "eeeeeeeeeeeeeeee-5" },
      { file: "tunnels/04.webm", fingerprint: "cccccccccccccccc-3" },
    ];
    const { manifest, missing, changed } = scanManifest(
      "neon",
      later,
      edited,
      random,
    );
    expect(changed).toBe(true);
    expect(manifest.id).toBe(first.id);
    const tunnel = manifest.entries.find((entry) => entry.id === "tunnels-04");
    expect(tunnel).toMatchObject({
      file: "tunnels/renamed.mp4",
      name: "Tunnel",
      tags: ["loop"],
      beats: 16,
    });
    expect(manifest.entries.map((entry) => entry.id)).toEqual([
      "logo-final",
      "tunnels-04",
      "tunnels-04-2",
      "new-fresh",
    ]);
    expect(missing).toEqual(["logo-final"]);
    const again = scanManifest("neon", later, manifest, random);
    expect(again.changed).toBe(false);
    expect(again.missing).toEqual(["logo-final"]);
  });

  it("gives a new file an id that no entry, present or missing, holds", () => {
    const first = scanManifest("p", [files[0]!], undefined, random).manifest;
    const { manifest } = scanManifest(
      "p",
      [{ file: "tunnels/04.mov", fingerprint: "ffffffffffffffff-6" }],
      first,
      random,
    );
    expect(manifest.entries.map((entry) => entry.id)).toEqual([
      "tunnels-04",
      "tunnels-04-2",
    ]);
  });

  it("takes the new fingerprint of a file replaced under its own name, keeping its id and metadata", () => {
    const first = scanManifest("Neon VJ", files, undefined, random).manifest;
    const tagged = {
      ...first,
      entries: first.entries.map((entry) =>
        entry.file === "tunnels/04.mp4" ? { ...entry, tags: ["loop"] } : entry,
      ),
    };
    const replaced = files.map((file) =>
      file.file === "tunnels/04.mp4"
        ? { ...file, fingerprint: "eeeeeeeeeeeeeeee-5" }
        : file,
    );
    const { manifest, missing, changed } = scanManifest(
      "Neon VJ",
      replaced,
      tagged,
      random,
    );
    expect(changed).toBe(true);
    expect(missing).toEqual([]);
    const entry = manifest.entries.find((e) => e.file === "tunnels/04.mp4");
    expect(entry).toMatchObject({
      id: "tunnels-04",
      tags: ["loop"],
      fingerprint: "eeeeeeeeeeeeeeee-5",
    });
    expect(manifest.entries.length).toBe(first.entries.length);
  });
});
