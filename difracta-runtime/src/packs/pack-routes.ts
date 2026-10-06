import { settings } from "@difracta/core";
import type { FastifyInstance, FastifyReply } from "fastify";

import {
  entryFile,
  fail,
  proxyFile,
  thumbnailFile,
  type StoreOutcome,
} from "./pack-files.ts";
import type { PackStore } from "./pack-store.ts";
import { sendFile, statFile, type RangeHeaders } from "./send-file.ts";

interface Params {
  readonly packId: string;
  readonly entryId: string;
}

/**
 * `GET /packs/<packId>/<entryId>` streams a Pack entry's original file
 * (`send-file.ts`: content type, ETag, `no-cache`, Range, any origin);
 * `/thumb` and `/proxy` under it stream what the runtime baked, `/proxy`
 * the proxy at the first size and `/proxy/<height>` the one of that
 * height. 404, naming the problem, for a Pack that is not loaded, an entry
 * the Pack lacks, a missing file and a thumbnail or proxy not baked.
 */
export function registerPackRoutes(
  app: FastifyInstance,
  store: PackStore,
): void {
  const prefix = `${settings.runtime.packsPath}/:packId/:entryId`;
  const serve = async (
    reply: FastifyReply,
    located: StoreOutcome<string>,
    headers: RangeHeaders,
  ): Promise<FastifyReply> => {
    if (!located.ok) return reply.status(404).send({ error: located.error });
    const info = await statFile(located.result);
    if (info === undefined)
      return reply.status(404).send({ error: `No file at ${located.result}.` });
    return sendFile(reply, located.result, info, headers);
  };
  app.get<{ Params: Params }>(prefix, (request, reply) =>
    serve(
      reply,
      entryFile(store.loaded(), request.params.packId, request.params.entryId),
      request.headers,
    ),
  );
  app.get<{ Params: Params }>(`${prefix}/thumb`, (request, reply) =>
    serve(
      reply,
      thumbnailFile(
        store.loaded(),
        request.params.packId,
        request.params.entryId,
      ),
      request.headers,
    ),
  );
  app.get<{ Params: Params }>(`${prefix}/proxy`, (request, reply) =>
    serve(
      reply,
      proxyFile(store.loaded(), request.params.packId, request.params.entryId),
      request.headers,
    ),
  );
  app.get<{ Params: Params & { readonly height: string } }>(
    `${prefix}/proxy/:height`,
    (request, reply) => {
      const { packId, entryId, height } = request.params;
      return serve(
        reply,
        /^[1-9]\d*$/.test(height)
          ? proxyFile(store.loaded(), packId, entryId, Number(height))
          : fail(`“${height}” is not a proxy height.`),
        request.headers,
      );
    },
  );
}
