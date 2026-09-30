import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";

import { isSharePage } from "./launch-scheme.ts";
import { shareChannels, type ShareSourceKind } from "./share-contract.ts";
import type { ScreenSharing } from "./screen-sharing.ts";

/**
 * The main side of the share bridge, registered once. A message proves
 * only that some frame sent it, so each is checked to come from the share
 * page itself, in the share window of the session Desktop is in; anyone
 * else's is rejected. Arguments cross a process boundary, so they are
 * `unknown` until checked.
 */
export function registerShareBridge(
  current: () => ScreenSharing | undefined,
): void {
  const sharing = (
    event: IpcMainInvokeEvent | IpcMainEvent,
  ): ScreenSharing | undefined => {
    const session = current();
    return session !== undefined &&
      isSharePage(event.senderFrame?.url) &&
      session.owns(event.sender)
      ? session
      : undefined;
  };
  const handle = <Result>(
    channel: string,
    answer: (
      session: ScreenSharing,
      argument: unknown,
    ) => Result | Promise<Result>,
  ): void => {
    ipcMain.handle(channel, (event, argument: unknown) => {
      const session = sharing(event);
      if (session === undefined)
        throw new Error("Only the share window may ask this.");
      return answer(session, argument);
    });
  };
  const kind = (argument: unknown): ShareSourceKind =>
    argument === "screen" ? "screen" : "window";

  handle(shareChannels.context, (session) => session.context());
  handle(shareChannels.sources, (session, argument) =>
    session.sources(kind(argument)),
  );
  handle(shareChannels.choose, (session, argument) =>
    session.choose(typeof argument === "string" ? argument : null),
  );
  ipcMain.on(shareChannels.report, (event, argument: unknown) => {
    sharing(event)?.report(argument);
  });
}
