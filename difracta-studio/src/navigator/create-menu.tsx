import type { ReactNode } from "react";

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { CreateItem } from "./navigator-row";

/**
 * A disabled menu entry with why on hover: the entry ignores the pointer,
 * so the wrapper around it carries the tooltip.
 */
export function DisabledHint({
  hint,
  children,
}: {
  readonly hint: string;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<div />}>{children}</TooltipTrigger>
      <TooltipContent side="left" className="max-w-64">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

/** The entries of a "+" dropdown; one that cannot be used now says why, and one with `items` opens them as a submenu. */
export function CreateMenuItems({
  items,
}: {
  readonly items: readonly CreateItem[];
}) {
  return items.map((item) =>
    item.items !== undefined ? (
      <DropdownMenuSub key={item.label}>
        <DropdownMenuSubTrigger>
          <item.icon /> {item.label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <CreateMenuItems items={item.items} />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : item.disabled === undefined ? (
      <DropdownMenuItem key={item.label} onClick={item.onSelect}>
        <item.icon /> {item.label}
      </DropdownMenuItem>
    ) : (
      <DisabledHint key={item.label} hint={item.disabled}>
        <DropdownMenuItem disabled>
          <item.icon /> {item.label}
        </DropdownMenuItem>
      </DisabledHint>
    ),
  );
}
