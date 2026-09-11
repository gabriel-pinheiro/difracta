import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * One inspector line: the label at the left, the control in the middle, and
 * at the right a reset button when the value is not the default. Every row
 * has the same three columns so a long list of Parameters scans as a table.
 * When the inspector is too narrow to give a slider a usable length, the
 * control moves under the label and takes the whole width.
 */
export function FieldRow({
  label,
  description,
  onReset,
  children,
}: {
  readonly label: string;
  readonly description?: string | undefined;
  /** Present when the value differs from its default. */
  readonly onReset?: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid min-h-6 grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)_1.25rem] items-center gap-x-2 gap-y-0.5 @max-[18rem]:grid-cols-[minmax(0,1fr)_1.25rem]">
      <span
        className="truncate text-xs text-muted-foreground"
        title={description ?? label}
      >
        {label}
      </span>
      <div className="flex min-w-0 items-center gap-1.5 @max-[18rem]:order-last @max-[18rem]:col-span-2">
        {children}
      </div>
      {onReset === undefined ? (
        <span />
      ) : (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Reset ${label} to default`}
          title="Reset to default"
          onClick={onReset}
        >
          <RotateCcw />
        </Button>
      )}
    </div>
  );
}
