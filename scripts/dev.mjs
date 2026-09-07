// Runs the runtime, the Output dev server, and the Studio dev server together.
import { spawn } from "node:child_process";
import process from "node:process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const workspaces = [
  "@difracta/runtime",
  "@difracta/output",
  "@difracta/studio",
];
const children = workspaces.map((workspace) =>
  spawn(npm, ["run", "dev", `--workspace=${workspace}`], {
    stdio: "inherit",
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
