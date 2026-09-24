import { Link } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyWithToast } from "@/lib/copy-text";

/** A read-only value with a copy button and, when given, more actions beside it. */
export function CopyField({
  label,
  description,
  value,
  actions,
}: {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly actions?: ReactNode;
}) {
  function copy(): void {
    copyWithToast(value, `${label} copied`);
  }
  return (
    <div className="grid gap-1">
      <Label className="grid gap-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Input readOnly value={value} className="font-mono text-[0.625rem]" />
      </Label>
      {description !== undefined && (
        <p className="text-[0.6875rem]/relaxed text-muted-foreground">
          {description}
        </p>
      )}
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={copy}>
          <Link /> Copy
        </Button>
        {actions}
      </div>
    </div>
  );
}
