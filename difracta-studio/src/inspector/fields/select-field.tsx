import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/** A choice among named options; `null` is the "none" option when `noneLabel` is given. */
export function SelectField({
  label,
  value,
  options,
  noneLabel,
  onValueChange,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly options: readonly SelectOption[];
  readonly noneLabel?: string;
  readonly onValueChange: (value: string | null) => void;
}) {
  const items =
    noneLabel === undefined
      ? options
      : [{ value: null, label: noneLabel }, ...options];
  return (
    <Label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Select
        value={value}
        items={items}
        onValueChange={(next: string | null) => onValueChange(next)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value ?? ""} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  );
}
