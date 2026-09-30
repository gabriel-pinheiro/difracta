import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { ClientProvider } from "./lib/client";
import { ShareViewerProvider } from "./lib/share-viewer";
import "./index.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Studio root element is missing.");

createRoot(root).render(
  <StrictMode>
    <ClientProvider>
      <ShareViewerProvider>
        <App />
      </ShareViewerProvider>
    </ClientProvider>
  </StrictMode>,
);
