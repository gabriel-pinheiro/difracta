import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Fires a Cue; lit for a moment afterwards so a press is seen without an Output. */
export function CueButton({
  label,
  onFire,
}: {
  readonly label: string;
  readonly onFire: () => Promise<unknown>;
}) {
  const [lit, setLit] = useState(false);
  return (
    <Button
      variant="outline"
      size="xs"
      data-lit={lit || undefined}
      className="data-lit:border-selection data-lit:bg-selection/20"
      onClick={() => {
        setLit(true);
        window.setTimeout(() => setLit(false), 150);
        void onFire();
      }}
    >
      {label}
    </Button>
  );
}
