import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { AddressForm } from "./address-form";
import type {
  DifractaLaunch,
  LaunchRemembered,
  LaunchResult,
  LaunchRuntime,
} from "./launch-bridge";
import { RuntimeList } from "./runtime-list";
import { runtimeRows } from "./runtime-rows";

/** What is being started: this computer's runtime, or the address being connected to. */
type Pending = { readonly local: true } | { readonly address: string };

export function LaunchPage({ bridge }: { readonly bridge: DifractaLaunch }) {
  const [runtimes, setRuntimes] = useState<LaunchRuntime[]>([]);
  const [remembered, setRemembered] = useState<LaunchRemembered[]>([]);
  const [pending, setPending] = useState<Pending>();
  const [localProblem, setLocalProblem] = useState<string | null>(null);
  const [connectProblem, setConnectProblem] = useState<string | null>(null);

  useEffect(() => {
    // Subscribed before asking, so no change falls between the two.
    const unsubscribe = bridge.onRuntimesChanged(setRuntimes);
    void bridge.runtimes().then(setRuntimes);
    void bridge.remembered().then(setRemembered);
    // Whatever kept Desktop from resuming; it names its runtime itself.
    void bridge.problem().then(setConnectProblem);
    return unsubscribe;
  }, [bridge]);

  // On success Desktop closes this window, so only a failure comes back here.
  const start = (
    what: Pending,
    run: () => Promise<LaunchResult>,
    report: (reason: string | null) => void,
  ): void => {
    setPending(what);
    setLocalProblem(null);
    setConnectProblem(null);
    void run()
      .then((result) => report(result.ok ? null : result.reason))
      .catch((error: unknown) => report(String(error)))
      .finally(() => setPending(undefined));
  };
  const connect = (address: string): void =>
    start({ address }, () => bridge.connect(address), setConnectProblem);

  const busy = pending !== undefined;
  const startingLocal = pending !== undefined && "local" in pending;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-8 px-8 py-10">
      <h1 className="text-lg font-medium">Difracta</h1>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-medium">Run on this computer</h2>
          <p className="text-xs text-muted-foreground">
            Starts a Runtime here and opens Studio on your last Installation.
            Outputs on other devices attach to this computer.
          </p>
        </div>
        <Button
          size="lg"
          className="justify-self-start px-4"
          disabled={busy}
          onClick={() =>
            start({ local: true }, () => bridge.runLocal(), setLocalProblem)
          }
        >
          {startingLocal && <LoaderCircle className="animate-spin" />}
          {startingLocal ? "Starting the Runtime…" : "Run on this computer"}
        </Button>
        {localProblem !== null && (
          <p role="alert" className="text-xs text-destructive">
            {localProblem}
          </p>
        )}
      </section>

      <section className="grid gap-3">
        <div className="grid gap-1">
          <h2 className="font-medium">Connect to a Runtime</h2>
          <p className="text-xs text-muted-foreground">
            Opens the Studio of a Runtime that is already running, usually on
            another machine. Its Installation stays there.
          </p>
        </div>
        <RuntimeList
          rows={runtimeRows(runtimes, remembered)}
          busy={busy}
          connecting={
            pending !== undefined && "address" in pending
              ? pending.address
              : undefined
          }
          onConnect={connect}
          onForget={(address) =>
            void bridge.forget(address).then(setRemembered)
          }
        />
        <AddressForm busy={busy} onConnect={connect} />
        {connectProblem !== null && (
          <p role="alert" className="text-xs text-destructive">
            {connectProblem}
          </p>
        )}
      </section>
    </main>
  );
}
