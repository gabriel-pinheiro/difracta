import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../index.css";
import { launchBridge } from "./launch-bridge";
import { LaunchPage } from "./launch-page";

/**
 * Difracta Desktop's launch page: a second entry of this package, so it shares
 * Studio's components and theme, and nothing else. It imports no client, no
 * app shell and no Visuals; all it can do goes through the bridge Desktop
 * hands it, and without that bridge (any browser) it says what it is.
 */
const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Launch page root element is missing.");

const bridge = launchBridge();
createRoot(root).render(
  <StrictMode>
    {bridge === undefined ? (
      <p className="grid h-screen place-items-center text-muted-foreground">
        This page is part of Difracta Desktop.
      </p>
    ) : (
      <LaunchPage bridge={bridge} />
    )}
  </StrictMode>,
);
