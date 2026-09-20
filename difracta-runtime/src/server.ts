import { createBuiltInRegistry, settings } from "@difracta/core";
import { builtInCatalog, thumbnailsRoot } from "@difracta/visuals";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { RuntimeConfig } from "./config.ts";
import { DocumentStore } from "./documents/document-store.ts";
import { LiveServer } from "./live/live-server.ts";
import { OscServer } from "./osc/osc-server.ts";

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
    registry: createBuiltInRegistry(builtInCatalog),
    autosaveIntervalMs: config.autosaveIntervalMs,
    log,
  });
  const osc =
    config.oscPort === undefined
      ? undefined
      : new OscServer({ store, port: config.oscPort, host: config.host, log });
  const live = new LiveServer({
    store,
    catalog: builtInCatalog,
    runtimeName: "Difracta Runtime",
    runtimeVersion: RUNTIME_VERSION,
    documents: config.documents,
    log,
    osc,
  });

  await app.register(fastifyWebsocket);
  app.get("/health", () => ({
    name: "Difracta Runtime",
    version: RUNTIME_VERSION,
    document: store.current()?.name ?? null,
    osc: osc?.state() ?? { port: null, listeners: 0 },
  }));
  app.get(settings.runtime.livePath, { websocket: true }, (socket, request) => {
    // The socket's own peer, not `request.ip`, which a proxy header can set.
    live.accept(socket, request.socket.remoteAddress);
  });

  // Thumbnails of the Catalog, one per definition, for Studio's browser.
  await app.register(fastifyStatic, {
    root: fileURLToPath(thumbnailsRoot),
    prefix: "/catalog/",
    decorateReply: false,
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
        const opened =
          config.documents === "pinned"
            ? await store.openOrCreate(config.openPath)
            : await store.open(config.openPath);
        // A pinned runtime with no document could never get one.
        if (!opened.ok && config.documents === "pinned")
          throw new Error(opened.error);
        if (!opened.ok) log(`Skipping ${config.openPath}: ${opened.error}`);
        else if (opened.result.recovered)
          log(
            `Recovered unsaved changes for ${config.openPath} from its autosave.`,
          );
      }
      const address = await app.listen({
        host: config.host,
        port: config.port,
      });
      if (osc !== undefined) {
        try {
          await osc.start();
        } catch (error) {
          log(`OSC is off: ${String(error)}`);
        }
      }
      return address;
    },
    async close() {
      live.close();
      await osc?.close();
      await store.flush();
      await app.close();
    },
  };
}
