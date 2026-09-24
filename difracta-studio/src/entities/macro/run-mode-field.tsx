import { RUN_MODES, type RunMode, type RunnableMacro } from "@difracta/core";

import { NumberField } from "@/inspector/fields/number-field";
import { SelectField } from "@/inspector/fields/select-field";

export const RUN_MODE_LABELS: Record<RunMode, string> = {
  all: "All",
  one: "One",
  some: "Some",
  sequence: "Sequence",
};

const RUN_MODE_OPTIONS = RUN_MODES.map((mode) => ({
  value: mode,
  label: RUN_MODE_LABELS[mode],
}));

/** What each Run Mode does, under the select. */
const RUN_MODE_HINTS: Record<RunMode, string> = {
  all: "Every action runs, in order.",
  one: "One action, picked at random.",
  some: "Actions picked at random, in list order.",
  sequence: "The next action each run, then the first again.",
};

/**
 * A Macro's Run Mode and, for Some, how many actions a run picks. Chance
 * on an action applies after the pick, so One with a 20% action is one
 * flash a fifth of the time.
 */
export function RunModeField({
  macro,
  onMode,
  onCount,
}: {
  readonly macro: RunnableMacro;
  readonly onMode: (mode: RunMode) => void;
  readonly onCount: (count: number) => void;
}) {
  return (
    <div className="grid gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-end gap-2">
        <SelectField
          label="Run Mode"
          value={macro.mode}
          options={RUN_MODE_OPTIONS}
          onValueChange={(mode) => {
            if (mode !== null && mode !== macro.mode) onMode(mode as RunMode);
          }}
        />
        {macro.mode === "some" && (
          <NumberField
            label="Count"
            value={macro.count}
            decimals={0}
            step={1}
            onCommit={(count) => {
              const whole = Math.max(1, Math.round(count));
              if (whole !== macro.count) onCount(whole);
            }}
          />
        )}
      </div>
      <p className="text-[0.6875rem]/relaxed text-muted-foreground">
        {RUN_MODE_HINTS[macro.mode]}
      </p>
    </div>
  );
}
