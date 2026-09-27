import type { ControllerKind } from "@difracta/core";
import {
  Folder,
  Palette,
  SlidersHorizontal,
  Type,
  type LucideIcon,
} from "lucide-react";

export const controllerIcons: Record<ControllerKind, LucideIcon> = {
  number: SlidersHorizontal,
  color: Palette,
  text: Type,
  group: Folder,
};

export const controllerKindLabels: Record<ControllerKind, string> = {
  number: "Number Controller",
  color: "Color Controller",
  text: "Text Controller",
  group: "Group",
};
