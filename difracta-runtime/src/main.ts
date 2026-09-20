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
