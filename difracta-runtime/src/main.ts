import { configFromEnvironment } from "./config.ts";
import { buildRuntime } from "./server.ts";

/** A start that cannot go on says why in one line, without a stack. */
function refuseToStart(error: unknown): never {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

let config: ReturnType<typeof configFromEnvironment>;
try {
  config = configFromEnvironment();
} catch (error) {
  refuseToStart(error);
}
const runtime = await buildRuntime(config, { logger: true });

async function shutdown(): Promise<void> {
  runtime.app.log.info("Stopping Difracta Runtime");
  await runtime.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

// Forked by Difracta Desktop (Electron's `utilityProcess`), the runtime has a
// port to its parent. Desktop asks for the stop there, because a signal never
// runs a handler on Windows; the port keeps the process alive, so it exits
// itself once everything is flushed.
interface ParentPort {
  on(event: "message", listener: (message: { data: unknown }) => void): void;
}
const { parentPort } = process as { parentPort?: ParentPort };
parentPort?.on("message", ({ data }) => {
  if (data === "shutdown") void shutdown().finally(() => process.exit(0));
});

// A runtime mid-show must not exit over a bug: log it and keep serving.
process.on("uncaughtException", (error) => {
  runtime.app.log.error(error, "Uncaught exception; the runtime keeps running");
});
process.on("unhandledRejection", (reason) => {
  runtime.app.log.error(
    { reason },
    "Unhandled rejection; the runtime keeps running",
  );
});

const address = await runtime.listen().catch(refuseToStart);
runtime.app.log.info(
  {
    documents: config.documents,
    document: runtime.store.current()?.name ?? null,
  },
  `Difracta Runtime listening at ${address}`,
);
