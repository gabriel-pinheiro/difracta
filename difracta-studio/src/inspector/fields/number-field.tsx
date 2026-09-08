import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  /** Decimals shown while idle; typed values keep their own precision. */
  readonly decimals?: number;
  readonly step?: number;
  /** Shown after the input, such as "%". */
  readonly unit?: string;
  readonly onCommit: (value: number) => void;
}

/**
 * A numeric field with the same contract as `NameField`: edits locally,
 * commits on blur or Enter, cancels on Escape, follows remote changes while
 * idle. Text that is not a number is dropped on commit.
 */
export function NumberField({
  label,
  value,
  decimals = 2,
  step,
  unit,
  onCommit,
}: NumberFieldProps) {
  const shown = value.toFixed(decimals);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  const [seenValue, setSeenValue] = useState(shown);
  const cancelled = useRef(false);
  if (shown !== seenValue) {
    setSeenValue(shown);
    if (!editing) setText(shown);
  }

  function finish(): void {
    setEditing(false);
    const parsed = cancelled.current ? Number.NaN : Number(text.trim());
    cancelled.current = false;
    if (Number.isFinite(parsed) && parsed.toFixed(decimals) !== shown)
      onCommit(parsed);
    else setText(shown);
  }

  return (
    <Label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="decimal"
          step={step}
          className="tabular-nums"
          value={text}
          onFocus={() => setEditing(true)}
          onChange={(event) => setText(event.currentTarget.value)}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelled.current = true;
              event.currentTarget.blur();
            }
          }}
        />
        {unit !== undefined && (
          <span className="text-xs text-muted-foreground">{unit}</span>
        )}
      </span>
    </Label>
  );
}
