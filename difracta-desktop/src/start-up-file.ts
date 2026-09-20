import path from "node:path";

const DOCUMENT_FILE_EXTENSION = ".difracta";

/**
 * The `.difracta` file named on a command line, absolute, or undefined. The
 * OS opens a document by launching the app with its path as an argument, and
 * so does a second launch whose arguments Electron forwards to the running
 * app. `argv[0]` is the executable; the rest is a mix of Chromium switches,
 * and in development the app's own folder, so the file is recognised by its
 * extension rather than by its position.
 */
export function documentFileFromArgv(
  argv: readonly string[],
  workingDirectory: string,
): string | undefined {
  const file = argv
    .slice(1)
    .find(
      (argument) =>
        !argument.startsWith("-") &&
        argument.toLowerCase().endsWith(DOCUMENT_FILE_EXTENSION),
    );
  return file === undefined ? undefined : path.resolve(workingDirectory, file);
}

/**
 * The file the runtime starts with: the one asked for, else the last one
 * opened if it is still there, else none. A last file that was moved or
 * deleted is skipped without a word; a file asked for by name is passed on
 * even when missing, so the runtime's log says why it was not opened.
 */
export async function startUpFile(options: {
  readonly requested: string | undefined;
  readonly last: string | undefined;
  readonly exists: (file: string) => Promise<boolean>;
}): Promise<string | undefined> {
  if (options.requested !== undefined) return options.requested;
  if (options.last !== undefined && (await options.exists(options.last)))
    return options.last;
  return undefined;
}
