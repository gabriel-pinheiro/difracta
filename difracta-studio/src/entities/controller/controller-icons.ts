import type { ControllerKind } from "@difracta/core";
import {
  Folder,
  Palette,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export const controllerIcons: Record<ControllerKind, LucideIcon> = {
  number: SlidersHorizontal,
  color: Palette,
  group: Folder,
};

export const controllerKindLabels: Record<ControllerKind, string> = {
  number: "Number Controller",
  color: "Color Controller",
  group: "Group",
};
