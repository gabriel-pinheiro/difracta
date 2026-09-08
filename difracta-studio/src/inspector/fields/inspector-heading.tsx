/** Name and id of the inspected item, above its fields; the id's prefix says what kind it is. */
export function InspectorHeading({
  name,
  id,
}: {
  readonly name: string;
  readonly id: string;
}) {
  return (
    <div className="border-b p-3">
      <h2 className="truncate text-xs font-semibold">{name}</h2>
      <p className="mt-0.5 truncate font-mono text-[0.625rem] text-muted-foreground">
        {id}
      </p>
    </div>
  );
}
