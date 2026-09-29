import type { MediaType } from "@difracta/core";
import {
  FileImage,
  FileVideoCamera,
  Folder,
  Package,
  ScreenShare,
  type LucideIcon,
} from "lucide-react";

export const mediaTypeIcons: Record<MediaType, LucideIcon> = {
  image: FileImage,
  video: FileVideoCamera,
  live: ScreenShare,
};

export const mediaTypeLabels: Record<MediaType, string> = {
  image: "Image",
  video: "Video",
  live: "Live",
};

export const mediaGroupIcon: LucideIcon = Folder;

/** "Bundled…" in the "+" menus: a clip Difracta ships. */
export const bundledMediaIcon: LucideIcon = Package;
