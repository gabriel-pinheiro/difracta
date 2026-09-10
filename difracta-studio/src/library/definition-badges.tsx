import { hasCues, usesPath, type Definition } from "@difracta/core";
import { Spline, Star, Zap, type LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** The traits a person picks by, as small glyphs with an explanation on hover. */
export function DefinitionBadges({
  definition,
  className,
}: {
  readonly definition: Definition;
  readonly className?: string;
}) {
  const badges: { readonly icon: LucideIcon; readonly text: string }[] = [];
  if (definition.recommended === true)
    badges.push({
      icon: Star,
      text: "Recommended: a good default for most Installations.",
    });
  if (usesPath(definition))
    badges.push({
      icon: Spline,
      text: "Uses a Path: needs a Path on the Target to follow.",
    });
  if (hasCues(definition))
    badges.push({
      icon: Zap,
      text: `Has Cues: ${(definition.cues ?? []).map((cue) => cue.label).join(", ")}.`,
    });
  if (badges.length === 0) return null;
  return (
    <span className={cn("flex items-center gap-1", className)}>
      {badges.map((badge) => (
        <Tooltip key={badge.text}>
          <TooltipTrigger
            render={
              <span className="grid size-4 place-items-center rounded-sm bg-background/70 text-muted-foreground" />
            }
          >
            <badge.icon aria-hidden className="size-2.5" />
            <span className="sr-only">{badge.text}</span>
          </TooltipTrigger>
          <TooltipContent>{badge.text}</TooltipContent>
        </Tooltip>
      ))}
    </span>
  );
}
