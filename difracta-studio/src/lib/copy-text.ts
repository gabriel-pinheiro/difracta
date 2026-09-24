import { toast } from "sonner";

/**
 * Puts `value` on the clipboard. `navigator.clipboard` only exists in a
 * secure context, so a Studio opened over plain http from another machine
 * falls back to copying a selected, off-screen textarea. Resolves whether
 * either worked.
 */
export async function copyText(value: string): Promise<boolean> {
  if (typeof navigator.clipboard?.writeText === "function") {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Refused (permissions, focus): the fallback may still work.
    }
  }
  return copyWithSelection(value);
}

function copyWithSelection(value: string): boolean {
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.top = "-1000px";
  area.style.opacity = "0";
  const focused = document.activeElement;
  document.body.append(area);
  area.select();
  try {
    // The one copy that works outside a secure context.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
    if (focused instanceof HTMLElement) focused.focus();
  }
}

/** Copies `value` and says so: `copied` on success, how to copy by hand otherwise. */
export function copyWithToast(value: string, copied: string): void {
  void copyText(value).then((ok) => {
    if (ok) toast.success(copied);
    else
      toast.error(
        "Copy is not available here; select the address and copy it.",
      );
  });
}
