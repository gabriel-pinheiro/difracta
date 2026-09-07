import { settings, type Patch } from "@difracta/core";
import type {
  LiveState,
  OutputSessionLive,
  OutputTelemetry,
} from "@difracta/protocol";

export interface OutputPresenceOptions {
  readonly now?: () => number;
  readonly staleAfterMs?: number;
  readonly dropAfterMs?: number;
  readonly sweepIntervalMs?: number;
}

/**
 * The Output Sessions of the open document: which connections show which
 * Output and what they last reported. Every change is emitted as patches
 * relative to the live root, `["outputs", outputId, "sessions", sessionId]`,
 * so subscribers pay one small message per report. A session that stops
 * reporting turns stale, then is dropped; a closed socket drops it at once.
 */
export class OutputPresence {
  readonly #entries = new Map<string, OutputSessionLive>();
  readonly #listeners = new Set<(patches: readonly Patch[]) => void>();
  readonly #options: Required<OutputPresenceOptions>;
  #sweep: NodeJS.Timeout | undefined;

  constructor(options: OutputPresenceOptions = {}) {
    this.#options = {
      now: options.now ?? Date.now,
      staleAfterMs: options.staleAfterMs ?? settings.live.staleAfterMs,
      dropAfterMs: options.dropAfterMs ?? settings.live.dropAfterMs,
      sweepIntervalMs: options.sweepIntervalMs ?? settings.live.sweepIntervalMs,
    };
  }

  onChange(listener: (patches: readonly Patch[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  state(): LiveState {
    const outputs: Record<
      string,
      { sessions: Record<string, OutputSessionLive> }
    > = {};
    for (const entry of this.#entries.values()) {
      const output = (outputs[entry.outputId] ??= { sessions: {} });
      output.sessions[entry.sessionId] = entry;
    }
    return { outputs };
  }

  sessionsOf(outputId: string): readonly OutputSessionLive[] {
    return [...this.#entries.values()].filter(
      (entry) => entry.outputId === outputId,
    );
  }

  attach(sessionId: string, outputId: string): void {
    const existing = this.#entries.get(sessionId);
    if (existing?.outputId === outputId) return;
    if (existing !== undefined) this.detach(sessionId);
    const entry: OutputSessionLive = {
      sessionId,
      outputId,
      connectedAt: this.#options.now(),
      reportedAt: null,
      stale: false,
      telemetry: null,
    };
    this.#entries.set(sessionId, entry);
    this.#emit([{ op: "set", path: pathOf(entry), value: entry }]);
    this.#ensureSweep();
  }

  detach(sessionId: string): void {
    const entry = this.#entries.get(sessionId);
    if (entry === undefined) return;
    this.#entries.delete(sessionId);
    const patches: Patch[] = [{ op: "remove", path: pathOf(entry) }];
    if (this.sessionsOf(entry.outputId).length === 0)
      patches.push({ op: "remove", path: ["outputs", entry.outputId] });
    this.#emit(patches);
    if (this.#entries.size === 0) this.#stopSweep();
  }

  report(sessionId: string, telemetry: OutputTelemetry): void {
    const entry = this.#entries.get(sessionId);
    if (entry === undefined) return;
    const next: OutputSessionLive = {
      ...entry,
      reportedAt: this.#options.now(),
      stale: false,
      telemetry,
    };
    this.#entries.set(sessionId, next);
    this.#emit([{ op: "set", path: pathOf(next), value: next }]);
  }

  /** Drops sessions whose Output is no longer in the document. */
  reconcile(outputIds: ReadonlySet<string>): void {
    for (const entry of [...this.#entries.values()]) {
      if (!outputIds.has(entry.outputId)) this.detach(entry.sessionId);
    }
  }

  /** Marks silent sessions stale and drops long-silent ones. */
  sweep(): void {
    const now = this.#options.now();
    for (const entry of [...this.#entries.values()]) {
      const since = now - (entry.reportedAt ?? entry.connectedAt);
      if (since > this.#options.dropAfterMs) {
        this.detach(entry.sessionId);
      } else if (!entry.stale && since > this.#options.staleAfterMs) {
        const next = { ...entry, stale: true };
        this.#entries.set(entry.sessionId, next);
        this.#emit([{ op: "set", path: pathOf(next), value: next }]);
      }
    }
  }

  close(): void {
    this.#stopSweep();
    this.#entries.clear();
  }

  #ensureSweep(): void {
    if (this.#sweep !== undefined) return;
    this.#sweep = setInterval(
      () => this.sweep(),
      this.#options.sweepIntervalMs,
    );
    this.#sweep.unref();
  }

  #stopSweep(): void {
    if (this.#sweep !== undefined) clearInterval(this.#sweep);
    this.#sweep = undefined;
  }

  #emit(patches: readonly Patch[]): void {
    for (const listener of this.#listeners) listener(patches);
  }
}

function pathOf(entry: OutputSessionLive): readonly string[] {
  return ["outputs", entry.outputId, "sessions", entry.sessionId];
}
