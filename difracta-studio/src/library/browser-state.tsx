import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface BrowserState {
  /** The Visual or Filter Layer the Library is picking for; undefined while closed. */
  readonly bound: string | undefined;
  /** The browse was opened by creating the bound Layer, so Escape can remove it. */
  readonly created: boolean;
  /** Binds the Library to a Layer; `created` when creating it opened the browse. */
  readonly open: (
    layerId: string,
    options?: { readonly created?: boolean },
  ) => void;
  readonly close: () => void;
}

const Context = createContext<BrowserState | undefined>(undefined);

/** Studio-local: which Layer the Library in the center column is bound to. Resets with the document. */
export function BrowserProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [binding, setBinding] = useState<{
    readonly bound: string | undefined;
    readonly created: boolean;
  }>({ bound: undefined, created: false });
  const state = useMemo<BrowserState>(
    () => ({
      ...binding,
      open: (layerId, options) =>
        setBinding((previous) =>
          previous.bound === layerId && options?.created !== true
            ? previous
            : { bound: layerId, created: options?.created === true },
        ),
      close: () => setBinding({ bound: undefined, created: false }),
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
