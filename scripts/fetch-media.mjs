// Puts the Bundled Media in difracta-visuals/bundled/: manifest.json, clips/
// and thumbnails/ of the difracta-media release that `settings.media.bundle`
// pins. It downloads the release's tarball, refuses it unless its SHA-256
// matches the pin, and unpacks it. DIFRACTA_MEDIA_DIR=<path> copies the same
// three from a local working copy of difracta-media instead.
//
// A `.version` stamp (`<version>`, or `dir:<path>` for a copy) makes a
// second run free: it does nothing while the stamp matches, unless --force.
// While the pin has no SHA-256 and no DIFRACTA_MEDIA_DIR is given, nothing is
// downloaded: an empty manifest is written so the packages still build and
// test. With a SHA-256 pinned, failing to fetch is an error.
//
// Runs as the root postinstall and before dev, build and the Desktop
// scripts; `npm run media:fetch` runs it by hand. Plain Node, no packages.
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { settings } from "../difracta-core/src/settings.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = path.join(root, "difracta-visuals", "bundled");
const stampFile = path.join(target, ".version");
const PARTS = ["manifest.json", "clips", "thumbnails"];
const EMPTY_STAMP = "empty";

const force = process.argv.includes("--force");
const { version, sha256, url: urlPattern } = settings.media.bundle;
const localDir = process.env.DIFRACTA_MEDIA_DIR?.trim() || undefined;

async function readStamp() {
  try {
    return (await readFile(stampFile, "utf8")).trim();
  } catch {
    return undefined;
  }
}

/** Fills a fresh folder with `fill`, then puts it in place of the target, stamped. */
async function replaceTarget(stamp, fill) {
  const staging = `${target}.partial`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  await fill(staging);
  await writeFile(path.join(staging, ".version"), `${stamp}\n`);
  await rm(target, { recursive: true, force: true });
  await rename(staging, target);
}

async function copyFrom(dir) {
  const source = path.resolve(dir);
  await replaceTarget(`dir:${source}`, async (staging) => {
    for (const part of PARTS)
      await cp(path.join(source, part), path.join(staging, part), {
        recursive: true,
      });
  });
  console.log(`Bundled Media copied from ${source}.`);
}

async function download() {
  const url = urlPattern.replaceAll("<version>", version);
  console.log(`Downloading Bundled Media ${version} from ${url}`);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `${url} answered ${response.status} ${response.statusText}`,
    );
  const archive = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== sha256)
    throw new Error(
      `${url} has SHA-256 ${actual}, not the ${sha256} settings.media.bundle pins.`,
    );
  await replaceTarget(version, (staging) =>
    untar(gunzipSync(archive), staging),
  );
  console.log(`Bundled Media ${version} unpacked into ${target}.`);
}

/** A NUL-terminated string field of a tar header. */
function field(block, start, length) {
  const bytes = block.subarray(start, start + length);
  const end = bytes.indexOf(0);
  return bytes.subarray(0, end === -1 ? length : end).toString("utf8");
}

/** The `path` record of a pax extended header, if it has one. */
function paxPath(data) {
  for (const record of data.toString("utf8").split("\n")) {
    const match = /^\d+ path=(.*)$/.exec(record);
    if (match !== null) return match[1];
  }
  return undefined;
}

/**
 * Writes the regular files of a tar archive under `dir`, keeping only the
 * bundle's parts and refusing a name that would leave `dir`. Understands
 * ustar prefixes, GNU long names and pax paths, which is what `tar` writes.
 */
async function untar(tar, dir) {
  let offset = 0;
  let longName;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(field(header, 124, 12).trim() || "0", 8);
    const type = String.fromCharCode(header[156] || 48);
    const data = tar.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = field(data, 0, data.length);
      continue;
    }
    if (type === "x") {
      longName = paxPath(data) ?? longName;
      continue;
    }
    const prefix = field(header, 345, 155);
    const name =
      longName ??
      (prefix === ""
        ? field(header, 0, 100)
        : `${prefix}/${field(header, 0, 100)}`);
    longName = undefined;
    if (type !== "0" && type !== "7") continue;
    const relative = path.posix.normalize(name.replace(/^\.\//, ""));
    const [head] = relative.split("/");
    if (!PARTS.includes(head) || relative.startsWith("..")) continue;
    const file = path.join(dir, ...relative.split("/"));
    if (!file.startsWith(dir + path.sep))
      throw new Error(`The archive names a file outside it: ${name}`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  await readFile(path.join(dir, "manifest.json")).catch(() => {
    throw new Error("The archive has no manifest.json at its root.");
  });
}

async function writeEmpty() {
  await replaceTarget(EMPTY_STAMP, (staging) =>
    writeFile(
      path.join(staging, "manifest.json"),
      `${JSON.stringify({ version: 1, items: [] }, null, 2)}\n`,
    ),
  );
}

const stamp = await readStamp();
try {
  if (localDir !== undefined) {
    if (force || stamp !== `dir:${path.resolve(localDir)}`)
      await copyFrom(localDir);
  } else if (sha256 === "") {
    if (stamp === undefined) await writeEmpty();
    if (stamp === undefined || stamp === EMPTY_STAMP)
      console.warn(
        `No Bundled Media release is pinned yet: difracta-visuals/bundled/ has an empty manifest. Set DIFRACTA_MEDIA_DIR to a difracta-media checkout and run npm run media:fetch to copy its clips.`,
      );
  } else if (force || stamp !== version) {
    await download();
  }
} catch (error) {
  console.error(
    `Could not fetch the Bundled Media: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
