import { ExternalLink, Link } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A read-only value with a copy button and, when given, a link that opens it. */
export function CopyField({
  label,
  description,
  value,
  openHref,
}: {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly openHref?: string;
}) {
  function copy(): void {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error(`Could not copy the ${label.toLowerCase()}.`));
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
        {openHref !== undefined && (
          <Button
            size="sm"
            variant="outline"
            render={<a href={openHref} target="_blank" rel="noreferrer" />}
          >
            <ExternalLink /> Open
          </Button>
        )}
      </div>
    </div>
  );
}
