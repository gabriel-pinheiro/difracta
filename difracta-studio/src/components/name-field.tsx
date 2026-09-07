import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NameFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onCommit: (value: string) => void;
}

/**
 * A text field that edits locally and commits when it loses focus. Enter
 * commits, Escape cancels: the text goes back to the current value and
 * nothing is sent. While the field is not focused it follows remote changes.
 */
export function NameField({ label, value, onCommit }: NameFieldProps) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seenValue, setSeenValue] = useState(value);
  // Set by Escape so the blur it triggers cancels instead of committing.
  const cancelled = useRef(false);
  if (value !== seenValue) {
    // Follow remote renames while idle; React allows adjusting state during render.
    setSeenValue(value);
    if (!editing) setText(value);
  }

  function finish(): void {
    setEditing(false);
    const next = cancelled.current ? value : text.trim();
    cancelled.current = false;
    if (next !== "" && next !== value) onCommit(next);
    else setText(value);
  }

  return (
    <Label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Input
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
    </Label>
  );
}
