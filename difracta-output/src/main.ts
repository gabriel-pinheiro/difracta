import { DifractaClient } from "@difracta/client";

import { OutputPage } from "./output-page.ts";
import "./output.css";

const canvas = document.querySelector<HTMLCanvasElement>("#frame");
const overlay = document.querySelector<HTMLDivElement>("#overlay");
if (canvas === null || overlay === null)
  throw new Error("Output page markup is missing.");

const params = new URLSearchParams(location.search);
const liveUrl =
  params.get("runtime") ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`;
const outputId = params.get("output");

const client = new DifractaClient({
  url: liveUrl,
  kind: "output",
  name: outputId ?? "picker",
});
new OutputPage({ client, canvas, overlay, outputId });
