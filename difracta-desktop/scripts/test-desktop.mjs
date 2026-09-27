// Runs the Desktop suite: `vitest run --config e2e/vitest.config.ts [args]`.
// On Linux it runs under Xvfb when `xvfb-run` is there, so the windows stay
// off the person's screen and the suite finds the one Display it counts on;
// `DIFRACTA_DESKTOP_HEADED=1` keeps it on the real display, and so does a run
// already inside `xvfb-run`.
import { spawn, spawnSync } from "node:child_process";

const vitest = [
  "vitest",
  "run",
  "--config",
  "e2e/vitest.config.ts",
  ...process.argv.slice(2),
];

function underXvfb() {
  if (process.platform !== "linux") return false;
  if (process.env.DIFRACTA_DESKTOP_HEADED === "1") return false;
  if (process.env.XAUTHORITY?.includes("xvfb-run") === true) return false;
  return spawnSync("which", ["xvfb-run"]).status === 0;
}

const [command, args] = underXvfb()
  ? ["xvfb-run", ["-a", "npx", ...vitest]]
  : ["npx", vitest];
const child = spawn(command, args, { stdio: "inherit" });
child.once("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
