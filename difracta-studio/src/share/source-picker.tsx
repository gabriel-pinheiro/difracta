import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  DifractaShare,
  ShareSourceChoice,
  ShareSourceKind,
} from "./share-bridge";

/** One kind's sources: undefined while the operating system lists them. */
type Listed = readonly ShareSourceChoice[] | undefined;

const HEADINGS: Record<ShareSourceKind, string> = {
  window: "Windows",
  screen: "Screens",
};

function Sources({
  kind,
  sources,
  busy,
  onChoose,
}: {
  readonly kind: ShareSourceKind;
  readonly sources: Listed;
  readonly busy: boolean;
  readonly onChoose: (source: ShareSourceChoice) => void;
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">
        {HEADINGS[kind]}
      </h3>
      {sources === undefined ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3.5 animate-spin" />
          Looking…
        </p>
      ) : sources.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {kind === "window" ? "No window to share." : "No screen to share."}
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2" aria-label={HEADINGS[kind]}>
          {sources.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                disabled={busy}
                data-testid={`share-source-${kind}`}
                className="grid w-full gap-1 rounded-md border p-1.5 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
                onClick={() => onChoose(source)}
              >
                {source.thumbnail === null ? (
                  <span className="aspect-video w-full rounded-sm bg-black" />
                ) : (
                  <img
                    src={source.thumbnail}
                    alt=""
                    className="aspect-video w-full rounded-sm bg-black object-contain"
                  />
                )}
                <span className="truncate text-xs">{source.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The share window's own picker, for a system without one: this computer's
 * windows, then its screens, each with its picture and name. The two are
 * asked for apart, so the screens do not wait for the windows, which can
 * take seconds to list. The names are shown here and sent nowhere.
 */
export function SourcePicker({
  bridge,
  busy,
  onChoose,
}: {
  readonly bridge: DifractaShare;
  /** A capture is starting. */
  readonly busy: boolean;
  readonly onChoose: (source: ShareSourceChoice) => void;
}) {
  const [windows, setWindows] = useState<Listed>();
  const [screens, setScreens] = useState<Listed>();

  useEffect(() => {
    let current = true;
    const list = (
      kind: ShareSourceKind,
      listed: (sources: Listed) => void,
    ): void => {
      void bridge.sources(kind).then(
        (sources) => current && listed(sources),
        () => current && listed([]),
      );
    };
    list("screen", setScreens);
    list("window", setWindows);
    return () => {
      current = false;
    };
  }, [bridge]);

  return (
    <div className="grid gap-4" data-testid="share-picker">
      <Sources
        kind="window"
        sources={windows}
        busy={busy}
        onChoose={onChoose}
      />
      <Sources
        kind="screen"
        sources={screens}
        busy={busy}
        onChoose={onChoose}
      />
    </div>
  );
}
