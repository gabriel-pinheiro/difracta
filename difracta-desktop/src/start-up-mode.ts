import type { LastMode } from "./desktop-state.ts";

/** What a launch does first. */
export type StartUpMode =
  | { readonly kind: "launch-page" }
  | { readonly kind: "local"; readonly file: string | undefined }
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
 */
export function startUpMode(options: {
  readonly requestedFile: string | undefined;
  readonly studioUrl: string | undefined;
  readonly lastMode: LastMode | undefined;
}): StartUpMode {
  if (options.studioUrl !== undefined)
    return {
      kind: "studio-url",
      url: options.studioUrl,
      file: options.requestedFile,
    };
  if (options.requestedFile !== undefined)
    return { kind: "local", file: options.requestedFile };
  const last = options.lastMode;
  if (last === undefined) return { kind: "launch-page" };
  return last.kind === "local"
    ? { kind: "local", file: undefined }
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
