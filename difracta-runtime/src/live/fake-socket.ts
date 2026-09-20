import type { ClientMessage, ServerMessage } from "@difracta/protocol";
import { EventEmitter } from "node:events";

/** A `ws` socket as the LiveServer sees it, driven from the test. */
export class FakeSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = this.OPEN;
  readonly sent: ServerMessage[] = [];

  send(data: string): void {
    this.sent.push(JSON.parse(data) as ServerMessage);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  receive(message: ClientMessage): void {
    this.emit("message", Buffer.from(JSON.stringify(message)));
  }

  reply(requestId: string): Extract<ServerMessage, { type: "reply" }> {
    const found = this.sent.find(
      (message) => message.type === "reply" && message.requestId === requestId,
    );
    if (found?.type !== "reply") throw new Error(`No reply to ${requestId}.`);
    return found;
  }
}
