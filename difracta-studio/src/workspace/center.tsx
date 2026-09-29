import type { DocumentView } from "@difracta/client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStoredState } from "@/lib/storage";
import { useBrowser } from "@/library/browser-state";
import { LibraryView } from "@/library/library-view";
import { PreviewTab } from "@/preview/preview-tab";

import { OutputsTab } from "./outputs-tab";

const TAB_KEY = "difracta.workspace.tab";
const SPLIT_KEY = "difracta.workspace.library-split";

const TABS = ["preview", "outputs"] as const;
type CenterTab = (typeof TABS)[number];

const isTab = (candidate: unknown): candidate is CenterTab =>
  (TABS as readonly unknown[]).includes(candidate);
const isShare = (candidate: unknown): candidate is number =>
  typeof candidate === "number" && candidate > 0 && candidate < 100;

/**
 * The center column: the Preview and the Outputs as tabs, the one last used
 * remembered per browser. An open Library takes the place of the Outputs,
 * and sits under the Preview, which stays as it is, when that is the tab:
 * picking applies at once, so every candidate shows in the Preview above.
 * The Preview stays mounted under the other tab too, where it renders
 * nothing, so coming back to it starts no Visual again.
 */
export function Center({ view }: { readonly view: DocumentView }) {
  const { binding } = useBrowser();
  const [tab, setTab] = useStoredState<CenterTab>(TAB_KEY, "preview", isTab);
  const [share, setShare] = useStoredState(SPLIT_KEY, 50, isShare);
  const library =
    binding === undefined ? undefined : (
      <LibraryView view={view} binding={binding} />
    );
  const split = library !== undefined && tab === "preview";
  return (
    <Tabs
      value={tab}
      onValueChange={(next: unknown) => {
        if (isTab(next)) setTab(next);
      }}
      className="flex h-full flex-col gap-0"
    >
      {library === undefined && (
        <TabsList
          variant="line"
          className="h-7 w-full shrink-0 justify-start rounded-none border-b px-2"
        >
          <TabsTrigger value="preview" className="flex-none">
            Preview
          </TabsTrigger>
          <TabsTrigger value="outputs" className="flex-none">
            Outputs
          </TabsTrigger>
        </TabsList>
      )}
      <ResizablePanelGroup
        orientation="vertical"
        className="min-h-0 flex-1"
        onLayoutChanged={(layout) => {
          const { library: taken } = layout;
          if (taken !== undefined && isShare(taken)) setShare(taken);
        }}
      >
        <ResizablePanel id="tabs" minSize={120}>
          <TabsContent value="preview" keepMounted className="h-full min-h-0">
            <PreviewTab view={view} active={tab === "preview"} />
          </TabsContent>
          <TabsContent value="outputs" className="h-full overflow-auto">
            {library ?? <OutputsTab view={view} />}
          </TabsContent>
        </ResizablePanel>
        {split && (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="library"
              defaultSize={`${String(share)}%`}
              minSize={200}
            >
              {library}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </Tabs>
  );
}
