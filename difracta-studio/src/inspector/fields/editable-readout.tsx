import { useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";

/**
 * "2.5 bands/s", "4 Hz", but "40%", "90°/s", "2x/s": a thin space before a
 * word unit, none before a sign or a multiplier.
 */
export function unitGap(unit: string): string {
  const tight = unit === "" || /^(?:[^\p{L}]|x(?:$|\/))/u.test(unit);
  return tight ? "" : "\u2009";
}

/** A readout's value, then its unit dimmer. */
export function ValueWithUnit({
  text,
  unit,
}: {
  readonly text: string;
  readonly unit: string;
}) {
  return (
    <>
      {text}
      {unit !== "" && (
        <span className="text-muted-foreground/60">
          {unitGap(unit)}
          {unit}
        </span>
      )}
    </>
  );
}

/**
 * A value shown as text that turns into an input when clicked. The unit
 * follows the value dimmer, and the readout grows to fit both. Enter or
 * blur commits what `parse` accepts, Escape cancels; text `parse` refuses
 * is dropped and the readout returns.
 */
export function EditableReadout<TValue>({
  label,
  text,
  unit = "",
  className,
  inputClassName,
  parse,
  commit,
}: {
  readonly label: string;
  readonly text: string;
  readonly unit?: string;
  readonly className: string;
  /** The typing input's width, fixed so the row does not jump. */
  readonly inputClassName: string;
  readonly parse: (text: string) => TValue | undefined;
  readonly commit: (value: TValue) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined);
  if (draft === undefined) {
    return (
      <button
        type="button"
        aria-label={`Edit ${label}`}
        title={`${text}${unitGap(unit)}${unit} (click to type a value)`}
        className={`${className} shrink-0 rounded-sm px-1 text-right text-[0.6875rem] whitespace-nowrap text-muted-foreground tabular-nums hover:bg-input/50 hover:text-foreground`}
        onClick={() => setDraft(text)}
      >
        <ValueWithUnit text={text} unit={unit} />
      </button>
    );
  }
  const finish = (cancel: boolean): void => {
    if (!cancel) {
      const parsed = parse(draft);
      if (parsed !== undefined) commit(parsed);
    }
    setDraft(undefined);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") finish(false);
    else if (event.key === "Escape") finish(true);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <Input
      autoFocus
      aria-label={label}
      className={`${inputClassName} h-5 shrink-0 px-1 text-right text-[0.6875rem] tabular-nums`}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => finish(false)}
      onKeyDown={onKeyDown}
    />
  );
}
