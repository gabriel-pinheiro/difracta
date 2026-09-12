import type { MacroActionKind, MacroKind } from "@difracta/core";
import {
  Equal,
  Folder,
  ListStart,
  ToggleLeft,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const macroIcons: Record<MacroKind, LucideIcon> = {
  macro: ListStart,
  group: Folder,
};

export const macroKindLabels: Record<MacroKind, string> = {
  macro: "Macro",
  group: "Group",
};

export const actionIcons: Record<MacroActionKind, LucideIcon> = {
  set: Equal,
  toggle: ToggleLeft,
  trigger: Zap,
};
