import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";

import { addTag, removeTag, tagSuggestions } from "./tag-edit";

/**
 * An entry's tags as chips, each with a remove, and a field that adds one
 * on Enter or comma, offering the Pack's other tags as it is typed. A tag
 * typed in another case than the Pack uses takes the Pack's spelling.
 */
export function TagEditor({
  tags,
  packTags,
  disabled,
  onChange,
}: {
  readonly tags: readonly string[];
  /** Every tag the Pack's entries carry, for the suggestions. */
  readonly packTags: Iterable<string>;
  /** Why editing is off, shown as the field's title; undefined when it is on. */
  readonly disabled: string | undefined;
  readonly onChange: (tags: readonly string[]) => void;
}) {
  const [typed, setTyped] = useState("");
  const listId = useId();
  const suggestions = tagSuggestions(packTags, tags);
  const commit = (): void => {
    const next = addTag(tags, typed, suggestions);
    setTyped("");
    if (next !== tags) onChange(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      event.stopPropagation();
      commit();
    } else if (event.key === "Backspace" && typed === "" && tags.length > 0) {
      event.preventDefault();
      onChange(tags.slice(0, -1));
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setTyped("");
    }
  };
  return (
    <div className="grid gap-1" data-testid="tag-editor">
      <span className="text-xs text-muted-foreground">Tags</span>
      <div className="flex flex-wrap items-center gap-1">
        {tags.map((tag) => (
          <span
            key={tag.toLowerCase()}
            data-tag={tag}
            className="flex h-5 items-center gap-0.5 rounded-sm border bg-input/30 pl-1.5 text-[0.6875rem]"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              title={disabled}
              disabled={disabled !== undefined}
              className="grid size-4 place-items-center rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              onClick={() => onChange(removeTag(tags, tag))}
            >
              <X className="size-2.5" />
            </button>
          </span>
        ))}
        <Input
          aria-label="Add a tag"
          placeholder={tags.length === 0 ? "Add a tag…" : "Add…"}
          list={listId}
          title={disabled}
          disabled={disabled !== undefined}
          className="h-5 min-w-16 flex-1 px-1 text-[0.6875rem]"
          value={typed}
          onChange={(event) => setTyped(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <datalist id={listId}>
          {suggestions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
