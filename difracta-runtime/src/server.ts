import { createBuiltInRegistry, settings } from "@difracta/core";
import { builtInCatalog, thumbnailsRoot } from "@difracta/visuals";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { stat } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";

import type { RuntimeConfig } from "./config.ts";
import {
  reachableFromNetwork,
  RuntimeAdvertisement,
} from "./discovery/advertisement.ts";
import { BonjourAnnouncer } from "./discovery/bonjour-announcer.ts";
import { registerDocumentRoutes } from "./documents/document-routes.ts";
import { DocumentStore } from "./documents/document-store.ts";
import { registerMediaRoutes } from "./documents/media-routes.ts";
import { LiveServer } from "./live/live-server.ts";
import { OscServer } from "./osc/osc-server.ts";

export const RUNTIME_VERSION = "0.3.0";

export interface Runtime {
  readonly app: FastifyInstance;
  readonly store: DocumentStore;
  readonly live: LiveServer;
  listen(): Promise<string>;
  close(): Promise<void>;
}

async function existingDir(
  candidate: string | undefined,
): Promise<string | undefined> {
  if (candidate === undefined) return undefined;
  // `stat`, not `access`: packaged Desktop's Studio and Output page sit in
  // its asar archive, where Electron's fs finds them but its `access` reports
  // a folder as missing.
  try {
    return (await stat(candidate)).isDirectory() ? candidate : undefined;
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
    mediaAnywhere: config.mediaAnywhere,
    log,
    osc,
  });
  let advertisement: RuntimeAdvertisement | undefined;

  await app.register(fastifyWebsocket);
  app.get("/health", () => ({
    name: "Difracta Runtime",
    version: RUNTIME_VERSION,
    document: store.current()?.name ?? null,
    osc: osc?.state() ?? { port: null, listeners: 0 },
    discovery: advertisement !== undefined,
  }));
  app.get(settings.runtime.livePath, { websocket: true }, (socket, request) => {
    // The socket's own peer, not `request.ip`, which a proxy header can set.
    live.accept(socket, request.socket.remoteAddress);
  });
  registerDocumentRoutes(app, store);
  registerMediaRoutes(app, store, {
    allowOutsideShowFolder: config.mediaAnywhere,
  });

  // Thumbnails of the Catalog, one per definition, for Studio's browser.
  await app.register(fastifyStatic, {
    root: config.thumbnailsDir ?? fileURLToPath(thumbnailsRoot),
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
    live,
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
      // A runtime bound to loopback has nobody on the network to tell.
      if (config.discovery && reachableFromNetwork(config.host)) {
        const { port } = app.server.address() as AddressInfo;
        advertisement = new RuntimeAdvertisement({
          store,
          version: RUNTIME_VERSION,
          announcer: new BonjourAnnouncer({ port, log }),
        });
      }
      return address;
    },
    async close() {
      live.close();
      await osc?.close();
      await advertisement?.close();
      await store.flush();
      await app.close();
    },
  };
}
