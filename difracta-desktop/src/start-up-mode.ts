import type { LastMode } from "./desktop-state.ts";

/** What a launch does first. */
export type StartUpMode =
  | { readonly kind: "launch-page" }
  | {
      readonly kind: "local";
      readonly file: string | undefined;
      /** False starts the runtime with nothing on screen (`--no-studio`). */
      readonly studioWindow: boolean;
    }
  | {
      readonly kind: "remote";
      readonly origin: string;
      readonly name: string | null;
    }
  /** Development: a Studio dev server in place of a runtime of Desktop's own. */
  | {
      readonly kind: "studio-url";
      readonly url: string;
      readonly file: string | undefined;
    };

/**
 * A file the OS asked for always means this computer: a path on this disk
 * means nothing to a runtime elsewhere. Otherwise the launch resumes the mode
 * of the last one, and the very first launch asks.
 *
 * Local mode starts without its Studio window when this launch was given
 * `--no-studio`, or when the stored setting says so; the flag is only ever
 * a yes, so it cannot switch the stored setting off. The other modes have
 * nothing to run without a window: `ignoredNoStudio` says when a flag was
 * given in vain, for main to log.
 */
export function startUpMode(options: {
  readonly requestedFile: string | undefined;
  readonly studioUrl: string | undefined;
  readonly lastMode: LastMode | undefined;
  readonly noStudioFlag: boolean;
  readonly startWithoutStudio: boolean;
}): StartUpMode {
  const studioWindow = !(options.noStudioFlag || options.startWithoutStudio);
  if (options.studioUrl !== undefined)
    return {
      kind: "studio-url",
      url: options.studioUrl,
      file: options.requestedFile,
    };
  if (options.requestedFile !== undefined)
    return { kind: "local", file: options.requestedFile, studioWindow };
  const last = options.lastMode;
  if (last === undefined) return { kind: "launch-page" };
  return last.kind === "local"
    ? { kind: "local", file: undefined, studioWindow }
    : { kind: "remote", origin: last.origin, name: last.name };
}

const STUDIO_URL_SWITCH = "--studio-url";

/** `--studio-url <url>` or `--studio-url=<url>` on the command line (development). */
export function studioUrlFromArgv(argv: readonly string[]): string | undefined {
  const at = argv.findIndex(
    (argument) =>
      argument === STUDIO_URL_SWITCH ||
      argument.startsWith(`${STUDIO_URL_SWITCH}=`),
  );
  const argument = argv[at];
  if (argument === undefined) return undefined;
  return argument === STUDIO_URL_SWITCH
    ? argv[at + 1]
    : argument.slice(STUDIO_URL_SWITCH.length + 1);
}

const NO_STUDIO_SWITCH = "--no-studio";

/** `--no-studio` on the command line: this launch runs without the Studio window. */
export function noStudioFromArgv(argv: readonly string[]): boolean {
  return argv.includes(NO_STUDIO_SWITCH);
}

/** Whether `--no-studio` was given to a launch that has no use for it. */
export function ignoredNoStudio(mode: StartUpMode, flag: boolean): boolean {
  return flag && mode.kind !== "local";
}
