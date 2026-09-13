import { DifractaClient } from "@difracta/client";
import {
  Catalog,
  settings,
  type FilterDefinition,
  type VisualDefinition,
} from "@difracta/core";
import type { DocumentSummary } from "@difracta/protocol";
import { hostname, userInfo } from "node:os";

export const DEFAULT_URL = `ws://127.0.0.1:${String(settings.runtime.port)}${settings.runtime.livePath}`;

/** One undo owner per shell user, so `difracta undo` spans invocations. */
function cliActor(): string {
  return (
    process.env.DIFRACTA_ACTOR ?? `cli:${userInfo().username}@${hostname()}`
  );
}

function unreachable(url: string): Error {
  return new Error(
    `Could not connect to ${url}. The runtime speaks WebSocket at ${settings.runtime.livePath} on its HTTP port (${String(settings.runtime.port)} unless changed); is it running there?`,
  );
}

/** Connects to a normalized live URL (see `url.ts`) or fails naming what it tried. */
export async function connect(url: string): Promise<DifractaClient> {
  const client = new DifractaClient({
    url,
    kind: "cli",
    actor: cliActor(),
    reconnect: false,
    scheduleFlush: (flush) => setTimeout(flush, 0),
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(unreachable(url)),
      settings.cli.connectTimeoutMs,
    );
    client.phase.subscribe((phase) => {
      if (phase === "connected") {
        clearTimeout(timer);
        resolve();
      } else if (phase === "closed") {
        clearTimeout(timer);
        reject(unreachable(url));
      }
    });
  });
  // The document summary arrives right after welcome.
  await new Promise((resolve) => setTimeout(resolve, 20));
  return client;
}

/** The runtime's open Installation, or a helpful error. */
export function currentDocument(client: DifractaClient): DocumentSummary {
  const summary = client.document.get();
  if (summary === null)
    throw new Error(
      "No Installation is open. Use `difracta documents open <file>` or `difracta documents new <name>`.",
    );
  return summary;
}

/** The runtime's Catalog, as metadata: what its Visual and Filter ids mean. */
export async function fetchCatalog(client: DifractaClient): Promise<Catalog> {
  const { visuals, filters } = await client.request<{
    visuals: VisualDefinition[];
    filters: FilterDefinition[];
  }>("catalog.list", {});
  return new Catalog({ visuals, filters });
}

export function parseJsonArgument(text: string | undefined): unknown {
  if (text === undefined || text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Not valid JSON: ${text}`);
  }
}

export function parseValue(text: string): unknown {
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  const number = Number(text);
  if (text.trim() !== "" && Number.isFinite(number)) return number;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
