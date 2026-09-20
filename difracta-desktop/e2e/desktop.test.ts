import { DifractaClient } from "@difracta/client";
import { emptyDocument } from "@difracta/core";
import { spawn } from "node:child_process";
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

    // The second instance finds the lock taken, passes its file on and exits.
    // Playwright starts Electron with --no-sandbox on Linux, where a checkout's
    // Electron often cannot use Chromium's sandbox; this launch does the same.
    const other = spawn(
      (await import("electron")).default as unknown as string,
      [
        ...(process.platform === "linux" ? ["--no-sandbox"] : []),
        ...launchArguments(second),
      ],
      { env, stdio: "ignore" },
    );
    const exited = new Promise((resolve) => other.once("exit", resolve));
    await page.waitForFunction(() => document.title.startsWith("Second"));
    await exited;
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

  it("starts with an untitled Installation, and stops its runtime on quit", async () => {
    const page = await launch();
    await page.waitForFunction(() => document.title.startsWith("Untitled"));
    // Untouched, so not dirty: no asterisk, and quitting asks nothing.
    expect(await page.title()).toBe("Untitled – Difracta Studio");

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
  });
});
