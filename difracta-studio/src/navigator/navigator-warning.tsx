import { TriangleAlert } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * A short amber note at a navigator row's end for something that keeps the
 * row's entity from showing anywhere, explained on hover. It goes in
 * `NavigatorRow`'s children, inside the selecting button, so the trigger is
 * a span; it truncates rather than widening the row.
 */
export function NavigatorWarning({
  label,
  explanation,
}: {
  readonly label: string;
  readonly explanation: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="flex max-w-24 min-w-0 shrink-0 items-center gap-1 text-[0.625rem] text-amber-300" />
        }
      >
        <TriangleAlert aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{label}</span>
        <span className="sr-only">: {explanation}</span>
      </TooltipTrigger>
      <TooltipContent>{explanation}</TooltipContent>
    </Tooltip>
  );
}
