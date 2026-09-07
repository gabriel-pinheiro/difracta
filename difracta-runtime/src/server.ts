import { createBuiltInRegistry, settings } from "@difracta/core";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { access } from "node:fs/promises";

import type { RuntimeConfig } from "./config.ts";
import { DocumentStore } from "./documents/document-store.ts";
import { LiveServer } from "./live/live-server.ts";

export const RUNTIME_VERSION = "0.0.0";

export interface Runtime {
  readonly app: FastifyInstance;
  readonly store: DocumentStore;
  listen(): Promise<string>;
  close(): Promise<void>;
}

async function existingDir(
  candidate: string | undefined,
): Promise<string | undefined> {
  if (candidate === undefined) return undefined;
  try {
    await access(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

export async function buildRuntime(
  config: RuntimeConfig,
  options: { readonly logger?: boolean } = {},
): Promise<Runtime> {
  const app = Fastify({ logger: options.logger ?? false });
  const log = (message: string): void => {
    app.log.warn(message);
  };
  const store = new DocumentStore({
    projectsDir: config.projectsDir,
    registry: createBuiltInRegistry(),
    autosaveIntervalMs: config.autosaveIntervalMs,
    log,
  });
  const live = new LiveServer({
    store,
    runtimeName: "Difracta Runtime",
    runtimeVersion: RUNTIME_VERSION,
    log,
  });

  await app.register(fastifyWebsocket);
  app.get("/health", () => ({
    name: "Difracta Runtime",
    version: RUNTIME_VERSION,
    document: store.current()?.name ?? null,
  }));
  app.get(settings.runtime.livePath, { websocket: true }, (socket) => {
    live.accept(socket);
  });

  const studioDist = await existingDir(config.studioDist);
  if (studioDist !== undefined) {
    await app.register(fastifyStatic, {
      root: studioDist,
      prefix: "/studio/",
      decorateReply: true,
    });
    app.get("/", (_request, reply) => reply.redirect("/studio/"));
  }
  const outputDist = await existingDir(config.outputDist);
  if (outputDist !== undefined) {
    await app.register(fastifyStatic, {
      root: outputDist,
      prefix: "/output/",
      decorateReply: false,
    });
  }

  return {
    app,
    store,
    async listen() {
      if (config.openPath !== undefined) {
        const opened = await store.open(config.openPath);
        if (!opened.ok) log(`Skipping ${config.openPath}: ${opened.error}`);
        else if (opened.result.recovered)
          log(
            `Recovered unsaved changes for ${config.openPath} from its autosave.`,
          );
      }
      return app.listen({ host: config.host, port: config.port });
    },
    async close() {
      live.close();
      await store.flush();
      await app.close();
    },
  };
}
