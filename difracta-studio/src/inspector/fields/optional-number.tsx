import { useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * A number that may be absent: empty commits `undefined`, a number that
 * `accepts` commits itself, and anything else is dropped. It edits locally,
 * commits on blur or Enter and cancels on Escape, like `NameField`.
 */
export function OptionalNumber({
  label,
  value,
  placeholder,
  accepts = (number) => number > 0,
  className,
  disabled,
  onCommit,
}: {
  /** What a screen reader says the field is. */
  readonly label: string;
  readonly value: number | undefined;
  /** Shown while empty: what absent means. */
  readonly placeholder: string;
  readonly accepts?: (value: number) => boolean;
  readonly className?: string;
  /** Why the field is off, shown on hover; undefined when it is on. */
  readonly disabled?: string | undefined;
  readonly onCommit: (value: number | undefined) => void;
}) {
  const shown = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const finish = (): void => {
    if (draft === undefined) return;
    const text = draft.trim();
    const parsed = Number(text);
    if (text === "") {
      if (value !== undefined) onCommit(undefined);
    } else if (Number.isFinite(parsed) && accepts(parsed) && parsed !== value)
      onCommit(parsed);
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
      aria-label={label}
      placeholder={placeholder}
      title={disabled}
      disabled={disabled !== undefined}
      inputMode="decimal"
      className={cn(
        "h-5 min-w-0 flex-1 px-1 text-right text-[0.6875rem] tabular-nums",
        className,
      )}
      value={draft ?? shown}
      onFocus={() => setDraft(shown)}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={finish}
      onKeyDown={onKeyDown}
    />
  );
}
