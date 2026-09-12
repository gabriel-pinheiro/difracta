import {
  type AddressValue,
  type Controller,
  type Link,
  type ResolvedAddress,
} from "@difracta/core";
import { Link2, Link2Off, SquareArrowOutUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

import { colorToHex, displayUnit, formatNumber } from "./address-format";

/** How a row takes part in Parameter Links: its Link, if any, and the Controllers it could take. */
export interface RowLinks {
  readonly link: Link | undefined;
  /** The Link's Controller, when the Link exists. */
  readonly controller: Controller | undefined;
  /** What the Address shows while linked. */
  readonly effective: AddressValue;
  /** Controllers able to drive this row, in navigator order. */
  readonly candidates: readonly Controller[];
  readonly onLink: (controllerId: string) => void;
  readonly onUnlink: () => void;
  readonly onOpen: (controllerId: string) => void;
}

/** The row's Link menu: "Link to" a Controller, or the Controller it has and Unlink. */
export function LinkMenu({
  resolved,
  links,
}: {
  readonly resolved: ResolvedAddress;
  readonly links: RowLinks;
}) {
  const { link, controller, candidates } = links;
  if (link !== undefined && controller !== undefined)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${resolved.label} link`}
          title={`Controlled by ${controller.name}`}
          className="grid size-5 place-items-center rounded-sm text-selection hover:bg-input/50"
        >
          <Link2 className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              Controlled by {controller.name}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => links.onOpen(controller.id)}>
              <SquareArrowOutUpRight /> Go to {controller.name}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={links.onUnlink}>
            <Link2Off /> Unlink
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  if (resolved.type === "choice" || resolved.type === "trigger")
    return <span className="size-5" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${resolved.label} link`}
        title="Link to a Controller"
        className="grid size-5 place-items-center rounded-sm text-muted-foreground/50 hover:bg-input/50 hover:text-foreground"
      >
        <Link2 className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={candidates.length === 0}>
            <Link2 /> Link to
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {candidates.map((candidate) => (
              <DropdownMenuItem
                key={candidate.id}
                onClick={() => links.onLink(candidate.id)}
              >
                {candidate.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {candidates.length === 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal text-muted-foreground">
              No {resolved.type === "color" ? "Color" : "Number"} Controller yet
            </DropdownMenuLabel>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The effective value, read-only, and a chip with the Controller's name and value that opens it. */
export function LinkedControl({
  resolved,
  links,
}: {
  readonly resolved: ResolvedAddress;
  readonly links: RowLinks;
}) {
  const { controller, effective } = links;
  if (controller === undefined || controller.kind === "group") return null;
  const range = resolved.range ?? { min: 0, max: 1 };
  return (
    <>
      {resolved.type === "number" && (
        <>
          <Slider
            aria-label={resolved.label}
            className="min-w-0 flex-1"
            disabled
            min={range.min}
            max={range.max}
            step={range.step ?? (range.max - range.min) / 100}
            value={typeof effective === "number" ? effective : 0}
          />
          <span className="w-14 shrink-0 truncate px-1 text-right text-[0.6875rem] text-muted-foreground tabular-nums">
            {formatNumber(typeof effective === "number" ? effective : 0, range)}
            {displayUnit(range)}
          </span>
        </>
      )}
      {resolved.type === "boolean" && (
        <Switch
          aria-label={resolved.label}
          checked={effective === true}
          disabled
        />
      )}
      {resolved.type === "color" && (
        <>
          <span
            aria-label={`${resolved.label} color`}
            className="size-5 shrink-0 rounded-sm border border-input"
            style={{ background: cssColor(effective) }}
          />
          <span className="w-[4.25rem] shrink-0 px-1 text-[0.6875rem] text-muted-foreground tabular-nums">
            {typeof effective === "object"
              ? colorToHex(effective).toUpperCase()
              : ""}
          </span>
        </>
      )}
      <Button
        variant="outline"
        size="xs"
        className="max-w-32 min-w-0 border-selection/60 text-foreground"
        title={`Controlled by ${controller.name}. Change it on the Controller.`}
        onClick={() => links.onOpen(controller.id)}
      >
        <Link2 className="text-selection" />
        <span className="truncate">{controller.name}</span>
        {controller.kind === "number" ? (
          <span className="text-muted-foreground tabular-nums">
            {Math.round(controller.value * 100)}%
          </span>
        ) : (
          <span
            className="size-2.5 shrink-0 rounded-[2px] border border-input"
            style={{ background: cssColor(controller.value) }}
          />
        )}
      </Button>
    </>
  );
}

function cssColor(value: AddressValue): string {
  if (typeof value !== "object") return "transparent";
  const [r, g, b, a] = value;
  return `rgba(${String(Math.round(r * 255))}, ${String(Math.round(g * 255))}, ${String(Math.round(b * 255))}, ${String(a)})`;
}
