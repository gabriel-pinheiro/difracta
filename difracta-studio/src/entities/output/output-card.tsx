import type { DocumentView } from "@difracta/client";
import type { Output } from "@difracta/core";
import type { WorkloadCount } from "@difracta/protocol";
import { ExternalLink, Link } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDocumentPath } from "@/lib/client";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

import {
  formatFps,
  formatMs,
  formatResolution,
  formatScale,
  liveSessions,
  presenceTone,
  primarySession,
  sessionList,
  sessionStatus,
  toneClass,
  toneTitle,
  type SessionTable,
} from "./output-live";
import { outputPageUrl } from "./output-url";

const workloadKinds = [
  { key: "canvasVisuals", label: "Canvas" },
  { key: "shaderVisuals", label: "Shaders" },
  { key: "filters", label: "Filters" },
] as const;

/**
 * One Output in the Outputs tab: connection, performance, resolution and
 * workload from its freshest Output Session, then every session. Values read
 * "—" until a session reports.
 */
export function OutputCard({
  view,
  output,
  selected,
  onSelect,
}: {
  readonly view: DocumentView;
  readonly output: Output;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const url = outputPageUrl(output.id);
  const sessions = sessionList(
    useDocumentPath<SessionTable>(view, [
      "live",
      "outputs",
      output.id,
      "sessions",
    ]),
  );
  const primary = primarySession(sessions);
  const live = liveSessions(sessions).length;
  const now = useNow(sessions.some((session) => session.stale));

  function copyUrl(): void {
    void navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Output page URL copied"))
      .catch(() => toast.error("Could not copy the URL."));
  }

  return (
    <article
      className={cn(
        "grid cursor-default gap-3 rounded-lg border bg-card p-3 text-card-foreground",
        selected && "ring-1 ring-selection ring-inset",
      )}
      onClick={onSelect}
    >
      <header className="flex items-center gap-2">
        <span
          className={`size-2 shrink-0 rounded-full ${toneClass[presenceTone(sessions)]}`}
          title={toneTitle(sessions)}
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">
          {output.name}
        </h3>
        <span className="text-[0.625rem] tracking-wide text-muted-foreground uppercase">
          {sessions.length === 0
            ? "no sessions"
            : `${String(live)} of ${String(sessions.length)} ${sessions.length === 1 ? "session" : "sessions"}`}
        </span>
      </header>
      <div className="grid grid-cols-4 gap-1">
        <Metric
          label="FPS"
          value={formatFps(primary?.telemetry?.frameIntervalMs)}
        />
        <Metric
          label="Render"
          value={formatMs(primary?.telemetry?.renderWorkMs)}
        />
        <Metric label="Resolution" value={formatResolution(primary)} />
        <Metric label="Scale" value={formatScale(primary)} />
      </div>
      <div className="grid grid-cols-3 gap-1">
        {workloadKinds.map((kind) => (
          <Tooltip key={kind.key}>
            <TooltipTrigger
              render={<div />}
              className="rounded-sm bg-muted/40 px-2 py-1.5"
            >
              <Metric
                label={kind.label}
                value={formatCount(primary?.telemetry?.workload[kind.key])}
                bare
              />
            </TooltipTrigger>
            <TooltipContent>
              {kind.label}: executed per frame / enabled / relevant
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {sessions.length > 0 && (
        <ul className="grid gap-px text-[0.6875rem]">
          {sessions.map((session) => (
            <li
              key={session.sessionId}
              className="flex items-center gap-2 rounded-sm px-1 py-0.5"
              title={session.sessionId}
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${toneClass[session.stale ? "stale" : "live"]}`}
              />
              <span className="min-w-0 flex-1 truncate">
                {formatResolution(session)} {formatScale(session)}
              </span>
              <span className="font-mono text-muted-foreground">
                {sessionStatus(session, now)}
              </span>
              {!session.stale && (
                <span className="font-mono text-muted-foreground">
                  {formatMs(session.telemetry?.renderWorkMs)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <footer className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          render={<a href={url} target="_blank" rel="noreferrer" />}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink /> Open page
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(event) => {
            event.stopPropagation();
            copyUrl();
          }}
        >
          <Link /> Copy URL
        </Button>
      </footer>
    </article>
  );
}

function formatCount(count: WorkloadCount | undefined): string {
  if (count === undefined) return "— / — / —";
  return `${count.executedPerFrame.toFixed(1)} / ${String(count.enabled)} / ${String(count.relevant)}`;
}

function Metric({
  label,
  value,
  bare = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly bare?: boolean;
}) {
  return (
    <div
      className={cn("min-w-0", !bare && "rounded-sm bg-muted/40 px-2 py-1.5")}
    >
      <div className="truncate text-[0.625rem] tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-0.5 truncate font-mono text-xs">{value}</div>
    </div>
  );
}
