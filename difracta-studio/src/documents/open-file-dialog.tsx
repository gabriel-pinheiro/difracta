import type { FileEntry } from "@difracta/protocol";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClient } from "@/lib/client";

interface OpenFileDialogProps {
  readonly open: boolean;
  /** Paths of the Installations the runtime already has open. */
  readonly openPaths: readonly string[];
  readonly onOpen: (entry: FileEntry) => void;
  readonly onClose: () => void;
}

/**
 * Lists `.difracta` files in the runtime's projects folder. A file with a
 * newer autosave opens from it; the recovery toast then offers Save or Revert.
 */
export function OpenFileDialog({
  open,
  openPaths,
  onOpen,
  onClose,
}: OpenFileDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        {open && (
          <FileList openPaths={openPaths} onOpen={onOpen} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

const modifiedFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Mounted while the dialog is open, so each opening fetches a fresh listing. */
function FileList({
  openPaths,
  onOpen,
  onClose,
}: Omit<OpenFileDialogProps, "open">) {
  const client = useClient();
  const [listing, setListing] = useState<
    | { readonly items: readonly FileEntry[]; readonly projectsDir: string }
    | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    void client
      .request<{ items: FileEntry[]; projectsDir: string }>("files.list", {})
      .then((result) => {
        if (!cancelled) setListing(result);
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Open Installation</DialogTitle>
        <DialogDescription className="truncate">
          {listing?.projectsDir ?? "…"}
        </DialogDescription>
      </DialogHeader>
      {listing === undefined && (
        <p className="text-muted-foreground">Loading…</p>
      )}
      {listing?.items.length === 0 && (
        <p className="text-muted-foreground">No .difracta files here yet.</p>
      )}
      {listing !== undefined && listing.items.length > 0 && (
        <ul className="-mx-1 max-h-80 overflow-auto">
          {listing.items.map((entry) => (
            <li key={entry.path}>
              <button
                type="button"
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                onClick={() => onOpen(entry)}
              >
                <span className="truncate font-medium">{entry.name}</span>
                <span className="flex gap-1 text-[0.625rem] tracking-wide uppercase">
                  {openPaths.includes(entry.path) && (
                    <span className="text-emerald-400">open</span>
                  )}
                  {entry.recoveryAvailable && (
                    <span className="text-amber-400">unsaved changes</span>
                  )}
                </span>
                <span className="truncate text-muted-foreground">
                  {entry.path}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {modifiedFormat.format(entry.modifiedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  );
}
