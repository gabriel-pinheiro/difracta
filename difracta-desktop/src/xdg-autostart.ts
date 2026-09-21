import { access, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const ENTRY_FILE = "difracta-desktop.desktop";

/**
 * Where a Linux desktop looks for programs to start at login, by the XDG
 * autostart specification: `autostart/` under `$XDG_CONFIG_HOME`, which is
 * `~/.config` unless set.
 */
export function autostartDirectory(
  env: NodeJS.ProcessEnv,
  home: string,
): string {
  const configHome = env.XDG_CONFIG_HOME;
  return path.join(
    configHome === undefined || configHome === ""
      ? path.join(home, ".config")
      : configHome,
    "autostart",
  );
}

/**
 * One argument of an `Exec` line. The desktop entry format wants an argument
 * with anything but plain characters in double quotes, with `"`, `` ` ``, `$`
 * and `\` escaped inside them, and a literal `%` doubled because `%f` and
 * friends are field codes.
 */
function execArgument(argument: string): string {
  const literal = argument.replaceAll("%", "%%");
  if (/^[\w@%+=:,./-]+$/.test(literal)) return literal;
  return `"${literal.replace(/(["`$\\])/g, "\\$1")}"`;
}

/**
 * The command that starts this Desktop again: what is running now. A
 * development build is Electron's binary given the app's folder, an installed
 * one is its own executable. `--no-sandbox` travels only when this launch has
 * it, since a Desktop that needed it to start will need it at login too, and
 * one that did not must not lose its sandbox to a setting.
 */
export function autostartCommand(running: {
  readonly execPath: string;
  /** The app's folder, for a build that is not packaged. */
  readonly appPath: string | undefined;
  readonly noSandbox: boolean;
  readonly noStudio: boolean;
}): string[] {
  return [
    running.execPath,
    ...(running.appPath === undefined ? [] : [running.appPath]),
    ...(running.noSandbox ? ["--no-sandbox"] : []),
    ...(running.noStudio ? ["--no-studio"] : []),
  ];
}

/** The autostart entry's text: a desktop entry whose `Exec` is `command`. */
export function autostartEntry(command: readonly string[]): string {
  return [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Difracta",
    "Comment=Start Difracta Desktop at login",
    `Exec=${command.map(execArgument).join(" ")}`,
    "Terminal=false",
    "",
  ].join("\n");
}

/**
 * Start at login on Linux, where Electron's `setLoginItemSettings` does
 * nothing: the desktop environments start what has an entry in the autostart
 * directory, so the setting is that file, written and removed here.
 */
export class XdgAutostart {
  readonly #file: string;

  constructor(directory: string) {
    this.#file = path.join(directory, ENTRY_FILE);
  }

  /** Whether the entry is there, which is what the OS goes by. */
  async enabled(): Promise<boolean> {
    return access(this.#file).then(
      () => true,
      () => false,
    );
  }

  async enable(command: readonly string[]): Promise<void> {
    await mkdir(path.dirname(this.#file), { recursive: true });
    await writeFile(this.#file, autostartEntry(command));
  }

  async disable(): Promise<void> {
    await rm(this.#file, { force: true });
  }
}
