import { DifractaClient } from "@difracta/client";
import { emptyDocument } from "@difracta/core";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "playwright";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { serializeDocument } from "../../difracta-runtime/src/documents/document-file.ts";

const packageDir = fileURLToPath(new URL("..", import.meta.url));

/** A port nothing uses, so the suite never meets a runtime already on 4800. */
async function sparePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function eventually<T>(
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

let dir: string;
let userData: string;
let env: Record<string, string>;
let app: ElectronApplication | undefined;
let standalone: ChildProcess | undefined;

/** The app's arguments: its folder, a user data folder of its own, maybe a file. */
const launchArguments = (file?: string): string[] => [
  packageDir,
  `--user-data-dir=${userData}`,
  ...(file === undefined ? [] : [file]),
];

async function launch(file?: string): Promise<Page> {
  app = await electron.launch({ args: launchArguments(file), env });
  return app.firstWindow();
}

const LAUNCH_PAGE = "app://desktop/studio/launch.html";

/** The window an action opens: Studio's after a choice on the launch page, the launch page's after Switch. */
async function windowAfter(action: () => Promise<void>): Promise<Page> {
  const [window] = await Promise.all([app?.waitForEvent("window"), action()]);
  if (window === undefined) throw new Error("No application.");
  return window;
}

/** A launch that lands on the launch page. */
async function launchToPage(): Promise<Page> {
  const page = await launch();
  await page.waitForURL(LAUNCH_PAGE);
  return page;
}

/**
 * A runtime of its own, as a mini-PC would run one: the bundle Desktop forks,
 * started by the test on a spare port with `file` pinned.
 */
async function standaloneRuntime(file: string): Promise<number> {
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

async function stopStandalone(): Promise<void> {
  const child = standalone;
  standalone = undefined;
  if (child?.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await exited;
}

/** Clicks an item of the native menu, which no page can reach. */
async function clickMenu(menu: string, item: string): Promise<void> {
  await app?.evaluate(
    ({ Menu }, [menuLabel, itemLabel]) => {
      Menu.getApplicationMenu()
        ?.items.find((entry) => entry.label === menuLabel)
        ?.submenu?.items.find((entry) => entry.label === itemLabel)
        ?.click();
    },
    [menu, item] as const,
  );
}

/**
 * A second launch: it finds the lock taken, passes its file on and exits.
 * Playwright starts Electron with --no-sandbox on Linux, where a checkout's
 * Electron often cannot use Chromium's sandbox; this launch does the same.
 */
async function secondLaunch(file: string): Promise<void> {
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

async function installationFile(name: string): Promise<string> {
  const file = path.join(dir, `${name}.difracta`);
  await writeFile(file, serializeDocument(emptyDocument(name)));
  return file;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "difracta-desktop-e2e-"));
  userData = path.join(dir, "user-data");
  env = {
    ...(process.env as Record<string, string>),
    DIFRACTA_PORT: String(await sparePort()),
    // Nothing of a test run belongs on the network.
    DIFRACTA_NO_OSC: "1",
    DIFRACTA_NO_DISCOVERY: "1",
  };
});

afterEach(async () => {
  await app?.close().catch(() => undefined);
  app = undefined;
  await stopStandalone();
  await rm(dir, { recursive: true, force: true });
});

describe("Difracta Desktop", () => {
  it("opens the file it is launched with, in a Studio that has the bridge", async () => {
    const file = await installationFile("Tonight");
    const page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Tonight"));

    expect(page.url()).toBe(`http://127.0.0.1:${env.DIFRACTA_PORT}/studio/`);
    expect(
      await page.evaluate(() => ({
        bridge: Object.keys(window.difractaDesktop ?? {}).sort(),
        node: typeof (globalThis as { require?: unknown }).require,
      })),
    ).toEqual({
      bridge: ["onOpenRequest", "pickOpenPath", "pickSavePath"],
      node: "undefined",
    });

    // An Output page opened from Studio is an app window without the bridge;
    // a link to anywhere else never replaces Studio.
    const [output] = await Promise.all([
      app?.waitForEvent("window"),
      page.evaluate(() => {
        window.open(`${location.origin}/output/?output=none`);
      }),
    ]);
    await output?.waitForURL(/\/output\/\?output=none$/);
    expect(await output?.evaluate(() => typeof window.difractaDesktop)).toBe(
      "undefined",
    );
    await page.evaluate(() => {
      location.href = "http://127.0.0.1:9/elsewhere";
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(page.url()).toContain("/studio/");

    // The file is remembered for the next launch.
    const state = path.join(userData, "desktop-state.json");
    await eventually(
      () => readFile(state, "utf8"),
      (text) => (JSON.parse(text) as { lastFile?: string }).lastFile === file,
    );
  });

  it("reopens the last file, and has a second launch open its file in the first", async () => {
    const first = await installationFile("First");
    const second = await installationFile("Second");
    let page = await launch(first);
    await page.waitForFunction(() => document.title.startsWith("First"));
    await app?.close();

    page = await launch();
    await page.waitForFunction(() => document.title.startsWith("First"));

    await Promise.all([
      secondLaunch(second),
      page.waitForFunction(() => document.title.startsWith("Second")),
    ]);
  });

  it("asks about unsaved changes when its window closes, and Save saves", async () => {
    const file = await installationFile("Before");
    const page = await launch(file);
    await page.waitForFunction(() => document.title.startsWith("Before"));

    // A change from another client, as the CLI would make it.
    const client = new DifractaClient({
      url: `ws://127.0.0.1:${env.DIFRACTA_PORT}/live`,
      kind: "cli",
      reconnect: false,
    });
    const summary = await eventually(
      () => Promise.resolve(client.document.get()),
      (document) => document !== null,
    );
    await client.command(summary?.id ?? "", "installation.rename", {
      name: "After",
    });
    client.close();
    await page.waitForFunction(() => document.title.startsWith("After*"));

    // A native dialog cannot be clicked from here, so main's is answered for it.
    const asked = await app?.evaluate(({ dialog, BrowserWindow }) => {
      return new Promise<string>((resolve) => {
        dialog.showMessageBox = (...args: unknown[]) => {
          const options = args[1] as { message: string; buttons: string[] };
          resolve(`${options.message} ${options.buttons.join("/")}`);
          return Promise.resolve({ response: 0, checkboxChecked: false });
        };
        BrowserWindow.getAllWindows()[0]?.close();
      });
    });
    expect(asked).toBe("Save the changes to “After”? Save/Don't Save/Cancel");
    await eventually(
      () => readFile(file, "utf8"),
      (text) => text.includes('"After"'),
    );
  });

  it("asks where to run on the first launch, and runs on this computer", async () => {
    const launchPage = await launchToPage();
    expect(
      await launchPage.evaluate(() => ({
        launch: Object.keys(window.difractaLaunch ?? {}).sort(),
        desktop: typeof window.difractaDesktop,
        node: typeof (globalThis as { require?: unknown }).require,
      })),
    ).toEqual({
      launch: [
        "connect",
        "forget",
        "onRuntimesChanged",
        "problem",
        "remembered",
        "runLocal",
        "runtimes",
      ],
      desktop: "undefined",
      node: "undefined",
    });
    // The scheme serves the launch page, not the rest of what is in dist/.
    expect(
      await launchPage.evaluate(async () =>
        Promise.all(
          [
            "/studio/index.html",
            "/main.js",
            "/studio/assets/..%2F..%2Fmain.js",
          ].map(async (url) => (await fetch(url)).status),
        ),
      ),
    ).toEqual([404, 404, 404]);

    const page = await windowAfter(() =>
      launchPage.getByRole("button", { name: "Run on this computer" }).click(),
    );
    await page.waitForFunction(() => document.title.startsWith("Untitled"));
    expect(page.url()).toBe(`http://127.0.0.1:${env.DIFRACTA_PORT}/studio/`);
    // Untouched, so not dirty: no asterisk, and quitting asks nothing.
    expect(await page.title()).toBe("Untitled – Difracta Studio");
    expect(
      await page.evaluate(() => ({
        desktop: typeof window.difractaDesktop,
        launch: typeof window.difractaLaunch,
      })),
    ).toEqual({ desktop: "object", launch: "undefined" });
    await eventually(
      () => Promise.resolve(launchPage.isClosed()),
      (closed) => closed,
    );

    // Quitting stops the runtime.
    await app?.close();
    app = undefined;
    const log = await readFile(
      path.join(userData, "logs", "runtime.log"),
      "utf8",
    );
    expect(log).toContain("Stopping Difracta Runtime");
    await expect(
      fetch(`http://127.0.0.1:${env.DIFRACTA_PORT}/health`),
    ).rejects.toThrow();

    // The next launch runs on this computer again, without asking.
    const resumed = await launch();
    await resumed.waitForFunction(() => document.title.startsWith("Untitled"));
    expect(resumed.url()).toContain(`:${env.DIFRACTA_PORT}/studio/`);
  });

  it("connects to a runtime by address, resumes it, and switches back", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");

    await address.fill("not an address");
    await address.press("Enter");
    await launchPage
      .getByRole("alert")
      .filter({ hasText: "not an address" })
      .waitFor();

    // A runtime elsewhere shows its own Studio, and gets no bridge of any kind.
    await address.fill(`127.0.0.1:${port}`);
    let page = await windowAfter(() => address.press("Enter"));
    await page.waitForFunction(() => document.title.startsWith("Elsewhere"));
    expect(page.url()).toBe(`http://127.0.0.1:${port}/studio/`);
    expect(
      await page.evaluate(() => ({
        desktop: typeof window.difractaDesktop,
        launch: typeof window.difractaLaunch,
      })),
    ).toEqual({ desktop: "undefined", launch: "undefined" });
    // Main names the runtime in the title, from its own link to it.
    await eventually(
      () =>
        app?.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0]?.getTitle(),
        ) ?? Promise.resolve(undefined),
      (title) => title === `Elsewhere – 127.0.0.1:${port} – Difracta`,
    );
    // No runtime was started on this computer for it.
    await expect(
      fetch(`http://127.0.0.1:${env.DIFRACTA_PORT}/health`),
    ).rejects.toThrow();

    // The next launch goes straight back to it.
    await app?.close();
    page = await launch();
    await page.waitForFunction(() => document.title.startsWith("Elsewhere"));
    expect(page.url()).toBe(`http://127.0.0.1:${port}/studio/`);

    // Runtime ▸ Switch… returns to the launch page, which remembers it.
    const again = await windowAfter(() => clickMenu("Runtime", "Switch…"));
    await again.waitForURL(LAUNCH_PAGE);
    await again.getByText("Not on the network now").waitFor();
    await eventually(
      () => Promise.resolve(page.isClosed()),
      (closed) => closed,
    );

    // A remembered runtime that is gone sends the next launch here, saying why.
    await app?.close();
    await stopStandalone();
    const fallback = await launchToPage();
    await fallback
      .getByRole("alert")
      .filter({ hasText: `No Runtime answered at 127.0.0.1:${port}` })
      .waitFor();
  });

  it("asks before a file from the OS takes it away from a runtime elsewhere", async () => {
    const port = await standaloneRuntime(await installationFile("Elsewhere"));
    const file = await installationFile("Here");
    const launchPage = await launchToPage();
    const address = launchPage.getByRole("textbox");
    await address.fill(`http://127.0.0.1:${port}/studio/`);
    const remote = await windowAfter(() => address.press("Enter"));
    await remote.waitForFunction(() => document.title.startsWith("Elsewhere"));

    // Cancel keeps the remote session; Switch and Open runs the file here.
    for (const answer of [1, 0]) {
      const asked = app?.evaluate(({ dialog }, response) => {
        return new Promise<string>((resolve) => {
          dialog.showMessageBox = (...args: unknown[]) => {
            const options = args[1] as { message: string; buttons: string[] };
            resolve(`${options.message} ${options.buttons.join("/")}`);
            return Promise.resolve({ response, checkboxChecked: false });
          };
        });
      }, answer);
      if (answer === 1) {
        await secondLaunch(file);
        expect(await asked).toBe(
          "Open “Here.difracta” on this computer? Switch and Open/Cancel",
        );
        expect(remote.isClosed()).toBe(false);
      } else {
        const local = await windowAfter(() => secondLaunch(file));
        await local.waitForFunction(() => document.title.startsWith("Here"));
        expect(local.url()).toBe(
          `http://127.0.0.1:${env.DIFRACTA_PORT}/studio/`,
        );
        expect(await local.evaluate(() => typeof window.difractaDesktop)).toBe(
          "object",
        );
      }
    }
  });

  it("says on the launch page why this computer's runtime cannot start, and switches from local", async () => {
    // Something else holds Desktop's port.
    const blocker = createServer();
    await new Promise<void>((resolve) =>
      blocker.listen(Number(env.DIFRACTA_PORT), "0.0.0.0", resolve),
    );
    const launchPage = await launchToPage();
    const run = launchPage.getByRole("button", {
      name: "Run on this computer",
    });
    await run.click();
    await launchPage
      .getByRole("alert")
      .filter({ hasText: "already in use" })
      .waitFor();

    await new Promise((resolve) => blocker.close(resolve));
    const page = await windowAfter(() => run.click());
    await page.waitForFunction(() => document.title.startsWith("Untitled"));

    // Switching away stops the runtime before the launch page offers anything.
    const again = await windowAfter(() => clickMenu("Runtime", "Switch…"));
    await again.waitForURL(LAUNCH_PAGE);
    await expect(
      fetch(`http://127.0.0.1:${env.DIFRACTA_PORT}/health`),
    ).rejects.toThrow();
  });
});
