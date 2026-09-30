import { DifractaClient } from "@difracta/client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { shareBridge, type DifractaShare } from "./share-bridge";
import { ShareInstallation } from "./share-installation";
import { SharePage } from "./share-page";
import {
  browserCodecs,
  browserConnectionId,
  browserPeer,
} from "./share-sending";
import { stopEverything } from "./share-stopping";
import { Sharer } from "./sharer";

/**
 * Difracta Desktop's share window: a third entry of this package, which
 * shares Studio's components and theme and none of its application code. It
 * is the Sharer: over a connection of its own to the runtime Desktop names
 * it declares its shares, reads the Installation's Screen Shares and adds
 * one, and it holds the captures and the peer connections. What needs the
 * operating system goes through the bridge Desktop hands it, and without
 * that bridge (any browser) it says what it is.
 */
const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Share window root element is missing.");
const page = createRoot(root);

async function start(bridge: DifractaShare): Promise<void> {
  const context = await bridge.context();
  const client = new DifractaClient({
    url: context.liveUrl,
    kind: "desktop",
    name: "Difracta Desktop share window",
    actor: context.actor,
  });
  const sharer = new Sharer({
    client: client.sharing,
    name: context.sharer,
    sending: {
      createPeer: browserPeer,
      codecs: browserCodecs,
      connectionId: browserConnectionId,
    },
  });
  const installation = new ShareInstallation(client, sharer);

  // Desktop hides this window while it shares, and asks before quitting.
  let stopping = false;
  sharer.shares.subscribe((shares) => {
    if (!stopping) bridge.report(shares.length);
  });
  bridge.onStopAll(() => {
    stopping = true;
    void stopEverything(sharer, installation, context.sharer).then(() =>
      bridge.report(0),
    );
  });

  page.render(
    <StrictMode>
      <SharePage
        bridge={bridge}
        context={context}
        client={client}
        sharer={sharer}
        installation={installation}
      />
    </StrictMode>,
  );
}

const bridge = shareBridge();
if (bridge === undefined)
  page.render(
    <p className="grid h-screen place-items-center text-muted-foreground">
      This page is part of Difracta Desktop.
    </p>,
  );
else
  void start(bridge).catch((error: unknown) => {
    page.render(
      <p role="alert" className="p-6 text-xs text-destructive">
        The share window could not start:{" "}
        {error instanceof Error ? error.message : String(error)}
      </p>,
    );
  });
