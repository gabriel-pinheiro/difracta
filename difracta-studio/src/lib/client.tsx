import {
  DifractaClient,
  type DocumentView,
  type ReadonlySignal,
} from "@difracta/client";
import type { PatchPath } from "@difracta/core";
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const ClientContext = createContext<DifractaClient | undefined>(undefined);

function liveUrl(): string {
  const params = new URLSearchParams(location.search);
  const configured = params.get("runtime");
  if (configured !== null) return configured;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`;
}

/** One undo owner per browser, so Ctrl+Z ownership survives reloads. */
function studioActor(): string {
  const key = "difracta.actor";
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
    const created = `studio:${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `studio:${crypto.randomUUID().slice(0, 8)}`;
  }
}

export function ClientProvider({ children }: { readonly children: ReactNode }) {
  const client = useMemo(
    () =>
      new DifractaClient({
        url: liveUrl(),
        kind: "studio",
        actor: studioActor(),
      }),
    [],
  );
  return (
    <ClientContext.Provider value={client}>{children}</ClientContext.Provider>
  );
}

export function useClient(): DifractaClient {
  const client = useContext(ClientContext);
  if (client === undefined)
    throw new Error("useClient needs a ClientProvider.");
  return client;
}

/** Re-renders only when the signal's value changes. */
export function useSignal<TValue>(signal: ReadonlySignal<TValue>): TValue {
  return useSyncExternalStore(
    (listener) => signal.subscribe(() => listener()),
    () => signal.get(),
  );
}

/** Re-renders only when a delta touches `path`. */
export function useDocumentPath<TValue>(
  view: DocumentView,
  path: PatchPath,
): TValue | undefined {
  const key = path.join("/");
  // `key` stands in for `path` so a fresh array literal does not resubscribe.

  const signal = useMemo(
    () => view.at<TValue>(key === "" ? [] : key.split("/")),
    [view, key],
  );
  return useSignal(signal);
}
