import type { MediaType } from "@difracta/core";
import {
  FileImage,
  FileVideoCamera,
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

/** A Pack, in the navigator and the "+" menu. */
export const packIcon: LucideIcon = Package;
