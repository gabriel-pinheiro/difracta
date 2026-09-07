import type { ReactNode } from "react";

/** The one-line title strip at the top of a workspace panel. */
export function PanelHeader({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center border-b px-2 text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  );
}
