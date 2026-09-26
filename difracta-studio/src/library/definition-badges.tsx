import {
  hasCues,
  usesPath,
  type Definition,
  type MediaDefinition,
} from "@difracta/core";
import { Drum, Repeat, Spline, Star, Zap, type LucideIcon } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Badge {
  readonly icon: LucideIcon;
  readonly text: string;
}

/** A Visual's or Filter's traits: Recommended, uses a Path, has Cues. */
function definitionTraits(definition: Definition): Badge[] {
  const badges: Badge[] = [];
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
  return badges;
}

/** A Bundled Media entry's traits: Recommended, loops, works as a hit. */
function mediaTraits(entry: MediaDefinition): Badge[] {
  const badges: Badge[] = [];
  if (entry.recommended === true)
    badges.push({
      icon: Star,
      text: "Recommended: a good default for most Installations.",
    });
  if (entry.loop === true)
    badges.push({
      icon: Repeat,
      text: "Loop: plays over and over without a visible seam.",
    });
  if (entry.hit === true)
    badges.push({
      icon: Drum,
      text: "Hit: a one-shot to fire on a beat.",
    });
  return badges;
}

/** The traits a person picks by, as small glyphs with an explanation on hover. */
export function DefinitionBadges({
  definition,
  className,
}: {
  readonly definition: Definition | MediaDefinition;
  readonly className?: string;
}) {
  const badges =
    definition.kind === "media"
      ? mediaTraits(definition)
      : definitionTraits(definition);
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
