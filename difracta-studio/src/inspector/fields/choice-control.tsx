import type { ChoiceOption } from "@difracta/core";
import { useEffect } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  bundledFontStack,
  loadBundledFont,
  loadBundledFonts,
} from "@/fonts/bundled-fonts";

/**
 * A choice among an Address's options. An option that names a Bundled Font
 * is drawn in it, in the list and as the shown value: the chosen option's
 * font loads when the control appears, the others the first time the list
 * opens.
 */
export function ChoiceControl({
  label,
  options,
  value,
  send,
}: {
  readonly label: string;
  readonly options: readonly ChoiceOption[];
  readonly value: string | null;
  readonly send: (value: string) => void;
}) {
  const chosen = options.find((option) => option.value === value)?.font;
  const drawsFonts = options.some((option) => option.font !== undefined);
  useEffect(() => {
    if (chosen !== undefined) loadBundledFont(chosen);
  }, [chosen]);
  return (
    <Select
      value={value}
      items={options}
      onOpenChange={(open) => {
        if (open && drawsFonts) loadBundledFonts();
      }}
      onValueChange={(next: string | null) => {
        if (next !== null) send(next);
      }}
    >
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue style={{ fontFamily: bundledFontStack(chosen) }} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span style={{ fontFamily: bundledFontStack(option.font) }}>
              {option.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
