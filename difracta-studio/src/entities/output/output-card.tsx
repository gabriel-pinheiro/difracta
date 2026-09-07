import type { Output } from "@difracta/core";
import { ExternalLink, Link } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { outputPageUrl } from "./output-url";

const unavailable = "—";
const workloadKinds = [
  { key: "canvas", label: "Canvas" },
  { key: "shaders", label: "Shaders" },
  { key: "filters", label: "Filters" },
] as const;

/**
 * One Output in the Outputs tab: connection, performance, resolution and
 * workload, then its Output Sessions. Values read "—" until a session reports.
 */
export function OutputCard({
  output,
  selected,
  onSelect,
}: {
  readonly output: Output;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const url = outputPageUrl(output.id);

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
          className="size-2 shrink-0 rounded-full bg-muted-foreground/30"
          title="No Output Session connected"
        />
        <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">
          {output.name}
        </h3>
        <span className="text-[0.625rem] tracking-wide text-muted-foreground uppercase">
          no sessions
        </span>
      </header>
      <div className="grid grid-cols-4 gap-1">
        <Metric label="FPS" value={unavailable} />
        <Metric label="Render" value={unavailable} />
        <Metric label="Resolution" value={unavailable} />
        <Metric label="Scale" value={unavailable} />
      </div>
      <div className="grid grid-cols-3 gap-1">
        {workloadKinds.map((kind) => (
          <Tooltip key={kind.key}>
            <TooltipTrigger
              render={<div />}
              className="rounded-sm bg-muted/40 px-2 py-1.5"
            >
              <Metric label={kind.label} value="— / — / —" bare />
            </TooltipTrigger>
            <TooltipContent>
              {kind.label}: executed per frame / enabled / relevant
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
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
