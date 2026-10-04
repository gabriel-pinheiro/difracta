import { BUNDLED_PACK_ID, SLUG_PATTERN } from "@difracta/core";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * The Registry: this machine's record of where each Pack it knows is on
 * disk, `packs.json` in the user's config folder (`platform-dirs.ts`). A map
 * from Pack id to its folder and name, the name so `packs.known` lists
 * without scanning. `packs.add` and `packs.locate` write it; folders named
 * with `--pack` or `DIFRACTA_PACKS` join the in-memory map for one run and
 * are never written. The Bundled Pack needs no entry.
 */
export const RegistryEntrySchema = z
  .object({ folder: z.string().min(1), name: z.string().min(1) })
  .strict();
export type RegistryEntry = z.infer<typeof RegistryEntrySchema>;

export const RegistryFileSchema = z
  .object({
    version: z.literal(1),
    packs: z.record(z.string().regex(SLUG_PATTERN), RegistryEntrySchema),
  })
  .strict();

export class PackRegistry {
  readonly #file: string;
  readonly #log: (message: string) => void;
  readonly #saved = new Map<string, RegistryEntry>();
  readonly #transient = new Map<string, RegistryEntry>();

  constructor(file: string, log: (message: string) => void = () => undefined) {
    this.#file = file;
    this.#log = log;
  }

  get file(): string {
    return this.#file;
  }

  /** Reads the file; a missing one is an empty Registry, an unreadable one is logged and treated as empty. */
  async load(): Promise<void> {
    this.#saved.clear();
    let text: string;
    try {
      text = await readFile(this.#file, "utf8");
    } catch {
      return;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (error) {
      this.#log(`${this.#file} is not JSON and was ignored: ${String(error)}`);
      return;
    }
    const parsed = RegistryFileSchema.safeParse(json);
    if (!parsed.success) {
      this.#log(
        `${this.#file} is not a Pack Registry and was ignored: ${z.prettifyError(parsed.error)}`,
      );
      return;
    }
    for (const [id, entry] of Object.entries(parsed.data.packs))
      this.#saved.set(id, entry);
  }

  /** The folder and name of `packId`; a transient entry wins over a saved one for this run. */
  get(packId: string): RegistryEntry | undefined {
    return this.#transient.get(packId) ?? this.#saved.get(packId);
  }

  /** Every known Pack, by name then id. */
  list(): readonly (RegistryEntry & { readonly id: string })[] {
    const entries = new Map<string, RegistryEntry>([
      ...this.#saved,
      ...this.#transient,
    ]);
    return [...entries]
      .map(([id, entry]) => ({ id, ...entry }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  /** Records `packId` for this run only. */
  setTransient(packId: string, entry: RegistryEntry): void {
    this.#transient.set(packId, entry);
  }

  /** Records `packId` and writes the file; the Bundled Pack is never recorded. */
  async set(packId: string, entry: RegistryEntry): Promise<void> {
    if (packId === BUNDLED_PACK_ID) return;
    this.#saved.set(packId, entry);
    this.#transient.delete(packId);
    await this.#write();
  }

  async #write(): Promise<void> {
    const content = {
      version: 1,
      packs: Object.fromEntries(
        [...this.#saved].sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
    await mkdir(path.dirname(this.#file), { recursive: true });
    const partial = `${this.#file}.partial`;
    await writeFile(partial, `${JSON.stringify(content, null, 2)}\n`);
    await rename(partial, this.#file);
  }
}
