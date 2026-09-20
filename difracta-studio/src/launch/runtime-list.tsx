import { LoaderCircle, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { RuntimeRow } from "./runtime-rows";

/** The runtimes found on the network, live, and the remembered ones that are not there now. */
export function RuntimeList({
  rows,
  busy,
  connecting,
  onConnect,
  onForget,
}: {
  readonly rows: readonly RuntimeRow[];
  readonly busy: boolean;
  /** The address being connected to, whose row shows it. */
  readonly connecting: string | undefined;
  readonly onConnect: (address: string) => void;
  readonly onForget: (address: string) => void;
}) {
  if (rows.length === 0)
    return (
      <p className="flex items-center gap-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        Looking for Runtimes on this network…
      </p>
    );
  return (
    <ul className="divide-y rounded-md border" aria-label="Runtimes">
      {rows.map((row) => (
        <li key={row.address} className="flex items-center gap-3 px-3 py-2">
          <div className="grid min-w-0 flex-1 gap-0.5">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{row.title}</span>
              {row.found === undefined && (
                <Badge variant="outline">Not on the network now</Badge>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {row.found === undefined
                ? row.address
                : [
                    row.found.document ?? "No Installation open",
                    row.address,
                    row.found.host,
                    `version ${row.found.version ?? "unknown"}`,
                  ].join(" · ")}
            </span>
          </div>
          {row.found === undefined && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Forget ${row.title}`}
              title="Forget"
              disabled={busy}
              onClick={() => onForget(row.address)}
            >
              <X />
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onConnect(row.address)}
          >
            {connecting === row.address && (
              <LoaderCircle className="animate-spin" />
            )}
            Connect
          </Button>
        </li>
      ))}
    </ul>
  );
}
