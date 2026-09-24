import {
  DifractaClient,
  type DocumentView,
  type ReadonlySignal,
} from "@difracta/client";
import { generateId, type PatchPath } from "@difracta/core";
import type { CommandResult } from "@difracta/protocol";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { toast } from "sonner";

const ClientContext = createContext<DifractaClient | undefined>(undefined);

function liveUrl(): string {
  const params = new URLSearchParams(location.search);
  const configured = params.get("runtime");
  if (configured !== null) return configured;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`;
}

/**
 * The runtime this Studio talks to, as "host:port": the `?runtime=` URL,
 * else the runtime the dev server proxies to, else the page's own host,
 * which serves Studio and the runtime together.
 */
export function runtimeHost(): string {
  const configured = new URLSearchParams(location.search).get("runtime");
  const proxied: unknown = import.meta.env.VITE_DIFRACTA_PROXIED_RUNTIME;
  const url =
    configured ?? (typeof proxied === "string" ? proxied : location.href);
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** One undo owner per browser, so Ctrl+Z ownership survives reloads. */
function studioActor(): string {
  const key = "difracta.actor";
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return stored;
    const created = generateId("studio");
    localStorage.setItem(key, created);
    return created;
  } catch {
    return generateId("studio");
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

/**
 * Sends a command against `view`'s document; a rejection surfaces as an
 * error toast and never throws, and what the command reports as warnings (a
 * removal that unassigned Surfaces, say) as one warning toast.
 */
export function useCommand(
  view: DocumentView,
): (name: string, payload: unknown) => Promise<void> {
  const client = useClient();
  const { documentId } = view;
  return useCallback(
    (name, payload) =>
      client.command<CommandResult>(documentId, name, payload).then(
        (result) => showWarnings(result.warnings ?? []),
        (failure: unknown) => {
          toast.error(
            failure instanceof Error ? failure.message : String(failure),
          );
        },
      ),
    [client, documentId],
  );
}

/** One toast for a command's warnings: the warning itself, or a count and the list. */
export function showWarnings(warnings: readonly string[]): void {
  const [first] = warnings;
  if (first === undefined) return;
  if (warnings.length === 1) toast.warning(first);
  else
    toast.warning(`${String(warnings.length)} warnings`, {
      description: warnings.join("\n"),
    });
}
