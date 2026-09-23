import type { DocumentView } from "@difracta/client";
import type { Output, Table } from "@difracta/core";
import type { DisplayHostLive } from "@difracta/protocol";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useClient, useDocumentPath } from "@/lib/client";

import { displayHostRows, type DisplayRow } from "./display-rows";

/**
 * The Displays an Output can be shown on: those of every Display Host
 * connected to the runtime, grouped by host, whichever machine Studio itself
 * is on. Show and Hide are the runtime's `displays.show` and `displays.hide`;
 * what each Display shows comes back through the live state, from the host.
 */
export function DisplayHostsList({
  view,
  outputId,
}: {
  readonly view: DocumentView;
  readonly outputId: string;
}) {
  const hosts = displayHostRows(
    useDocumentPath<Record<string, DisplayHostLive>>(view, [
      "live",
      "displayHosts",
    ]),
    useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {},
  );
  if (hosts.length === 0)
    return (
      <p className="text-[0.6875rem]/relaxed text-muted-foreground">
        No computer running Difracta Desktop is connected, so there is no
        Display to show this on.
      </p>
    );
  return (
    <div className="grid gap-3">
      {hosts.map((host) => (
        <section key={host.id} className="grid gap-1">
          <h4 className="truncate text-[0.6875rem] font-medium text-muted-foreground">
            {host.name}
          </h4>
          {host.displays.length === 0 ? (
            <p className="text-[0.6875rem]/relaxed text-muted-foreground">
              This computer has no Display.
            </p>
          ) : (
            <ul className="grid gap-px">
              {host.displays.map((display) => (
                <DisplayItem
                  key={display.id}
                  hostId={host.id}
                  display={display}
                  outputId={outputId}
                />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function DisplayItem({
  hostId,
  display,
  outputId,
}: {
  readonly hostId: string;
  readonly display: DisplayRow;
  readonly outputId: string;
}) {
  const client = useClient();
  const [busy, setBusy] = useState(false);
  const showsThis = display.shows?.id === outputId;

  function ask(name: "displays.show" | "displays.hide"): void {
    setBusy(true);
    const target = { host: hostId, display: display.id };
    void (
      name === "displays.show"
        ? client.request(name, { ...target, output: outputId })
        : client.request(name, target)
    )
      .catch((failure: unknown) => {
        toast.error(
          failure instanceof Error ? failure.message : String(failure),
        );
      })
      .finally(() => setBusy(false));
  }

  return (
    <li className="flex items-center gap-2 rounded-sm bg-muted/40 px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs">{display.label}</div>
        <div className="truncate text-[0.6875rem] text-muted-foreground">
          {[
            display.resolution,
            ...display.marks,
            display.shows === undefined
              ? "shows nothing"
              : showsThis
                ? "shows this Output"
                : `shows ${display.shows.name}`,
          ].join(", ")}
        </div>
      </div>
      {display.shows !== undefined && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => ask("displays.hide")}
        >
          Hide
        </Button>
      )}
      {!showsThis && (
        <Button size="sm" disabled={busy} onClick={() => ask("displays.show")}>
          Show
        </Button>
      )}
    </li>
  );
}
