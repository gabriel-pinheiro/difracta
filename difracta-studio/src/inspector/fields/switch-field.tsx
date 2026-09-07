import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/** A boolean setting: label and explanation on the left, switch on the right. */
export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Label className="flex items-start justify-between gap-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-xs">{label}</span>
        {description !== undefined && (
          <span className="text-[0.6875rem]/relaxed font-normal text-muted-foreground">
            {description}
          </span>
        )}
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </Label>
  );
}
