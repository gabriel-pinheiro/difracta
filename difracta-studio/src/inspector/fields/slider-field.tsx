import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useLatestWins } from "@/lib/use-latest-wins";

/**
 * A number on a slider with its value read out beside it. Dragging sends
 * every position through `onChange`, one send in flight at a time, so the
 * Outputs follow the thumb; the field shows the dragged value until the
 * document catches up.
 */
export function SliderField({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  unit,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Shown after the value, such as "%". */
  readonly unit?: string;
  readonly onChange: (value: number) => Promise<unknown>;
}) {
  const [dragged, setDragged] = useState<number | undefined>(undefined);
  const send = useLatestWins(onChange);
  const shown = dragged ?? value;
  return (
    <Label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <Slider
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={shown}
          onValueChange={(next) => {
            const position = typeof next === "number" ? next : (next[0] ?? min);
            setDragged(position);
            send(position);
          }}
          onValueCommitted={() => setDragged(undefined)}
        />
        <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
          {Math.round(shown)}
          {unit}
        </span>
      </span>
    </Label>
  );
}
