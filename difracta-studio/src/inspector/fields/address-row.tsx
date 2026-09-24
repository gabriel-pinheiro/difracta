import {
  sameAddressValue,
  type AddressValue,
  type Color,
  type NumberRange,
  type ResolvedAddress,
} from "@difracta/core";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useLatestWins } from "@/lib/use-latest-wins";

import {
  colorToHex,
  displayUnit,
  formatNumber,
  hexToColor,
  parseNumber,
} from "./address-format";
import { EditableReadout } from "./editable-readout";
import { FieldRow } from "./field-row";
import { LinkedControl, LinkMenu, type RowLinks } from "./link-row";

export type { RowLinks } from "./link-row";

/**
 * One controllable value as an inspector row. The Address says what it is
 * (type, range, options, default), so a Layer's opacity and a Visual's
 * Parameter are the same component. Continuous controls stream every
 * position through `onEdit`, one send in flight at a time, and show the
 * dragged value until the document catches up. With `links`, the row ends
 * in a menu to link it to a Controller; a linked row shows its effective
 * value read-only with a chip naming the Controller, since the value is
 * changed on the Controller and nowhere else.
 */
export function AddressRow({
  resolved,
  value,
  description,
  onEdit,
  links,
}: {
  readonly resolved: ResolvedAddress;
  readonly value: AddressValue;
  readonly description?: string | undefined;
  readonly onEdit: (value: AddressValue) => Promise<unknown>;
  readonly links?: RowLinks | undefined;
}) {
  const send = useLatestWins(onEdit);
  const fallback = resolved.default;
  const isDefault = fallback === undefined || sameAddressValue(value, fallback);
  const linked = links?.link !== undefined && links.controller !== undefined;
  return (
    <FieldRow
      label={resolved.label}
      description={description}
      onReset={
        isDefault || fallback === undefined || linked
          ? undefined
          : () => void onEdit(fallback)
      }
      trailing={
        links === undefined ? undefined : (
          <LinkMenu resolved={resolved} links={links} />
        )
      }
      wide={linked}
    >
      {linked ? (
        <LinkedControl resolved={resolved} links={links} />
      ) : (
        <Control resolved={resolved} value={value} send={send} />
      )}
    </FieldRow>
  );
}

/** The control for an Address by its type, with nothing around it: shared with a Macro action's value. */
export function Control({
  resolved,
  value,
  send,
}: {
  readonly resolved: ResolvedAddress;
  readonly value: AddressValue;
  readonly send: (value: AddressValue) => void;
}) {
  switch (resolved.type) {
    case "number":
      return (
        <NumberControl
          label={resolved.label}
          range={resolved.range ?? { min: 0, max: 1 }}
          value={typeof value === "number" ? value : 0}
          send={send}
        />
      );
    case "boolean":
      return (
        <Switch
          aria-label={resolved.label}
          checked={value === true}
          onCheckedChange={(checked) => send(checked)}
        />
      );
    case "choice":
      return (
        <Select
          value={typeof value === "string" ? value : null}
          items={resolved.options ?? []}
          onValueChange={(next: string | null) => {
            if (next !== null) send(next);
          }}
        >
          <SelectTrigger aria-label={resolved.label} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(resolved.options ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "color":
      return (
        <ColorControl
          label={resolved.label}
          value={typeof value === "object" ? value : [0, 0, 0, 1]}
          send={send}
        />
      );
    case "trigger":
      return null;
  }
}

/** A slider with its value beside it; clicking the value types one, clamped to the range. */
function NumberControl({
  label,
  range,
  value,
  send,
}: {
  readonly label: string;
  readonly range: NumberRange;
  readonly value: number;
  readonly send: (value: number) => void;
}) {
  const [dragged, setDragged] = useState<number | undefined>(undefined);
  const shown = dragged ?? value;
  return (
    <>
      <Slider
        aria-label={label}
        className="min-w-0 flex-1"
        min={range.min}
        max={range.max}
        step={range.step ?? (range.max - range.min) / 100}
        value={shown}
        onValueChange={(next) => {
          const position = typeof next === "number" ? next : (next[0] ?? 0);
          setDragged(position);
          send(position);
        }}
        onValueCommitted={() => setDragged(undefined)}
      />
      <EditableReadout
        label={label}
        text={formatNumber(shown, range)}
        unit={displayUnit(range)}
        className="min-w-14"
        inputClassName="w-14"
        parse={(text) => parseNumber(text, range)}
        commit={send}
      />
    </>
  );
}

/**
 * Swatch (the browser's color input), editable hex, and an alpha slider.
 * The alpha slider wraps onto its own line when the row is too narrow to
 * give it a usable length beside the swatch and hex.
 */
function ColorControl({
  label,
  value,
  send,
}: {
  readonly label: string;
  readonly value: Color;
  readonly send: (value: Color) => void;
}) {
  const [dragged, setDragged] = useState<Color | undefined>(undefined);
  const shown = dragged ?? value;
  const alpha = shown[3];
  const hex = colorToHex(shown);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="color"
          aria-label={`${label} color`}
          className="size-5 shrink-0 cursor-pointer rounded-sm border border-input bg-transparent p-0 [&::-webkit-color-swatch]:rounded-[3px] [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          value={hex}
          onChange={(event) => {
            const next = hexToColor(event.currentTarget.value, alpha);
            if (next === undefined) return;
            setDragged(next);
            send(next);
          }}
          onBlur={() => setDragged(undefined)}
        />
        <EditableReadout
          label={`${label} hex`}
          text={hex.toUpperCase()}
          className="w-[4.25rem]"
          inputClassName="w-[4.25rem]"
          parse={(text) => hexToColor(text, alpha)}
          commit={send}
        />
      </div>
      <div className="flex min-w-0 flex-1 basis-28 items-center gap-1.5">
        <Slider
          aria-label={`${label} alpha`}
          className="min-w-0 flex-1"
          min={0}
          max={1}
          step={0.01}
          value={alpha}
          onValueChange={(next) => {
            const position = typeof next === "number" ? next : (next[0] ?? 1);
            const color: Color = [shown[0], shown[1], shown[2], position];
            setDragged(color);
            send(color);
          }}
          onValueCommitted={() => setDragged(undefined)}
        />
        <span className="w-8 shrink-0 text-right text-[0.6875rem] text-muted-foreground tabular-nums">
          {Math.round(alpha * 100)}%
        </span>
      </div>
    </div>
  );
}
