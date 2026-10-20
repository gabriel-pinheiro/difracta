import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface SliceEditorState {
  /** The Output whose Slices the editor shows; undefined while it is closed. */
  readonly outputId: string | undefined;
  readonly open: (outputId: string) => void;
  readonly close: () => void;
}

const Context = createContext<SliceEditorState | undefined>(undefined);

/** Studio-local: which Output's Slice editor has the center column. Resets with the document. */
export function SliceEditorProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [outputId, setOutputId] = useState<string | undefined>(undefined);
  const state = useMemo<SliceEditorState>(
    () => ({
      outputId,
      open: setOutputId,
      close: () => setOutputId(undefined),
    }),
    [outputId],
  );
  return <Context.Provider value={state}>{children}</Context.Provider>;
}

export function useSliceEditor(): SliceEditorState {
  const state = useContext(Context);
  if (state === undefined)
    throw new Error("useSliceEditor needs a SliceEditorProvider.");
  return state;
}
