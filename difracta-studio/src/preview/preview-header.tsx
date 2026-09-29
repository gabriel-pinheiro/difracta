import type { DocumentView } from "@difracta/client";
import { orderedEntries, type Output, type Table } from "@difracta/core";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useDocumentPath } from "@/lib/client";

import { ASPECT_CHOICES, type AspectChoice } from "./preview-aspect";
import {
  FRAMINGS,
  FRAMING_LABELS,
  isFraming,
  type PreviewChoice,
} from "./preview-choice";
import { PreviewShown } from "./preview-shown";
import { framedOn, type PreviewTarget } from "./preview-target";

const FOLLOW = "follow";

/** What is on reads as on, the way the Library's facets do. */
const PRESSED =
  "text-muted-foreground aria-pressed:bg-input/50 aria-pressed:text-foreground";

const aspectLabel = (choice: AspectChoice): string =>
  choice === "output" ? "Output's ratio" : choice;

/**
 * What the Preview shows and how: following the selection, and how close,
 * or a named Output; whether the selection is outlined; and the ratio an
 * Output is drawn at, a Surface having its own.
 */
export function PreviewHeader({
  view,
  choice,
  target,
  aspect,
  onChoice,
  onAspect,
}: {
  readonly view: DocumentView;
  readonly choice: PreviewChoice;
  readonly target: PreviewTarget;
  readonly aspect: AspectChoice;
  readonly onChoice: (next: PreviewChoice) => void;
  readonly onAspect: (next: AspectChoice) => void;
}) {
  const outputs = orderedEntries(
    useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {},
  );
  return (
    <div className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-2 py-1">
      <Select
        value={choice.follow ? FOLLOW : (choice.outputId ?? FOLLOW)}
        items={[
          { value: FOLLOW, label: "Follow selection" },
          ...outputs.map(({ id, name }) => ({ value: id, label: name })),
        ]}
        onValueChange={(value: string | null) => {
          if (value === null) return;
          onChoice(
            value === FOLLOW
              ? { ...choice, follow: true }
              : { ...choice, follow: false, outputId: value },
          );
        }}
      >
        <SelectTrigger size="sm" aria-label="Preview shows">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW}>Follow selection</SelectItem>
          <SelectSeparator />
          {outputs.map((output) => (
            <SelectItem key={output.id} value={output.id}>
              {output.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {choice.follow && (
        <ToggleGroup
          size="sm"
          variant="outline"
          spacing={0}
          aria-label="Closest framing"
          value={[choice.framing]}
          onValueChange={([framing]: readonly unknown[]) => {
            if (isFraming(framing)) onChoice({ ...choice, framing });
          }}
        >
          {FRAMINGS.map((framing) => (
            <ToggleGroupItem key={framing} value={framing} className={PRESSED}>
              {FRAMING_LABELS[framing]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}
      <PreviewShown view={view} target={target} named={choice.follow} />
      <div className="flex-1" />
      <Toggle
        size="sm"
        variant="outline"
        aria-label="Outline selection"
        className={PRESSED}
        title="Outline the selected Surface or Region in the Preview"
        pressed={choice.outline}
        onPressedChange={(outline) => onChoice({ ...choice, outline })}
      >
        Outline
      </Toggle>
      {framedOn(target).framing === "output" && (
        <Select
          value={aspect}
          items={ASPECT_CHOICES.map((value) => ({
            value,
            label: aspectLabel(value),
          }))}
          onValueChange={(value: AspectChoice | null) => {
            if (value !== null) onAspect(value);
          }}
        >
          <SelectTrigger size="sm" aria-label="Aspect ratio">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {ASPECT_CHOICES.map((value) => (
              <SelectItem key={value} value={value}>
                {aspectLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
