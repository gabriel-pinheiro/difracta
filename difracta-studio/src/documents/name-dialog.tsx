import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface NameRequest {
  readonly title: string;
  readonly label: string;
  readonly initial: string;
  readonly submitLabel: string;
  onSubmit(value: string): void;
}

/** Asks for one line of text: an Installation name, a file name. */
export function NameDialog({
  request,
  onClose,
}: {
  readonly request: NameRequest | undefined;
  readonly onClose: () => void;
}) {
  return (
    <Dialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {request !== undefined && (
        <NameForm key={request.title} request={request} onClose={onClose} />
      )}
    </Dialog>
  );
}

function NameForm({
  request,
  onClose,
}: {
  readonly request: NameRequest;
  readonly onClose: () => void;
}) {
  const [value, setValue] = useState(request.initial);
  const trimmed = value.trim();
  return (
    <DialogContent>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed === "") return;
          onClose();
          request.onSubmit(trimmed);
        }}
      >
        <DialogHeader>
          <DialogTitle>{request.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {request.label}
          </DialogDescription>
        </DialogHeader>
        <Label className="grid gap-1">
          <span className="text-xs text-muted-foreground">{request.label}</span>
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </Label>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={trimmed === ""}>
            {request.submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
