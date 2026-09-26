import type { MediaType } from "@difracta/core";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Selection } from "@/selection/selection";

/**
 * A media Parameter the Library is picking for through a new bundled item:
 * the Parameter already holds the item, so the Outputs show each pick.
 */
export interface ParameterBinding {
  /** The type the Parameter takes; the Library offers only entries of it. */
  readonly accepts: MediaType | undefined;
  /** What was selected when the browse began; the Library stays open while it is. */
  readonly anchor: Selection | undefined;
  /** Puts back the value the Parameter had before the browse, for Escape. */
  readonly restore: () => void;
  /** Where keyboard focus goes when the Library closes, as a selector. */
  readonly returnFocus?: string | undefined;
}

/** What the Library in the center column is picking for. */
export type LibraryBinding =
  | {
      readonly kind: "layer";
      readonly id: string;
      /** Creating the Layer opened the browse, so Escape can remove it. */
      readonly created: boolean;
    }
  | {
      readonly kind: "media";
      readonly id: string;
      /** Creating the bundled item opened the browse, so Escape can remove it. */
      readonly created: boolean;
      readonly parameter?: ParameterBinding | undefined;
    };

interface BrowserState {
  /** Undefined while the Library is closed. */
  readonly binding: LibraryBinding | undefined;
  /** Binds the Library to a Visual or Filter Layer; `created` when creating it opened the browse. */
  readonly open: (
    layerId: string,
    options?: { readonly created?: boolean },
  ) => void;
  /** Binds the Library to a bundled Media item. */
  readonly openMedia: (
    mediaId: string,
    options?: {
      readonly created?: boolean;
      readonly parameter?: ParameterBinding;
    },
  ) => void;
  readonly close: () => void;
}

const Context = createContext<BrowserState | undefined>(undefined);

/** Studio-local: what the Library in the center column is bound to. Resets with the document. */
export function BrowserProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [binding, setBinding] = useState<LibraryBinding | undefined>(undefined);
  const state = useMemo<BrowserState>(
    () => ({
      binding,
      open: (layerId, options) =>
        setBinding((previous) =>
          previous?.kind === "layer" &&
          previous.id === layerId &&
          options?.created !== true
            ? previous
            : {
                kind: "layer",
                id: layerId,
                created: options?.created === true,
              },
        ),
      openMedia: (mediaId, options) =>
        setBinding((previous) =>
          previous?.kind === "media" &&
          previous.id === mediaId &&
          options?.created !== true
            ? previous
            : {
                kind: "media",
                id: mediaId,
                created: options?.created === true,
                parameter: options?.parameter,
              },
        ),
      close: () => setBinding(undefined),
    }),
    [binding],
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useBrowser(): BrowserState {
  const state = useContext(Context);
  if (state === undefined)
    throw new Error("useBrowser needs a BrowserProvider.");
  return state;
}
