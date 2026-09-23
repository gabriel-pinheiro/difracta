import { settings } from "@difracta/core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { DisplayMappingsSchema, type Placement } from "./display-mapping.ts";
import { rememberRuntime } from "./remembered-runtimes.ts";

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
  /**
   * Local mode starts without the Studio window (File ▸ Startup). What
   * `--no-studio` says for one launch, kept for every launch.
   */
  startWithoutStudio: z.boolean().optional(),
  /**
   * Which Display of this computer shows which Output, per Installation
   * (`display-mapping.ts`); restored when that Installation is open.
   */
  displayMappings: DisplayMappingsSchema.optional(),
});

export type DesktopState = z.infer<typeof StateSchema>;
export type LastMode = NonNullable<DesktopState["lastMode"]>;

/** The state once a session has started that the next launch is to resume; a runtime elsewhere is remembered for the launch page too. */
export function withLastMode(
  state: DesktopState,
  lastMode: LastMode,
): DesktopState {
  return {
    ...state,
    lastMode,
    remembered:
      lastMode.kind === "remote"
        ? rememberRuntime(
            state.remembered,
            { origin: lastMode.origin, name: lastMode.name },
            settings.desktop.rememberedRuntimesLimit,
          )
        : state.remembered,
  };
}

/**
 * The state with an Installation's placements as they are now. The
 * Installation placed last goes last, and past
 * `settings.desktop.displayMappingsLimit` the first drops off; one with no
 * placement left is forgotten.
 */
export function withDisplayMapping(
  state: DesktopState,
  installationId: string,
  placements: readonly Placement[],
): DesktopState {
  const { [installationId]: _before, ...others } = state.displayMappings ?? {};
  const entries = Object.entries(others);
  if (placements.length > 0) entries.push([installationId, [...placements]]);
  const { displayMappings: _all, ...rest } = state;
  return entries.length === 0
    ? rest
    : {
        ...rest,
        displayMappings: Object.fromEntries(
          entries.slice(-settings.desktop.displayMappingsLimit),
        ),
      };
}

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
