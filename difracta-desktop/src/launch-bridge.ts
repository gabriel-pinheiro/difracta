import { ipcMain, type IpcMainInvokeEvent } from "electron";

import {
  launchChannels,
  type LaunchCurrent,
  type LaunchRemembered,
  type LaunchResult,
  type LaunchRuntime,
} from "./launch-contract.ts";
import { isLaunchPage } from "./launch-scheme.ts";

/** What main does for each function of `window.difractaLaunch`. */
export interface LaunchBridgeHandlers {
  problem(): string | null;
  current(): LaunchCurrent | null;
  runLocal(): Promise<LaunchResult>;
  connect(address: string): Promise<LaunchResult>;
  runtimes(): LaunchRuntime[];
  remembered(): Promise<LaunchRemembered[]>;
  forget(address: string): Promise<LaunchRemembered[]>;
}

/**
 * The main side of the launch bridge, registered once. As with the file
 * dialogs, a message proves only that some frame sent it, so each is checked
 * to come from the launch page itself; anyone else's call is rejected.
 * Arguments cross a process boundary, so they are `unknown` until checked.
 */
export function registerLaunchBridge(handlers: LaunchBridgeHandlers): void {
  const handle = <Result>(
    channel: string,
    answer: (argument: unknown) => Result | Promise<Result>,
  ): void => {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, argument: unknown) => {
      if (!isLaunchPage(event.senderFrame?.url))
        throw new Error("Only the launch page may ask this.");
      return answer(argument);
    });
  };
  const address = (argument: unknown): string =>
    typeof argument === "string" ? argument : "";

  handle(launchChannels.problem, () => handlers.problem());
  handle(launchChannels.current, () => handlers.current());
  handle(launchChannels.runLocal, () => handlers.runLocal());
  handle(launchChannels.connect, (argument) =>
    handlers.connect(address(argument)),
  );
  handle(launchChannels.runtimes, () => handlers.runtimes());
  handle(launchChannels.remembered, () => handlers.remembered());
  handle(launchChannels.forget, (argument) =>
    handlers.forget(address(argument)),
  );
}
