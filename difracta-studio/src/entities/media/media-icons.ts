import type { MediaKind } from "@difracta/core";
import { FileImage, FileVideoCamera, type LucideIcon } from "lucide-react";

export const mediaIcons: Record<MediaKind, LucideIcon> = {
  image: FileImage,
  video: FileVideoCamera,
};

export const mediaKindLabels: Record<MediaKind, string> = {
  image: "Image",
  video: "Video",
};
