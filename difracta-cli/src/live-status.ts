import { orderedEntries, type Document } from "@difracta/core";
import type { LiveState, OscLive, OutputSessionLive } from "@difracta/protocol";

/**
 * What is happening around the Outputs right now, read from the live state
 * a `live` subscription carries: each Output's Sessions with their telemetry
 * reduced to what a shell reader wants (fps from the frame interval, render
 * time, resolution, the Layers that failed), and the OSC door.
 */
export interface IssueStatus {
  readonly layerId: string;
  /** The Layer's name, when it still exists. */
  readonly layer: string | undefined;
  readonly definition: string;
  readonly message: string;
}

export interface SessionStatus {
  readonly sessionId: string;
  /** Reporting within the stale window; a stale Session is still attached. */
  readonly connected: boolean;
  readonly fps: number | null;
  readonly renderMs: number | null;
  readonly resolution: string | null;
  readonly issues: readonly IssueStatus[];
}

export interface OutputStatus {
  readonly id: string;
  readonly name: string;
  readonly sessions: readonly SessionStatus[];
}

export interface LiveStatus {
  readonly osc: OscLive;
  readonly outputs: readonly OutputStatus[];
}

export function liveStatus(document: Document, live: LiveState): LiveStatus {
  return {
    osc: live.osc,
    outputs: orderedEntries(document.outputs).map((output) => ({
      id: output.id,
      name: output.name,
      sessions: Object.values(live.outputs[output.id]?.sessions ?? {})
        .sort((a, b) => a.connectedAt - b.connectedAt)
        .map((session) => sessionStatus(document, session)),
    })),
  };
}

function sessionStatus(
  document: Document,
  session: OutputSessionLive,
): SessionStatus {
  const telemetry = session.telemetry;
  const interval = telemetry?.frameIntervalMs ?? null;
  const work = telemetry?.renderWorkMs ?? null;
  return {
    sessionId: session.sessionId,
    connected: !session.stale,
    fps:
      interval === null || interval <= 0 ? null : Math.round(1000 / interval),
    renderMs: work === null ? null : Math.round(work * 10) / 10,
    resolution:
      telemetry === null || telemetry === undefined
        ? null
        : `${String(telemetry.width)}×${String(telemetry.height)}`,
    // A report without the list means every Layer ran.
    issues: (telemetry?.issues ?? []).map((issue) => ({
      layerId: issue.layerId,
      layer: document.layers[issue.layerId]?.name,
      definition: issue.definition,
      message: issue.message,
    })),
  };
}

export function formatLiveStatus(status: LiveStatus): string[] {
  const lines: string[] = [];
  for (const output of status.outputs) {
    lines.push(
      `${output.name}  ${output.id}${output.sessions.length === 0 ? "  no Output Session" : ""}`,
    );
    for (const session of output.sessions) {
      lines.push(
        `  ${session.sessionId}  ${session.connected ? "connected" : "stale"}  ${session.fps === null ? "—" : String(session.fps)} fps  ${session.renderMs === null ? "—" : `${String(session.renderMs)} ms`}  ${session.resolution ?? "—"}`,
      );
      for (const issue of session.issues)
        lines.push(
          `    issue: ${issue.layer ?? issue.layerId} (${issue.definition}): ${issue.message}`,
        );
    }
  }
  lines.push(
    status.osc.port === null
      ? "OSC is off."
      : `OSC on port ${String(status.osc.port)}, ${String(status.osc.listeners)} OSCQuery ${status.osc.listeners === 1 ? "listener" : "listeners"}`,
  );
  return lines;
}
