import type { FileMediaType } from "@difracta/core";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Selection } from "@/selection/selection";

/**
 * The Library picking an image or video for one media Address: a Layer's
 * Parameter or a Macro action's value. Clicking a tile applies the entry at
 * once through `apply`, so the Outputs are the preview; Escape puts
 * `initial` back. The Library closes when the selection leaves `anchor`,
 * the Layer or Macro the Address belongs to.
 */
export interface ParameterBinding {
  readonly kind: "parameter";
  readonly address: string;
  /** The Address's label, "Image" or "Video", and who owns it, for the title. */
  readonly label: string;
  readonly owner?: string | undefined;
  readonly accepts: FileMediaType;
  /** The Media reference held when the Library opened. */
  readonly initial: string;
  readonly anchor: Selection | undefined;
  readonly apply: (reference: string) => void;
  /** A selector for the element that gets focus back when the Library closes. */
  readonly returnFocus?: string | undefined;
}

/** What the Library in the center column is picking for, or browsing. */
export type LibraryBinding =
  | {
      readonly kind: "layer";
      readonly id: string;
      /** Creating the Layer opened the browse, so Escape can remove it. */
      readonly created: boolean;
    }
  /**
   * Browsing one Pack's entries; clicking a tile selects the entry, so the
   * inspector shows it, and sets nothing. `folder` scopes the grid to one
   * folder of the Pack when the browse opens from an entry's file path.
   */
  | {
      readonly kind: "pack";
      readonly packId: string;
      readonly folder?: string | undefined;
    }
  | ParameterBinding;

interface BrowserState {
  /** Undefined while the Library is closed. */
  readonly binding: LibraryBinding | undefined;
  /** Binds the Library to a Visual or Filter Layer; `created` when creating it opened the browse. */
  readonly open: (
    layerId: string,
    options?: { readonly created?: boolean },
  ) => void;
  /** Binds the Library to a Pack to browse; with a `folder`, scoped to it, every time. */
  readonly openPack: (
    packId: string,
    options?: { readonly folder?: string | undefined },
  ) => void;
  readonly openParameter: (binding: Omit<ParameterBinding, "kind">) => void;
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
      openPack: (packId, options) =>
        setBinding((previous) =>
          previous?.kind === "pack" &&
          previous.packId === packId &&
          options?.folder === undefined
            ? previous
            : { kind: "pack", packId, folder: options?.folder },
        ),
      openParameter: (parameter) =>
        setBinding({ kind: "parameter", ...parameter }),
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
