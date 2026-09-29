import type { DocumentView } from "@difracta/client";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Inspector } from "@/inspector/inspector";
import { readStored, writeStored } from "@/lib/storage";
import { Navigator } from "@/navigator/navigator";
import { CalibrationFollowsSelection } from "@/lib/calibration-follows-selection";
import { BrowserProvider } from "@/library/browser-state";
import { ExpansionProvider } from "@/navigator/expansion";
import { SelectionKeys } from "@/selection/selection-keys";
import { NavigatorKeys } from "@/keyboard/navigator-keys";

import { Center } from "./center";

const LAYOUT_KEY = "difracta.workspace.layout";

const isLayout = (candidate: unknown): candidate is Record<string, number> =>
  typeof candidate === "object" &&
  candidate !== null &&
  Object.values(candidate).every((value) => typeof value === "number");

/**
 * Navigator, center and inspector as three resizable columns. Column sizes
 * are remembered per browser; which rows are open and the Library's binding
 * reset with the document, as the selection (held in `App`) does.
 */
export function Workspace({ view }: { readonly view: DocumentView }) {
  return (
    <ExpansionProvider key={view.documentId}>
      <BrowserProvider>
        <SelectionKeys />
        <NavigatorKeys />
        <CalibrationFollowsSelection view={view} />
        <Columns view={view} />
      </BrowserProvider>
    </ExpansionProvider>
  );
}

function Columns({ view }: { readonly view: DocumentView }) {
  return (
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
        <Center view={view} />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="inspector" defaultSize={288} minSize={256}>
        <Inspector view={view} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
