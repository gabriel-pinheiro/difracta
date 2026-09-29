import { Button } from "@/components/ui/button";

import type { PreviewNotice } from "./preview-target";

/** Why the Preview did not follow the selected Surface, and the way out when there is one. */
export function PreviewNoticeBar({
  notice,
  onOutput,
}: {
  readonly notice: PreviewNotice;
  /** Moves the Preview to one of the Outputs the notice lists. */
  readonly onOutput: (outputId: string) => void;
}) {
  return (
    <div
      role="status"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b px-2 py-1 text-muted-foreground"
    >
      {notice.kind === "unmapped" ? (
        <span>
          Surface “{notice.surfaceName}” is on no Output, so the Preview stays
          where it is.
        </span>
      ) : (
        <>
          <span>Surface “{notice.surfaceName}” is on several Outputs:</span>
          {notice.outputs.map((output) => (
            <Button
              key={output.id}
              variant="outline"
              size="xs"
              onClick={() => onOutput(output.id)}
            >
              {output.name}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}
