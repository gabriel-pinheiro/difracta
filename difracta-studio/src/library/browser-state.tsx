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
  readonly open: (layerId: string) => void;
  readonly close: () => void;
}

const Context = createContext<BrowserState | undefined>(undefined);

/** Studio-local: which Layer the Library in the center column is bound to. Resets with the document. */
export function BrowserProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [bound, setBound] = useState<string | undefined>(undefined);
  const state = useMemo<BrowserState>(
    () => ({
      bound,
      open: (layerId) => setBound(layerId),
      close: () => setBound(undefined),
    }),
    [bound],
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useBrowser(): BrowserState {
  const state = useContext(Context);
  if (state === undefined)
    throw new Error("useBrowser needs a BrowserProvider.");
  return state;
}
