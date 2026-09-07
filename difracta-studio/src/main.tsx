import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";
import { ClientProvider } from "./lib/client";
import "./index.css";

const root = document.querySelector<HTMLDivElement>("#root");
if (root === null) throw new Error("Studio root element is missing.");

createRoot(root).render(
  <StrictMode>
    <ClientProvider>
      <App />
    </ClientProvider>
  </StrictMode>,
);
