import { DifractaClient } from "@difracta/client";
import { settings } from "@difracta/core";

import { OutputPage } from "./output-page.ts";
import { runtimeOrigin } from "./runtime-origin.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#frame");
const overlay = document.querySelector<HTMLDivElement>("#overlay");
if (canvas === null || overlay === null)
  throw new Error("Output page markup is missing.");

const params = new URLSearchParams(location.search);
const liveUrl =
  params.get("runtime") ??
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/live`;
const output = params.get("output");
const origin = runtimeOrigin(params.get("runtime"), location.origin);

const client = new DifractaClient({
  url: liveUrl,
  kind: "output",
  name: output ?? "picker",
});
new OutputPage({
  client,
  canvas,
  overlay,
  output,
  mediaUrl: (id) =>
    `${origin}${settings.runtime.mediaPath}/${encodeURIComponent(id)}`,
});
