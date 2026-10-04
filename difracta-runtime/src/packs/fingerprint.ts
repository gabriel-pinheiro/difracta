import { formatFingerprint, settings } from "@difracta/core";
import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

/**
 * The fingerprint of the file at `file`: the SHA-256 of its first
 * `settings.packs.fingerprintBytes` bytes (the whole file when shorter) and
 * its size, in the format `formatFingerprint` gives. Throws when the file
 * cannot be read.
 */
export async function fingerprintFile(file: string): Promise<string> {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, settings.packs.fingerprintBytes);
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const result = await handle.read(buffer, read, length - read, read);
      if (result.bytesRead === 0) break;
      read += result.bytesRead;
    }
    const hash = createHash("sha256")
      .update(buffer.subarray(0, read))
      .digest("hex");
    return formatFingerprint(hash, size);
  } finally {
    await handle.close();
  }
}
