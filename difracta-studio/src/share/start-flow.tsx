import type { ShareQuality } from "@difracta/core";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

import { captureSource } from "./share-capture";
import type { SharePageProps } from "./share-page";
import { slotStatus, type ShareSlot } from "@/entities/media/share-slots";
import { SourcePicker } from "./source-picker";

const QUALITIES: readonly {
  readonly value: ShareQuality;
  readonly label: string;
  readonly hint: string;
}[] = [
  {
    value: "sharp",
    label: "Sharp",
    hint: "Text and slides: every pixel kept, fewer frames when this computer is busy.",
  },
  {
    value: "smooth",
    label: "Smooth",
    hint: "Video: every frame kept, a softer picture when this computer is busy.",
  },
];

/**
 * Starting a share: the slot, Sharp or Smooth, the cursor or not, then what
 * to share, asked by the system where it has a picker and chosen here where
 * it has none. An Installation without a Screen Share offers to add one.
 */
export function StartFlow({
  bridge,
  context,
  sharer,
  installation,
  slots,
  onDone,
  onCancel,
}: SharePageProps & {
  readonly slots: readonly ShareSlot[];
  /** A share started. */
  readonly onDone: () => void;
  /** Back to the list; undefined when there is none to go back to. */
  readonly onCancel: (() => void) | undefined;
}) {
  const [picked, setPicked] = useState<string>();
  const [quality, setQuality] = useState<ShareQuality>("sharp");
  const [cursor, setCursor] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The slot picked, while it is there; else the first nobody shares into.
  const slot =
    slots.find((entry) => entry.id === picked) ??
    slots.find((entry) => entry.sharer === undefined && !entry.mine) ??
    slots[0];

  const capture = (sourceId: string | undefined): void => {
    if (slot === undefined) return;
    setBusy(true);
    setProblem(null);
    void captureSource(bridge, { quality, cursor }, sourceId)
      .then((result) => {
        if (result.kind === "failed") setProblem(result.reason);
        if (result.kind !== "captured") return;
        sharer.start(slot.id, result.captured, { quality, cursor });
        setChoosing(false);
        onDone();
      })
      .finally(() => setBusy(false));
  };
  const addSlot = (): void => {
    setProblem(null);
    void installation
      .createSlot()
      .then(setPicked, (error: unknown) =>
        setProblem(error instanceof Error ? error.message : String(error)),
      );
  };

  return (
    <section className="grid gap-5" data-testid="share-start">
      {context.screenAccess === "denied" && (
        <p role="alert" className="text-xs text-destructive">
          macOS does not let Difracta record the screen. Allow it under System
          Settings, Privacy &amp; Security, Screen &amp; System Audio Recording,
          then start Difracta again.
        </p>
      )}

      <div className="grid gap-2">
        <h2 className="font-medium">Share into</h2>
        {slots.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This Installation has no Screen Share yet. A Screen Share is the
            Media item a Layer with the Live Visual shows; add one here, or with
            Studio or <code>difracta media screen-share</code>.
          </p>
        ) : (
          <RadioGroup
            value={slot?.id ?? ""}
            onValueChange={(value) => setPicked(String(value))}
            aria-label="Screen Shares"
            className="gap-0 divide-y rounded-md border"
          >
            {slots.map((entry) => (
              <Label
                key={entry.id}
                className="flex items-center gap-3 px-3 py-2 font-normal"
                data-testid="share-slot"
              >
                <RadioGroupItem value={entry.id} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {slotStatus(entry)}
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        )}
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={addSlot}
        >
          Add a Screen Share
        </Button>
      </div>

      <div className="grid gap-2">
        <h2 className="font-medium">Quality</h2>
        <RadioGroup
          value={quality}
          onValueChange={(value) =>
            setQuality(value === "smooth" ? "smooth" : "sharp")
          }
          aria-label="Quality"
          className="gap-2"
        >
          {QUALITIES.map(({ value, label, hint }) => (
            <Label key={value} className="flex items-start gap-3 font-normal">
              <RadioGroupItem value={value} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <Label className="flex items-center gap-3 font-normal">
        <Switch
          checked={cursor}
          onCheckedChange={setCursor}
          aria-label="Show the cursor"
        />
        Show the cursor
      </Label>
      <p className="-mt-3 text-xs text-muted-foreground">
        Some systems draw the cursor into every capture; the share then says so.
      </p>

      {problem !== null && (
        <p role="alert" className="text-xs text-destructive">
          {problem}
        </p>
      )}

      {choosing && context.picker === "own" ? (
        <SourcePicker
          bridge={bridge}
          busy={busy}
          onChoose={(source) => capture(source.id)}
        />
      ) : (
        <div className="flex gap-2">
          <Button
            size="lg"
            className="px-4"
            disabled={slot === undefined || busy}
            onClick={() =>
              context.picker === "own" ? setChoosing(true) : capture(undefined)
            }
          >
            Choose what to share…
          </Button>
          {onCancel !== undefined && (
            <Button size="lg" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      )}
      {choosing && context.picker === "own" && (
        <Button
          variant="ghost"
          className="justify-self-start"
          onClick={() => setChoosing(false)}
        >
          Back
        </Button>
      )}
    </section>
  );
}
