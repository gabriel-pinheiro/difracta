import {
  type AddressValue,
  type MacroAction,
  type ResolvedAddress,
} from "@difracta/core";
import { GripVertical, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Control } from "@/inspector/fields/address-row";
import { cn } from "@/lib/utils";
import { useLatestWins } from "@/lib/use-latest-wins";

import { ChanceReadout } from "./chance-readout";
import { actionIcons } from "./macro-icons";

const BOOLEAN_KINDS = [
  { value: "set", label: "Set" },
  { value: "toggle", label: "Toggle" },
] as const;

/**
 * One action of a Macro: what it does to which Address, its Chance, the
 * value it sets with the same control the Address has in its own
 * inspector, and why it would be skipped, if it would. A switch Address
 * chooses between Set and Toggle. In Sequence the action the next run
 * fires is marked. The grip at the left is where a drag starts.
 */
export function ActionRow({
  action,
  resolved,
  problem,
  next,
  onValue,
  onKind,
  onChance,
  onRemove,
}: {
  readonly action: MacroAction;
  /** Undefined when the target no longer exists. */
  readonly resolved: ResolvedAddress | undefined;
  readonly problem: string | undefined;
  /** True for the action a Sequence fires next. */
  readonly next: boolean;
  readonly onValue: (value: AddressValue) => Promise<unknown>;
  readonly onKind: (kind: "set" | "toggle") => void;
  readonly onChance: (chance: number | null) => void;
  readonly onRemove: () => void;
}) {
  const send = useLatestWins(onValue);
  const Icon = actionIcons[action.kind];
  const target =
    resolved === undefined
      ? action.address
      : `${resolved.owner === undefined ? "" : `${resolved.owner} · `}${resolved.label}`;
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1.5 rounded-sm py-1 pr-0.5",
        next && "bg-accent/40",
      )}
      data-testid="macro-action"
      data-next={next ? "true" : undefined}
    >
      <span
        data-drag-handle
        className="mt-0.5 grid size-5 cursor-grab place-items-center text-muted-foreground/50 hover:text-foreground"
        aria-hidden
      >
        <GripVertical className="size-3" />
      </span>
      <div className="grid min-w-0 gap-1">
        <div
          className="flex min-w-0 items-center gap-1.5 text-xs"
          title={`${action.kind} ${action.address}`}
        >
          <Icon className="size-3 shrink-0 text-muted-foreground" />
          <span className="line-clamp-2 min-w-0 flex-1 wrap-anywhere">
            {target}
          </span>
          {next && (
            <span
              className="shrink-0 rounded-sm bg-primary/20 px-1 text-[0.625rem] font-medium text-primary"
              title="The next run fires this action"
            >
              Next
            </span>
          )}
          <ChanceReadout chance={action.chance} onChance={onChance} />
        </div>
        {action.kind !== "trigger" && resolved !== undefined && (
          <div className="flex min-w-0 items-center gap-1.5">
            {resolved.type === "boolean" && (
              <Select
                value={action.kind}
                items={BOOLEAN_KINDS}
                onValueChange={(kind: "set" | "toggle" | null) => {
                  if (kind !== null && kind !== action.kind) onKind(kind);
                }}
              >
                <SelectTrigger aria-label="Action kind" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOOLEAN_KINDS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {action.kind === "set" && (
              <Control resolved={resolved} value={action.value} send={send} />
            )}
          </div>
        )}
        {problem !== undefined && (
          <p className="text-[0.6875rem] text-destructive">{problem}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove action ${target}`}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}
