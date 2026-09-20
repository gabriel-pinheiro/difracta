import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * An address typed by hand: a network that isolates its clients hides every
 * runtime from the list. Desktop checks what is typed and says what is wrong
 * with it, so the page only passes it on.
 */
export function AddressForm({
  busy,
  onConnect,
}: {
  readonly busy: boolean;
  readonly onConnect: (address: string) => void;
}) {
  const [address, setAddress] = useState("");
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (address.trim() !== "") onConnect(address.trim());
      }}
    >
      <Label className="grid flex-1 gap-1">
        <span className="text-xs text-muted-foreground">
          Address: host, host:port or URL
        </span>
        <Input
          value={address}
          placeholder="192.168.1.20"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(event) => setAddress(event.currentTarget.value)}
        />
      </Label>
      <Button
        type="submit"
        variant="outline"
        disabled={busy || address.trim() === ""}
      >
        Connect
      </Button>
    </form>
  );
}
