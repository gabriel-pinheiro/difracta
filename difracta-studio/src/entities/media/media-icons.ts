import type { MediaType } from "@difracta/core";
import {
  FileImage,
  FileVideoCamera,
  Folder,
  type LucideIcon,
} from "lucide-react";

export const mediaTypeIcons: Record<MediaType, LucideIcon> = {
  image: FileImage,
  video: FileVideoCamera,
};

export const mediaTypeLabels: Record<MediaType, string> = {
  image: "Image",
  video: "Video",
};

export const mediaGroupIcon: LucideIcon = Folder;
