import type { OutputSessionLive } from "@difracta/protocol";

/** Presentation helpers for Output Sessions and their telemetry. */
export type SessionTable = Readonly<Record<string, OutputSessionLive>>;

export function sessionList(
  sessions: SessionTable | undefined,
): readonly OutputSessionLive[] {
  return Object.values(sessions ?? {}).sort(
    (a, b) => a.connectedAt - b.connectedAt,
  );
}

/** Connected and fresh; stale sessions count as a warning, not a connection. */
export function liveSessions(
  sessions: readonly OutputSessionLive[],
): readonly OutputSessionLive[] {
  return sessions.filter((session) => !session.stale);
}

/** The session whose numbers the card shows: the freshest one that reported. */
export function primarySession(
  sessions: readonly OutputSessionLive[],
): OutputSessionLive | undefined {
  return [...sessions]
    .filter((session) => session.telemetry !== null)
    .sort((a, b) => (b.reportedAt ?? 0) - (a.reportedAt ?? 0))[0];
}

export function formatFps(frameIntervalMs: number | null | undefined): string {
  if (
    frameIntervalMs === null ||
    frameIntervalMs === undefined ||
    frameIntervalMs <= 0
  )
    return "—";
  return (1000 / frameIntervalMs).toFixed(0);
}

export function formatMs(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value.toFixed(1)} ms`;
}

export function formatResolution(
  session: OutputSessionLive | undefined,
): string {
  const telemetry = session?.telemetry;
  return telemetry
    ? `${String(telemetry.width)}×${String(telemetry.height)}`
    : "—";
}

export function formatScale(session: OutputSessionLive | undefined): string {
  const ratio = session?.telemetry?.pixelRatio;
  return ratio === undefined ? "—" : `@${trimNumber(ratio)}×`;
}

function trimNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "");
}

/** Dot color for a set of sessions. */
export function presenceTone(
  sessions: readonly OutputSessionLive[],
): "off" | "live" | "stale" {
  if (sessions.length === 0) return "off";
  return liveSessions(sessions).length > 0 ? "live" : "stale";
}

export const toneClass = {
  off: "bg-muted-foreground/30",
  live: "bg-emerald-400",
  stale: "bg-amber-400",
} as const;

export function toneTitle(sessions: readonly OutputSessionLive[]): string {
  const tone = presenceTone(sessions);
  if (tone === "off") return "No Output Session connected";
  const live = liveSessions(sessions).length;
  const count = sessions.length;
  return tone === "live"
    ? `${String(live)} of ${String(count)} Output ${count === 1 ? "Session" : "Sessions"} reporting`
    : `${String(count)} Output ${count === 1 ? "Session" : "Sessions"} stopped reporting`;
}

/** "12 s ago", "3 min ago", for a stale session's last report (or attach). */
export function formatLastSeen(
  session: OutputSessionLive,
  now: number,
): string {
  const seconds = Math.max(
    0,
    Math.round((now - (session.reportedAt ?? session.connectedAt)) / 1000),
  );
  if (seconds < 60) return `last seen ${String(seconds)} s ago`;
  const minutes = Math.round(seconds / 60);
  return `last seen ${String(minutes)} min ago`;
}

/** What a session row reports: fps while fresh, time since the last report when stale. */
export function sessionStatus(session: OutputSessionLive, now: number): string {
  return session.stale
    ? formatLastSeen(session, now)
    : `${formatFps(session.telemetry?.frameIntervalMs)} fps`;
}
