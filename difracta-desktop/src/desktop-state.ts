import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const RememberedSchema = z.object({
  origin: z.string().min(1),
  name: z.string().nullable(),
});

const StateSchema = z.object({
  /** The last `.difracta` file local mode had open, reopened by the next local start. */
  lastFile: z.string().min(1).optional(),
  /** What the next launch resumes; absent until a mode was chosen once. */
  lastMode: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("local") }),
      RememberedSchema.extend({ kind: z.literal("remote") }),
    ])
    .optional(),
  remembered: z.array(RememberedSchema).default([]),
});

export type DesktopState = z.infer<typeof StateSchema>;
export type LastMode = NonNullable<DesktopState["lastMode"]>;

const EMPTY: DesktopState = { remembered: [] };

/**
 * What Desktop remembers between launches, one JSON file in its user data
 * folder (`app.getPath("userData")`). The operating system's own recent
 * documents list is fed separately, by `app.addRecentDocument`.
 */
export class DesktopStateStore {
  readonly #file: string;
  /** Changes run one after another, so two never write over each other. */
  #queue: Promise<unknown> = Promise.resolve();

  constructor(userDataDir: string) {
    this.#file = path.join(userDataDir, "desktop-state.json");
  }

  /** Empty on first launch, and for a state file that is missing or damaged. */
  async read(): Promise<DesktopState> {
    try {
      const state = StateSchema.safeParse(
        JSON.parse(await readFile(this.#file, "utf8")),
      );
      return state.success ? state.data : EMPTY;
    } catch {
      return EMPTY;
    }
  }

  /** Writes the state `change` makes of the current one, and returns it. */
  update(change: (state: DesktopState) => DesktopState): Promise<DesktopState> {
    const written = this.#queue.then(async () => {
      const next = change(await this.read());
      await mkdir(path.dirname(this.#file), { recursive: true });
      await writeFile(this.#file, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
    this.#queue = written.catch(() => undefined);
    return written;
  }
}
