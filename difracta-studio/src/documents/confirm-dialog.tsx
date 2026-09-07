import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmRequest {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  onConfirm(): void;
}

/** A destructive yes/no question: discard changes, revert to the file. */
export function ConfirmDialog({
  request,
  onClose,
}: {
  readonly request: ConfirmRequest | undefined;
  readonly onClose: () => void;
}) {
  return (
    <AlertDialog
      open={request !== undefined}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {request !== undefined && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{request.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {request.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onClose();
                request.onConfirm();
              }}
            >
              {request.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  );
}
