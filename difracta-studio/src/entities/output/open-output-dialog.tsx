import type { DocumentView } from "@difracta/client";
import type { Output } from "@difracta/core";
import { AppWindow, Link } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { copyWithToast } from "@/lib/copy-text";

import { DisplayHostsList } from "./display-hosts-list";
import { outputPageUrl } from "./output-url";

/**
 * The three ways to get an Output in front of people: a window on this
 * computer, a Display of any connected Display Host, or its address, for a
 * browser on a TV or another machine. The same from a plain browser as from
 * Difracta Desktop, where the window is one of Desktop's.
 */
export function OpenOutputDialog({
  view,
  output,
  open,
  onOpenChange,
}: {
  readonly view: DocumentView;
  readonly output: Output;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const url = outputPageUrl(output.id);

  function copy(): void {
    copyWithToast(url, "Output page URL copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Open {output.name}</DialogTitle>
            <DialogDescription className="sr-only">
              Open this Output in a window, show it on a Display, or copy its
              address.
            </DialogDescription>
          </DialogHeader>
          <Button
            variant="outline"
            className="justify-self-start"
            nativeButton={false}
            render={<a href={url} target="_blank" rel="noreferrer" />}
            onClick={() => onOpenChange(false)}
          >
            <AppWindow /> Open in a window
          </Button>
          <Way title="Show on a Display">
            <DisplayHostsList view={view} outputId={output.id} />
          </Way>
          <Way title="Output page URL">
            <div className="flex gap-1">
              <Input
                readOnly
                value={url}
                aria-label="Output page URL"
                className="font-mono text-[0.625rem]"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button variant="outline" onClick={copy}>
                <Link /> Copy
              </Button>
            </div>
          </Way>
        </DialogContent>
      )}
    </Dialog>
  );
}

function Way({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="grid gap-1.5">
      <h3 className="text-xs text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
