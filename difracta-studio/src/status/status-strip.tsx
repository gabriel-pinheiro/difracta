import type { DocumentView } from "@difracta/client";
import type { Mask, Output, Surface, Table } from "@difracta/core";
import type { LiveState } from "@difracta/protocol";

import { useDocumentCommands } from "@/documents/document-commands";
import { useCalibration } from "@/lib/calibration";
import { useClient, useDocumentPath, useSignal } from "@/lib/client";
import { cn } from "@/lib/utils";

import { liveSessions, sessionList } from "@/entities/output/output-live";

/** Bottom strip: runtime connection, save state, outputs and blackout at a glance. */
export function StatusStrip() {
  const client = useClient();
  const phase = useSignal(client.phase);
  const { selected, view, revert } = useDocumentCommands();
  const connected = phase === "connected";

  return (
    <footer className="flex h-6 shrink-0 items-center gap-3 border-t bg-sidebar px-2 text-[0.6875rem] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            connected ? "bg-emerald-400" : "bg-amber-400",
          )}
        />
        {connected ? `Connected to ${location.host}` : `Runtime ${phase}`}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {selected?.recovered === true ? (
          <span className="text-amber-400">
            Recovered unsaved changes from an autosave. Save keeps them, or{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={revert}
            >
              revert to the file as saved
            </button>
            .
          </span>
        ) : selected === undefined ? null : selected.dirty ? (
          "Unsaved changes"
        ) : (
          "Saved"
        )}
      </span>
      {view !== undefined && <DocumentStatus view={view} />}
    </footer>
  );
}

function DocumentStatus({ view }: { readonly view: DocumentView }) {
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]) ?? {};
  const live = useDocumentPath<LiveState["outputs"]>(view, ["live", "outputs"]);
  const blackout =
    useDocumentPath<boolean>(view, ["operational", "blackout"]) ?? false;
  const count = Object.keys(outputs).length;
  const connected = Object.keys(outputs).filter(
    (id) => liveSessions(sessionList(live?.[id]?.sessions)).length > 0,
  ).length;
  return (
    <>
      <span title="Outputs with at least one Output Session reporting">
        {String(connected)} of {String(count)}{" "}
        {count === 1 ? "Output" : "Outputs"} connected
      </span>
      <CalibrationStatus view={view} />
      {blackout && (
        <span className="rounded-sm bg-destructive px-1.5 font-semibold tracking-wider text-white uppercase">
          Blackout
        </span>
      )}
    </>
  );
}

/** A forgotten Calibration Mode would leave a pattern on stage; it stays visible here with its exit. */
function CalibrationStatus({ view }: { readonly view: DocumentView }) {
  const { calibration, exit } = useCalibration(view);
  const surfaces = useDocumentPath<Table<Surface>>(view, ["surfaces"]);
  const masks = useDocumentPath<Table<Mask>>(view, ["masks"]);
  const outputs = useDocumentPath<Table<Output>>(view, ["outputs"]);
  if (calibration === null) return null;
  // Same checks as the Output makes: a stale entry shows nothing.
  const surface = surfaces?.[calibration.surfaceId];
  if (surface?.output == null) return null;
  const mask =
    calibration.maskId === null ? undefined : masks?.[calibration.maskId];
  if (calibration.maskId !== null && mask?.surfaceId !== surface.id)
    return null;
  const output = outputs?.[surface.output]?.name ?? surface.output;
  return (
    <span className="flex items-center gap-1.5 rounded-sm bg-amber-500/20 px-1.5 text-amber-300">
      Calibrating {mask?.name ?? surface.name} on {output}
      <button
        type="button"
        className="underline underline-offset-2 hover:text-amber-100"
        onClick={exit}
      >
        exit
      </button>
    </span>
  );
}
