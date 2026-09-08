import type { DocumentView } from "@difracta/client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inspector } from "@/inspector/inspector";
import { readStored, writeStored } from "@/lib/storage";
import { Navigator } from "@/navigator/navigator";
import { CalibrationFollowsSelection } from "@/lib/calibration-follows-selection";
import { ExpansionProvider } from "@/navigator/expansion";
import { SelectionProvider } from "@/selection/selection";
import { SelectionKeys } from "@/selection/selection-keys";

import { OutputsTab } from "./outputs-tab";

const LAYOUT_KEY = "difracta.workspace.layout";

const isLayout = (candidate: unknown): candidate is Record<string, number> =>
  typeof candidate === "object" &&
  candidate !== null &&
  Object.values(candidate).every((value) => typeof value === "number");

/**
 * Navigator, center tabs and inspector as three resizable columns. Column
 * sizes are remembered per browser; selection and which rows are open reset
 * with the document.
 */
export function Workspace({ view }: { readonly view: DocumentView }) {
  return (
    <SelectionProvider key={view.documentId}>
      <ExpansionProvider>
        <SelectionKeys />
        <CalibrationFollowsSelection view={view} />
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={readStored(LAYOUT_KEY, undefined, isLayout)}
          onLayoutChanged={(layout) => writeStored(LAYOUT_KEY, layout)}
        >
          <ResizablePanel id="navigator" defaultSize={256} minSize={208}>
            <Navigator view={view} />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="center" minSize={320}>
            <Tabs defaultValue="outputs" className="flex h-full flex-col gap-0">
              <TabsList
                variant="line"
                className="h-7 w-full shrink-0 justify-start rounded-none border-b px-2"
              >
                <TabsTrigger value="outputs" className="flex-none">
                  Outputs
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="outputs"
                className="min-h-0 flex-1 overflow-auto"
              >
                <OutputsTab view={view} />
              </TabsContent>
            </Tabs>
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="inspector" defaultSize={288} minSize={256}>
            <Inspector view={view} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ExpansionProvider>
    </SelectionProvider>
  );
}
