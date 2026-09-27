import { settings } from "@difracta/core";
import { useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { textKeyAction, textToCommit } from "./text-format";

/**
 * Text edited locally and sent when the field loses focus, never per
 * keystroke, so a wall does not show a half-typed word. Enter commits a
 * single line; a multiline field is a textarea where Enter is a line break
 * and Ctrl+Enter (Cmd+Enter on macOS) commits. Escape cancels: the text goes
 * back to the document's value and nothing is sent. While the field is not
 * focused it follows the document, so a change from elsewhere shows.
 */
export function TextControl({
  label,
  value,
  multiline,
  send,
}: {
  readonly label: string;
  readonly value: string;
  readonly multiline: boolean;
  readonly send: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [seenValue, setSeenValue] = useState(value);
  // Set by Escape so the blur it triggers cancels instead of committing.
  const cancelled = useRef(false);
  if (value !== seenValue) {
    // Follow the document while idle; React allows adjusting state during render.
    setSeenValue(value);
    if (!editing) setText(value);
  }

  function finish(): void {
    setEditing(false);
    const next = textToCommit(text, value, cancelled.current);
    cancelled.current = false;
    if (next === undefined) setText(value);
    else send(next);
  }

  function onKeyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ): void {
    const action = textKeyAction(event, multiline);
    if (action === undefined) return;
    cancelled.current = action === "cancel";
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.blur();
  }

  const field = {
    "aria-label": label,
    maxLength: settings.text.maxLength,
    value: text,
    onFocus: () => setEditing(true),
    onBlur: finish,
    onKeyDown,
  };
  return multiline ? (
    <Textarea
      {...field}
      className="max-h-40 min-h-12 min-w-0 flex-1 px-2 py-1"
      title="Ctrl+Enter or leaving the field applies the text; Escape cancels"
      onChange={(event) => setText(event.currentTarget.value)}
    />
  ) : (
    <Input
      {...field}
      className="h-6 min-w-0 flex-1"
      onChange={(event) => setText(event.currentTarget.value)}
    />
  );
}
