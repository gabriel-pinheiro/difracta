import type { ResolvedAddress } from "@difracta/core";
import { FilePlus, Plus } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bundledMediaIcon } from "@/entities/media/media-icons";
import {
  hasBundledMedia,
  NO_BUNDLED_MEDIA,
  useCreateMedia,
} from "@/entities/media/use-create-media";
import { useBrowser } from "@/library/browser-state";
import { CreateMenuItems } from "@/navigator/create-menu";
import { useSelection } from "@/selection/selection";

/**
 * The control for a media Address: a select over the Media items of the
 * type it accepts, None first, and a "+" menu that adds an item and picks
 * it here in one flow, as the Target row's "+" makes a Surface: File…
 * through the same picker the Media section uses, or Bundled…, which adds
 * a bundled item, sets it here so the Outputs show it, and opens the
 * Library on it; Escape there puts back what this held and removes the
 * item. A value whose item is gone shows as None. The options come with the Address, resolved against the Media
 * table, so a Layer row and a Macro action row draw the same thing.
 */
export function MediaControl({
  resolved,
  value,
  send,
}: {
  readonly resolved: ResolvedAddress;
  readonly value: unknown;
  readonly send: (value: string) => void;
}) {
  const { create, createBundled, dialog } = useCreateMedia();
  const { openMedia } = useBrowser();
  const { selection } = useSelection();
  const trigger = useId();
  const items = (resolved.options ?? []).filter(
    (option) => option.value !== "",
  );
  const current =
    typeof value === "string" && items.some((item) => item.value === value)
      ? value
      : null;
  const noun = resolved.accepts === "video" ? "Video" : "Image";
  return (
    <div className="flex w-full min-w-0 items-center gap-1">
      <Select
        value={current}
        items={[{ value: null, label: "None" }, ...items]}
        onValueChange={(next: string | null) => send(next ?? "")}
      >
        <SelectTrigger aria-label={resolved.label} className="min-w-0 flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={null}>
            {items.length === 0 ? `No ${noun} in Media` : "None"}
          </SelectItem>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              className="size-7 shrink-0"
              data-media-create={trigger}
            />
          }
          title={`Add ${noun === "Image" ? "an image" : "a video"} to Media and pick it here`}
          aria-label={`New ${resolved.label}`}
        >
          <Plus />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <CreateMenuItems
            items={[
              {
                label: "File…",
                icon: FilePlus,
                onSelect: () =>
                  create({
                    accepts: resolved.accepts,
                    onCreated: (id) => send(id),
                  }),
              },
              {
                label: "Bundled…",
                icon: bundledMediaIcon,
                disabled: hasBundledMedia(resolved.accepts)
                  ? undefined
                  : NO_BUNDLED_MEDIA,
                onSelect: () =>
                  createBundled({
                    accepts: resolved.accepts,
                    onCreated: (id) => {
                      send(id);
                      openMedia(id, {
                        created: true,
                        parameter: {
                          accepts: resolved.accepts,
                          anchor: selection,
                          restore: () => send(current ?? ""),
                          returnFocus: `[data-media-create="${CSS.escape(trigger)}"]`,
                        },
                      });
                    },
                  }),
              },
            ]}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog}
    </div>
  );
}
