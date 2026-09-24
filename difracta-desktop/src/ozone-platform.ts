/** The switch that puts Chromium on X11, which on a Wayland session is XWayland. */
const X11_SWITCH = "--ozone-platform=x11";

/** A command to run in this launch's place: the program and its arguments. */
export interface Relaunch {
  readonly command: string;
  readonly args: readonly string[];
}

/** Whether an argument names an ozone platform: `--ozone-platform=…` or `--ozone-platform-hint=…`, with or without a value. */
function namesPlatform(argument: string): boolean {
  return argument.startsWith("--ozone-platform");
}

/**
 * The command that starts this launch again on X11, or undefined when it
 * stays as it is: on other systems, and on Linux when the command line
 * already names a platform, which wins. The command carries the switch, so
 * the run it starts stays.
 *
 * A Display window has to land on the Display it was asked for and stay
 * above everything there, which X11 can do and the Wayland protocol cannot
 * express. Electron picks Wayland by itself on a Wayland session, and the
 * choice is made before main runs, so only the command line can make it:
 * main starts the same command line again with the switch first, every other
 * argument kept, and exits.
 *
 * An AppImage's executable sits in a mount that lasts only as long as the
 * process the AppImage runtime started, so a packaged build running from one
 * runs the AppImage file itself again, as the autostart entry does
 * (`xdg-autostart.ts`). Every other build runs its own executable, which in
 * development is Electron's binary followed by the app's folder.
 */
export function x11Relaunch(running: {
  readonly platform: NodeJS.Platform;
  /** `process.argv`: the executable, then every argument of this launch. */
  readonly argv: readonly string[];
  /** `$APPIMAGE`, the AppImage file a packaged Linux build runs from. */
  readonly env: { readonly APPIMAGE?: string };
  readonly packaged: boolean;
}): Relaunch | undefined {
  if (running.platform !== "linux") return undefined;
  const [executable, ...args] = running.argv;
  if (executable === undefined || args.some(namesPlatform)) return undefined;
  const appImage = running.packaged ? running.env.APPIMAGE : undefined;
  return {
    command: appImage === undefined || appImage === "" ? executable : appImage,
    args: [X11_SWITCH, ...args],
  };
}
