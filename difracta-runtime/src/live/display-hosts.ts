import type { Patch } from "@difracta/core";
import type {
  Display,
  DisplayHostLive,
  DisplayHostReport,
  LiveState,
} from "@difracta/protocol";

export type Found<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: string };

/**
 * The connected Display Hosts: one per `desktop` connection that offered its
 * Displays. They belong to connections, not to the document, so they stay
 * when the document is replaced and go when their socket closes. Every change
 * is emitted as patches relative to the live root, under
 * `["displayHosts", hostId]`, one per property that changed and one per
 * Display whose Output changed.
 *
 * A host's id is its name as a slug, numbered while another connected host
 * holds that slug, so a person can type it; it stays for the connection's
 * lifetime even if the host renames itself.
 */
export class DisplayHosts {
  readonly #bySession = new Map<string, DisplayHostLive>();
  readonly #listeners = new Set<(patches: readonly Patch[]) => void>();
  readonly #now: () => number;

  constructor(options: { readonly now?: () => number } = {}) {
    this.#now = options.now ?? Date.now;
  }

  onChange(listener: (patches: readonly Patch[]) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  state(): Pick<LiveState, "displayHosts"> {
    return {
      displayHosts: Object.fromEntries(
        this.list().map((host) => [host.id, host]),
      ),
    };
  }

  /** Oldest connection first. */
  list(): readonly DisplayHostLive[] {
    return [...this.#bySession.values()];
  }

  ofSession(sessionId: string): DisplayHostLive | undefined {
    return this.#bySession.get(sessionId);
  }

  /** The first report of a connection registers it; later ones update what changed. */
  report(sessionId: string, report: DisplayHostReport): void {
    const existing = this.#bySession.get(sessionId);
    if (existing === undefined) {
      const host: DisplayHostLive = {
        id: this.#freeId(report.name),
        sessionId,
        connectedAt: this.#now(),
        ...report,
      };
      this.#bySession.set(sessionId, host);
      this.#emit([{ op: "set", path: ["displayHosts", host.id], value: host }]);
      return;
    }
    const next: DisplayHostLive = { ...existing, ...report };
    const root = ["displayHosts", existing.id];
    const patches: Patch[] = [];
    if (next.name !== existing.name)
      patches.push({ op: "set", path: [...root, "name"], value: next.name });
    if (JSON.stringify(next.displays) !== JSON.stringify(existing.displays))
      patches.push({
        op: "set",
        path: [...root, "displays"],
        value: next.displays,
      });
    for (const display of Object.keys(existing.showing)) {
      if (next.showing[display] === undefined)
        patches.push({ op: "remove", path: [...root, "showing", display] });
    }
    for (const [display, output] of Object.entries(next.showing)) {
      if (existing.showing[display] !== output)
        patches.push({
          op: "set",
          path: [...root, "showing", display],
          value: output,
        });
    }
    if (patches.length === 0) return;
    this.#bySession.set(sessionId, next);
    this.#emit(patches);
  }

  withdraw(sessionId: string): void {
    const host = this.#bySession.get(sessionId);
    if (host === undefined) return;
    this.#bySession.delete(sessionId);
    this.#emit([{ op: "remove", path: ["displayHosts", host.id] }]);
  }

  /** A host by id, or by name (ignoring case) when only one connected host has it. */
  find(reference: string): Found<DisplayHostLive> {
    const hosts = this.list();
    const byId = hosts.find((host) => host.id === reference);
    if (byId !== undefined) return { ok: true, value: byId };
    const wanted = reference.toLowerCase();
    const named = hosts.filter((host) => host.name.toLowerCase() === wanted);
    const [only] = named;
    if (only !== undefined && named.length === 1)
      return { ok: true, value: only };
    if (named.length > 1)
      return {
        ok: false,
        error: `${String(named.length)} Display Hosts are named “${reference}”; use an id: ${named.map((host) => host.id).join(", ")}.`,
      };
    return {
      ok: false,
      error:
        hosts.length === 0
          ? `No Display Host “${reference}”: none is connected.`
          : `No Display Host “${reference}”. Connected: ${hosts.map((host) => host.id).join(", ")}.`,
    };
  }

  close(): void {
    this.#bySession.clear();
  }

  #freeId(name: string): string {
    const taken = new Set(this.list().map((host) => host.id));
    const slug = slugOf(name);
    if (!taken.has(slug)) return slug;
    let suffix = 2;
    while (taken.has(`${slug}-${String(suffix)}`)) suffix += 1;
    return `${slug}-${String(suffix)}`;
  }

  #emit(patches: readonly Patch[]): void {
    for (const listener of this.#listeners) listener(patches);
  }
}

/** A Display of a host by id, or by label (ignoring case) when only one has it. */
export function findDisplay(
  host: DisplayHostLive,
  reference: string,
): Found<Display> {
  const byId = host.displays.find((display) => display.id === reference);
  if (byId !== undefined) return { ok: true, value: byId };
  const wanted = reference.toLowerCase();
  const labelled = host.displays.filter(
    (display) => display.label.toLowerCase() === wanted,
  );
  const [only] = labelled;
  if (only !== undefined && labelled.length === 1)
    return { ok: true, value: only };
  const ids = host.displays.map((display) => display.id).join(", ");
  return {
    ok: false,
    error:
      labelled.length > 1
        ? `${String(labelled.length)} Displays of “${host.id}” are labelled “${reference}”; use an id: ${labelled.map((display) => display.id).join(", ")}.`
        : host.displays.length === 0
          ? `Display Host “${host.id}” has no Display “${reference}”: it offers none.`
          : `Display Host “${host.id}” has no Display “${reference}”. It has: ${ids}.`,
  };
}

/** `Stage PC (left)` → `stage-pc-left`; a name with nothing to keep becomes `host`. */
export function slugOf(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "host" : slug;
}
