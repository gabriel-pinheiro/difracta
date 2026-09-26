import type { ResolvedAddress } from "@difracta/core";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateMedia } from "@/entities/media/use-create-media";

/**
 * The control for a media Address: a select over the Media files of the
 * type it accepts, None first, and a "+" that adds an item through the
 * same picker the Media section uses and picks it here in one flow, as the
 * Target row's "+" makes a Surface. A value whose item is gone shows as
 * None. The options come with the Address, resolved against the Media
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
  const { create, dialog } = useCreateMedia();
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
      <Button
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        title={`Add ${noun === "Image" ? "an image" : "a video"} to Media and pick it here`}
        aria-label={`New ${resolved.label}`}
        onClick={() =>
          create({ accepts: resolved.accepts, onCreated: (id) => send(id) })
        }
      >
        <Plus />
      </Button>
      {dialog}
    </div>
  );
}
