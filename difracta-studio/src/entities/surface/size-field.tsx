import type { Surface, SurfaceSize } from "@difracta/core";
import { useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { FieldRow } from "@/inspector/fields/field-row";

/**
 * A Surface's real width and height, in any unit. Empty is Automatic: the
 * shape then follows the mapping, which is right whenever the projector
 * faces the Surface and wrong at a steep angle, where a square projects as
 * a tall trapezoid.
 */
export function SizeField({
  surface,
  onCommit,
}: {
  readonly surface: Surface;
  readonly onCommit: (size: SurfaceSize | null) => void;
}) {
  const size = surface.size;
  return (
    <FieldRow
      label="Size"
      description="Real width and height, any unit; empty is automatic"
      onReset={size === null ? undefined : () => onCommit(null)}
    >
      <Dimension
        label="Width"
        value={size?.width}
        onCommit={(width) =>
          onCommit(
            width === undefined
              ? null
              : { width, height: size?.height ?? width },
          )
        }
      />
      <span className="text-[0.6875rem] text-muted-foreground">×</span>
      <Dimension
        label="Height"
        value={size?.height}
        onCommit={(height) =>
          onCommit(
            height === undefined
              ? null
              : { width: size?.width ?? height, height },
          )
        }
      />
    </FieldRow>
  );
}

function Dimension({
  label,
  value,
  onCommit,
}: {
  readonly label: string;
  readonly value: number | undefined;
  readonly onCommit: (value: number | undefined) => void;
}) {
  const shown = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const finish = (): void => {
    if (draft === undefined) return;
    const text = draft.trim();
    const parsed = Number(text);
    if (text === "") onCommit(undefined);
    else if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed);
    setDraft(undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") finish();
    else if (event.key === "Escape") setDraft(undefined);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <Input
      aria-label={`${label} of the Surface`}
      placeholder="auto"
      inputMode="decimal"
      className="h-5 min-w-0 flex-1 px-1 text-right text-[0.6875rem] tabular-nums"
      value={draft ?? shown}
      onFocus={() => setDraft(shown)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={finish}
      onKeyDown={onKeyDown}
    />
  );
}
