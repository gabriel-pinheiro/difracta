/** How text is shown where there is one short line for it, and which keys end an edit of it. */

/** Text on one line: each run of line breaks, with the spaces around it, becomes one space. */
export function singleLine(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, " ").trim();
}

/**
 * Text as a preview of at most `length` characters, on one line, ending in
 * an ellipsis when it was cut.
 */
export function textPreview(text: string, length: number): string {
  const line = singleLine(text);
  const characters = Array.from(line);
  if (characters.length <= length) return line;
  return `${characters
    .slice(0, Math.max(0, length - 1))
    .join("")
    .trimEnd()}…`;
}

export interface TextKey {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/**
 * What a key does to text being edited: Escape cancels; Enter commits a
 * single line, and in a multiline field, where Enter is a line break,
 * Ctrl+Enter or Cmd+Enter does.
 */
export function textKeyAction(
  event: TextKey,
  multiline: boolean,
): "commit" | "cancel" | undefined {
  if (event.key === "Escape") return "cancel";
  if (event.key !== "Enter") return undefined;
  if (!multiline) return "commit";
  return event.ctrlKey || event.metaKey ? "commit" : undefined;
}

/**
 * What leaving the field sends: the draft when the edit was not cancelled
 * and changed the document's value, undefined when there is nothing to send.
 */
export function textToCommit(
  draft: string,
  value: string,
  cancelled: boolean,
): string | undefined {
  return cancelled || draft === value ? undefined : draft;
}
