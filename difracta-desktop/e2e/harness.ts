import { DifractaClient } from "@difracta/client";
import { emptyDocument } from "@difracta/core";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";
import { afterEach, beforeEach } from "vitest";

import { serializeDocument } from "../../difracta-runtime/src/documents/document-file.ts";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

/** A port nothing uses, so the suite never meets a runtime already on 4800. */
export async function sparePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function eventually<T>(
  read: () => Promise<T>,
  wanted: (value: T) => boolean,
) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    const value = await read().catch(() => undefined);
    if (value !== undefined && wanted(value)) return value;
    if (Date.now() > deadline) throw new Error("Waited too long.");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export let dir: string;
export let userData: string;
export let env: Record<string, string>;
export let app: ElectronApplication | undefined;
export let standalone: ChildProcess | undefined;

/** The app's arguments: its folder, a user data folder of its own, maybe a file, maybe switches. */
export const launchArguments = (
  file?: string,
  switches: readonly string[] = [],
): string[] => [
  packageDir,
  `--user-data-dir=${userData}`,
  ...switches,
  ...(file === undefined ? [] : [file]),
];

export async function launch(
  file?: string,
  switches: readonly string[] = [],
): Promise<Page> {
  app = await electron.launch({ args: launchArguments(file, switches), env });
  return app.firstWindow();
}

/** A launch that shows nothing, so there is no first window to wait for: `/health` says when it is up. */
export async function launchWithoutStudio(file: string): Promise<void> {
  app = await electron.launch({
    args: launchArguments(file, ["--no-studio"]),
    env,
  });
  await eventually(
    () => fetch(`http://127.0.0.1:${env.DIFRACTA_PORT ?? ""}/health`),
    (response) => response.ok,
  );
}

export const LAUNCH_PAGE = "app://desktop/studio/launch.html";

/** The window an action opens: Studio's after a choice on the launch page, the launch page's after File ▸ Connect to... */
export async function windowAfter(action: () => Promise<void>): Promise<Page> {
  const [window] = await Promise.all([app?.waitForEvent("window"), action()]);
  if (window === undefined) throw new Error("No application.");
  return window;
}

/** A launch that lands on the launch page. */
export async function launchToPage(): Promise<Page> {
  const page = await launch();
  await page.waitForURL(LAUNCH_PAGE);
  return page;
}

/**
 * A runtime of its own, as a mini-PC would run one: the bundle Desktop forks,
 * started by the test on a spare port with `file` pinned.
 */
export async function standaloneRuntime(file: string): Promise<number> {
  const port = await sparePort();
  standalone = spawn(
    process.execPath,
    [
      path.join(packageDir, "dist/runtime.mjs"),
      ...["--host", "127.0.0.1", "--port", String(port), file],
    ],
    {
      env: {
        ...env,
        DIFRACTA_STUDIO_DIST: path.join(packageDir, "dist/studio"),
        DIFRACTA_OUTPUT_DIST: path.join(packageDir, "dist/output"),
      },
      stdio: "ignore",
    },
  );
  await eventually(
    () => fetch(`http://127.0.0.1:${port}/health`),
    (response) => response.ok,
  );
  return port;
}

export async function stopStandalone(): Promise<void> {
  const child = standalone;
  standalone = undefined;
  if (child?.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}

/**
 * Clicks an item of the native menu, which no page and no Playwright can
 * reach, from the main process. The empty object stands in for the event a
 * real click carries.
 */
export async function clickMenu(id: string): Promise<void> {
  await app?.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()?.getMenuItemById(itemId)?.click({});
  }, id);
}

/** The visible items of one native menu, as `id` (or role, or "-") and whether each is enabled. */
export async function menuItems(menu: string): Promise<[string, boolean][]> {
  const items = await app?.evaluate(({ Menu }, menuId) => {
    const submenu = Menu.getApplicationMenu()?.getMenuItemById(menuId)?.submenu;
    return (submenu?.items ?? [])
      .filter((item) => item.visible)
      .map((item): [string, boolean] => [
        item.type === "separator"
          ? "-"
          : ([item.id, item.role].find(Boolean) ?? item.label),
        item.enabled,
      ]);
  }, menu);
  return items ?? [];
}

/** The title of the Studio window, which main writes. */
export async function studioTitle(): Promise<string | undefined> {
  return app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find(
        (window) =>
          window.webContents.getURL().includes("/studio/") &&
          window.webContents.getURL().startsWith("http"),
      )
      ?.getTitle(),
  );
}

/** A command sent from another client, as the CLI would; its result. */
export async function commandFromElsewhere<TResult>(
  port: string | undefined,
  name: string,
  payload: unknown,
): Promise<TResult> {
  const client = new DifractaClient({
    url: `ws://127.0.0.1:${port ?? ""}/live`,
    kind: "cli",
    reconnect: false,
  });
  try {
    const summary = await eventually(
      () => Promise.resolve(client.document.get()),
      (document) => document !== null,
    );
    return await client.command<TResult>(summary?.id ?? "", name, payload);
  } finally {
    client.close();
  }
}

/** Renames the Installation from another client: an unsaved change. */
export async function renameFromElsewhere(
  port: string | undefined,
  name: string,
): Promise<void> {
  await commandFromElsewhere(port, "installation.rename", { name });
}

/**
 * A second launch: it finds the lock taken, passes its file on and exits.
 * Playwright starts Electron with --no-sandbox on Linux, where a checkout's
 * Electron often cannot use Chromium's sandbox; this launch does the same.
 */
export async function secondLaunch(file?: string): Promise<void> {
  const other = spawn(
    (await import("electron")).default as unknown as string,
    [
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      ...launchArguments(file),
    ],
    { env, stdio: "ignore" },
  );
  await new Promise((resolve) => other.once("exit", resolve));
}

export async function installationFile(name: string): Promise<string> {
  const file = path.join(dir, `${name}.difracta`);
  await writeFile(file, serializeDocument(emptyDocument(name)));
  return file;
}

/**
 * Under `xvfb-run` the windows belong on its invisible X display. On a Wayland
 * desktop Electron would follow `WAYLAND_DISPLAY` to the person's real screen
 * instead, so inside `xvfb-run` (known by the Xauthority file it makes) that
 * variable does not travel. On a real display nothing changes.
 */
function displayEnvironment(
  base: Record<string, string>,
): Record<string, string> {
  if (base.XAUTHORITY?.includes("xvfb-run") !== true) return base;
  const { WAYLAND_DISPLAY: _unused, ...rest } = base;
  return { ...rest, XDG_SESSION_TYPE: "x11" };
}

/** Gives every test of a file a folder, a user data folder and ports of its own, and cleans up after it. */
export function useDesktop(): void {
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "difracta-desktop-e2e-"));
    userData = path.join(dir, "user-data");
    env = {
      ...displayEnvironment(process.env as Record<string, string>),
      DIFRACTA_PORT: String(await sparePort()),
      // Nothing of a test run belongs on the network.
      DIFRACTA_NO_OSC: "1",
      DIFRACTA_NO_DISCOVERY: "1",
      // Nor in the person's own autostart folder: Start at Login writes under here.
      XDG_CONFIG_HOME: path.join(dir, "config"),
    };
  });

  afterEach(async () => {
    await app?.close().catch(() => undefined);
    app = undefined;
    await stopStandalone();
    await rm(dir, { recursive: true, force: true });
  });
}

/** Quits the app and waits for it, for a test that launches again. */
export async function quit(): Promise<void> {
  await app?.close();
  app = undefined;
}
