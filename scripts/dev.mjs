// Runs the runtime, the Output dev server, and the Studio dev server together.
// The runtime is pinned to research/dev.difracta, which it creates when
// missing; DIFRACTA_FILE names another file, relative to the repository root.
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
// Workspace scripts run inside their package, so the path goes down absolute.
const file = path.resolve(
  root,
  process.env.DIFRACTA_FILE || "research/dev.difracta",
);

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const workspaces = [
  "@difracta/runtime",
  "@difracta/output",
  "@difracta/studio",
];
const children = workspaces.map((workspace) =>
  spawn(npm, ["run", "dev", `--workspace=${workspace}`], {
    stdio: "inherit",
    env: { ...process.env, DIFRACTA_FILE: file },
    detached: process.platform !== "win32",
  }),
);

let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    try {
      if (process.platform !== "win32" && child.pid !== undefined) {
        process.kill(-child.pid, signal);
      } else {
        child.kill(signal);
      }
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

for (const child of children) {
  child.once("exit", (code, signal) => {
    if (stopping) return;
    process.exitCode = code ?? (signal === null ? 0 : 1);
    stop();
  });
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
