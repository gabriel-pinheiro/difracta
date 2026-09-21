import { DifractaClient } from "@difracta/client";

import { app, env, eventually } from "./harness.ts";

/**
 * Questions to the Desktop a test launched, and to its runtime, for the tests
 * of Desktop running as an appliance (`appliance.test.ts`).
 */

/** Whether the runtime Desktop started answers. */
export async function health(): Promise<boolean> {
  return fetch(`http://127.0.0.1:${env.DIFRACTA_PORT ?? ""}/health`).then(
    (response) => response.ok,
    () => false,
  );
}

/** How many windows Desktop has open, asked of its main process. */
export async function windowCount(): Promise<number | undefined> {
  return app?.evaluate(
    ({ BrowserWindow }) => BrowserWindow.getAllWindows().length,
  );
}

/**
 * The PID of the runtime child of the Desktop this test launched, from that
 * Desktop's own process list, so a test that kills a runtime can only ever
 * kill its own.
 */
export async function runtimeChildPid(): Promise<number | undefined> {
  return app?.evaluate(
    ({ app: electronApp }) =>
      electronApp
        .getAppMetrics()
        .find(
          (metric) =>
            metric.type === "Utility" &&
            (metric.serviceName === "Difracta Runtime" ||
              metric.name === "Difracta Runtime"),
        )?.pid,
  );
}

/**
 * Answers every native message box of main's with `response` from now on (a
 * native dialog cannot be clicked from here) and collects what each asked.
 */
export async function answerDialogs(response: number): Promise<void> {
  await app?.evaluate(({ dialog }, answer) => {
    const asked = ((globalThis as { asked?: string[] }).asked ??= []);
    dialog.showMessageBox = (...args: unknown[]) => {
      const options = (args.length > 1 ? args[1] : args[0]) as {
        message: string;
        detail?: string;
        buttons: string[];
      };
      asked.push(
        `${options.message} ${options.detail ?? ""} ${options.buttons.join("/")}`,
      );
      return Promise.resolve({ response: answer, checkboxChecked: false });
    };
  }, response);
}

export async function askedDialogs(): Promise<string[]> {
  const asked = await app?.evaluate(
    () => (globalThis as { asked?: string[] }).asked ?? [],
  );
  return asked ?? [];
}

/** The name of the Installation the runtime has open, asked as another client. */
export async function openInstallationName(
  port: string | undefined,
): Promise<string | undefined> {
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
    return summary?.name;
  } finally {
    client.close();
  }
}

/** How many Output Sessions the runtime counts, asked as another client that follows live state. */
export async function attachedOutputSessions(
  port: string | undefined,
): Promise<number> {
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
    const view = client.openDocument(summary?.id ?? "", { live: true });
    await eventually(
      () => Promise.resolve(view.get()),
      (document) => document !== undefined,
    );
    return Object.values(view.liveState.get().outputs).flatMap((output) =>
      Object.values(output.sessions),
    ).length;
  } finally {
    client.close();
  }
}

/** Whether a checkbox of the native menu is checked. */
export async function menuChecked(id: string): Promise<boolean | undefined> {
  return app?.evaluate(
    ({ Menu }, itemId) =>
      Menu.getApplicationMenu()?.getMenuItemById(itemId)?.checked,
    id,
  );
}
