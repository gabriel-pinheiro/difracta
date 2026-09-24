// Launches the built app: `electron <this package> [file.difracta]`. The
// `electron` package's default export is the path of the Electron binary it
// downloaded. Build first (`npm run desktop` at the root does both).
import electron from "electron";
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);

// Ubuntu 23.10 and later keep unprivileged programs from the user namespaces
// Chromium's sandbox is made of, unless an AppArmor profile allows them, and
// Electron out of node_modules has none. Chromium then falls back to its
// setuid helper, which npm cannot install as root, and aborts. Say what to do
// instead of leaving a crash dump; turning the sandbox off is the person's
// call, never this script's.
function sandboxBlocked() {
  if (process.platform !== "linux" || args.includes("--no-sandbox"))
    return false;
  try {
    const restricted = readFileSync(
      "/proc/sys/kernel/apparmor_restrict_unprivileged_userns",
      "utf8",
    );
    if (restricted.trim() !== "1") return false;
    const helper = statSync(
      path.join(path.dirname(electron), "chrome-sandbox"),
    );
    return !(helper.uid === 0 && (helper.mode & 0o4000) !== 0);
  } catch {
    return false;
  }
}
if (sandboxBlocked()) {
  const helper = path.join(path.dirname(electron), "chrome-sandbox");
  console.error(
    [
      "This Linux restricts unprivileged user namespaces, so Electron from",
      "node_modules cannot start Chromium's sandbox. Either give it the setuid",
      "helper, once per Electron install:",
      "",
      `  sudo chown root:root ${helper}`,
      `  sudo chmod 4755 ${helper}`,
      "",
      "or run this development build without the sandbox:",
      "",
      "  npm run desktop -- --no-sandbox",
    ].join("\n"),
  );
  process.exit(1);
}
// Linux: the app runs on X11 and, given a command line without the switch,
// would start itself again to get there (`src/ozone-platform.ts`), leaving
// this script waiting on a parent that exits at once. Said here, unless the
// person named a platform.
const platform =
  process.platform === "linux" &&
  !args.some((argument) => argument.startsWith("--ozone-platform"))
    ? ["--ozone-platform=x11"]
    : [];
const child = spawn(electron, [packageDir, ...platform, ...args], {
  stdio: "inherit",
  // npm runs a workspace script inside its package; a relative file on the
  // command line means relative to where the person typed it.
  cwd: process.env.INIT_CWD ?? process.cwd(),
});
child.once("exit", (code) => process.exit(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => child.kill(signal));
