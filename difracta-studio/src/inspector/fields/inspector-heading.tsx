import { Badge } from "@/components/ui/badge";

/** Name, id and kind of the inspected item, above its fields. */
export function InspectorHeading({
  name,
  id,
  type,
}: {
  readonly name: string;
  readonly id: string;
  readonly type: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 border-b p-3">
      <div className="min-w-0">
        <h2 className="truncate text-xs font-semibold">{name}</h2>
        <p className="mt-0.5 truncate font-mono text-[0.625rem] text-muted-foreground">
          {id}
        </p>
      </div>
      <Badge variant="outline">{type}</Badge>
    </div>
  );
}
