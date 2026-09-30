import { SharedViewer } from "@difracta/render";
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { useClient } from "./client";

const ViewerContext = createContext<SharedViewer | undefined>(undefined);

/**
 * This Studio page's one Viewer of Screen Shares, over its connection's
 * `client.viewing`: the Preview's compositor, the crop editor and a slot's
 * inspector each take a claim on it, so a slot shown in all three is one
 * Viewer to its Sharer and one encode. It views a slot only while a claim
 * wants it, that is while a picture of it is on screen. It lives as long
 * as the page's client, which is the page's.
 */
export function ShareViewerProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const client = useClient();
  const viewer = useMemo(
    () => new SharedViewer({ signalling: client.viewing }),
    [client],
  );
  return (
    <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>
  );
}

export function useShareViewer(): SharedViewer {
  const viewer = useContext(ViewerContext);
  if (viewer === undefined)
    throw new Error("useShareViewer needs a ShareViewerProvider.");
  return viewer;
}
