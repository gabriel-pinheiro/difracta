import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const StateSchema = z.object({ lastFile: z.string().min(1).optional() });

/**
 * The last `.difracta` file Desktop had open, kept in its user data folder
 * (`app.getPath("userData")`) so the next launch reopens it. The operating
 * system's own recent documents list is fed separately, by
 * `app.addRecentDocument`.
 */
export class LastFileStore {
  readonly #file: string;

  constructor(userDataDir: string) {
    this.#file = path.join(userDataDir, "desktop-state.json");
  }

  /** Undefined on first launch, and for a state file that is missing or damaged. */
  async read(): Promise<string | undefined> {
    try {
      const state = StateSchema.safeParse(
        JSON.parse(await readFile(this.#file, "utf8")),
      );
      return state.success ? state.data.lastFile : undefined;
    } catch {
      return undefined;
    }
  }

  async write(lastFile: string): Promise<void> {
    await mkdir(path.dirname(this.#file), { recursive: true });
    await writeFile(this.#file, `${JSON.stringify({ lastFile }, null, 2)}\n`);
  }
}
