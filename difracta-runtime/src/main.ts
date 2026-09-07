import { configFromEnvironment } from "./config.ts";
import { buildRuntime } from "./server.ts";

const config = configFromEnvironment();
const runtime = await buildRuntime(config, { logger: true });

async function shutdown(): Promise<void> {
  runtime.app.log.info("Stopping Difracta Runtime");
  await runtime.close();
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

const address = await runtime.listen();
runtime.app.log.info(
  {
    projectsDir: config.projectsDir,
    documents: runtime.store.list().map((item) => item.name),
  },
  `Difracta Runtime listening at ${address}`,
);
