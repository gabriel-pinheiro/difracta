import type { LayerKind } from "@difracta/core";
import { Blend, Folder, Image, type LucideIcon } from "lucide-react";

export const layerIcons: Record<LayerKind, LucideIcon> = {
  visual: Image,
  filter: Blend,
  group: Folder,
};

export const layerKindLabels: Record<LayerKind, string> = {
  visual: "Visual Layer",
  filter: "Filter Layer",
  group: "Group",
};
