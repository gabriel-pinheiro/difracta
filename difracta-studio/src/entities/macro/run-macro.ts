import type { DocumentView } from "@difracta/client";
import type { Macro } from "@difracta/core";
import { useCallback } from "react";
import { toast } from "sonner";

import { useClient } from "@/lib/client";

/**
 * Runs a Macro through its trigger Address, the same path a Pad or OSC
 * takes. The run is best-effort: what it skipped comes back as warnings and
 * is shown once, so a broken action is noticed at rehearsal.
 */
export function useRunMacro(view: DocumentView): (macro: Macro) => void {
  const client = useClient();
  const { documentId } = view;
  return useCallback(
    (macro) => {
      void client
        .command<{ readonly warnings?: readonly string[] }>(
          documentId,
          "address.trigger",
          { address: `macro/${macro.id}/run` },
        )
        .then(
          (result) => {
            const warnings = result.warnings ?? [];
            if (warnings.length > 0)
              toast.warning(
                `${macro.name} skipped ${String(warnings.length)}`,
                {
                  description: warnings.join("\n"),
                },
              );
          },
          (failure: unknown) => {
            toast.error(`${macro.name} did not run`, {
              description:
                failure instanceof Error ? failure.message : String(failure),
            });
          },
        );
    },
    [client, documentId],
  );
}
