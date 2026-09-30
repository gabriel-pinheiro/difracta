import type { DifractaClient } from "@difracta/client";
import { useState } from "react";

import type { DifractaShare, ShareContext } from "./share-bridge";
import type { ShareInstallation } from "./share-installation";
import { ShareList } from "./share-list";
import type { Sharer } from "./sharer";
import { StartFlow } from "./start-flow";
import { useSignal } from "./use-signal";

export interface SharePageProps {
  readonly bridge: DifractaShare;
  readonly context: ShareContext;
  readonly client: DifractaClient;
  readonly sharer: Sharer;
  readonly installation: ShareInstallation;
}

/**
 * The share window: what this computer shares, and the way to share
 * something more. With nothing shared it is the start flow; with a share
 * running it is the list, from which "Share another…" leads to the flow.
 */
export function SharePage(props: SharePageProps) {
  const { context, client, sharer, installation } = props;
  const shares = useSignal(sharer.shares);
  const ended = useSignal(sharer.ended);
  const slots = useSignal(installation.slots);
  const open = useSignal(installation.installation);
  const phase = useSignal(client.phase);
  const [adding, setAdding] = useState(false);
  const starting = adding || shares.length === 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-6">
      <header className="grid gap-1">
        <h1 className="text-lg font-medium">Share Screen</h1>
        <p className="text-xs text-muted-foreground" data-testid="share-where">
          {open === null
            ? `No Installation is open (${context.where}).`
            : `Into “${open.name}” (${context.where}), as ${context.sharer}.`}
        </p>
        {phase !== "connected" && (
          <p role="status" className="text-xs text-muted-foreground">
            Connecting to the Runtime…
          </p>
        )}
      </header>

      {ended.map((entry) => (
        <p
          key={entry.mediaId}
          role="alert"
          className="flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-xs"
        >
          <span>
            {slots.find((slot) => slot.id === entry.mediaId)?.name ??
              "A Screen Share"}
            : {entry.message}
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => sharer.dismiss(entry.mediaId)}
          >
            Dismiss
          </button>
        </p>
      ))}

      {shares.length > 0 && (
        <ShareList
          shares={shares}
          slots={slots}
          adding={adding}
          onStop={(mediaId) => sharer.stop(mediaId)}
          onAdd={() => setAdding(true)}
        />
      )}
      {starting && open !== null && (
        <StartFlow
          {...props}
          slots={slots}
          onDone={() => setAdding(false)}
          onCancel={shares.length > 0 ? () => setAdding(false) : undefined}
        />
      )}
    </main>
  );
}
