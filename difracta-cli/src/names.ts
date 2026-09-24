import { CommandError } from "@difracta/client";
import {
  sameName,
  TABLE_SCHEMAS,
  type Document,
  type TableName,
} from "@difracta/core";

/**
 * Names stand in for ids at the CLI boundary: an Address segment or a
 * payload field that names an entity may carry its name instead of its id.
 * An existing id always wins; otherwise the name must match exactly one
 * entity of the table, compared the way the document keeps names unique
 * (ignoring case and surrounding whitespace). The runtime and the domain
 * never see names: what leaves here is ids.
 */
const NOUNS: Record<TableName, string> = {
  outputs: "Output",
  surfaces: "Surface",
  masks: "Mask",
  paths: "Path",
  scenes: "Scene",
  layers: "Layer",
  controllers: "Controller",
  links: "Link",
  macros: "Macro",
};

/** Address heads whose next segment names an entity. */
const ADDRESS_TABLES: Readonly<Record<string, TableName>> = {
  layer: "layers",
  scene: "scenes",
  controller: "controllers",
  macro: "macros",
  surface: "surfaces",
};

/** Payload keys that hold one entity id, and which table it belongs to. */
const KEY_TABLES: Readonly<Record<string, TableName>> = {
  outputId: "outputs",
  output: "outputs",
  surfaceId: "surfaces",
  target: "surfaces",
  maskId: "masks",
  pathId: "paths",
  sceneId: "scenes",
  layerId: "layers",
  controllerId: "controllers",
  macroId: "macros",
  linkId: "links",
};

/** `parentId` and `after` belong to the table the command's prefix names. */
const PREFIX_TABLES: Readonly<Record<string, TableName>> = {
  layer: "layers",
  controller: "controllers",
  macro: "macros",
};

interface Named {
  readonly id: string;
  readonly name?: string;
}

function isTable(text: string): text is TableName {
  return text in TABLE_SCHEMAS;
}

/** Where a same-named entity lives, to tell candidates apart. */
function whereabouts(
  document: Document,
  table: TableName,
  entity: Named,
): string | undefined {
  const record = entity as unknown as Record<string, unknown>;
  if (table === "layers") {
    const scene = document.scenes[String(record.sceneId)];
    return scene === undefined ? undefined : `in Scene ${scene.name}`;
  }
  if (table === "masks" || table === "paths") {
    const surface = document.surfaces[String(record.surfaceId)];
    return surface === undefined ? undefined : `on Surface ${surface.name}`;
  }
  if (typeof record.parentId === "string") {
    const parent = (document[table] as Record<string, Named>)[record.parentId];
    return parent === undefined ? undefined : `in Group ${parent.name ?? ""}`;
  }
  return undefined;
}

/**
 * The id `text` names in `table`: itself when it is an id, the one entity
 * with that name, or undefined when nothing has it. Several entities with
 * the name are an error listing each with its id and where it lives.
 */
export function findId(
  document: Document,
  table: TableName,
  text: string,
): string | undefined {
  const entities = document[table] as Record<string, Named>;
  if (text in entities) return text;
  const matches = Object.values(entities).filter(
    (entity) => entity.name !== undefined && sameName(entity.name, text),
  );
  const [only] = matches;
  if (matches.length === 0 || only === undefined) return undefined;
  if (matches.length === 1) return only.id;
  const candidates = matches.map((entity) => {
    const where = whereabouts(document, table, entity);
    return `${entity.name ?? ""} (${entity.id}${where === undefined ? "" : `, ${where}`})`;
  });
  throw new Error(
    `“${text}” matches ${matches.length} ${NOUNS[table]}s: ${candidates.join(", ")}`,
  );
}

/** Like `findId`, but a name nothing carries is an error too. */
export function resolveId(
  document: Document,
  table: TableName,
  text: string,
): string {
  const id = findId(document, table, text);
  if (id === undefined)
    throw new Error(`No ${NOUNS[table]} is called or identified “${text}”.`);
  return id;
}

/** An Address with its entity segment turned into an id: `layer/Wash/opacity` → `layer/layer_…/opacity`. */
export function resolveAddressNames(
  document: Document,
  address: string,
): string {
  const segments = address.split("/");
  const [head, entity] = segments;
  const table = head === undefined ? undefined : ADDRESS_TABLES[head];
  if (table === undefined || entity === undefined || segments.length < 3)
    return address;
  return [head, resolveId(document, table, entity), ...segments.slice(2)].join(
    "/",
  );
}

/**
 * A document path such as `layers/Wash/opacity` with the name in its second
 * segment turned into an id. A segment naming nothing stays as typed, so the
 * caller reports the path the person asked for.
 */
export function resolvePathNames(document: Document, path: string): string {
  const segments = path.split("/");
  const [table, entity] = segments;
  if (table === undefined || entity === undefined || !isTable(table))
    return path;
  const id = findId(document, table, entity);
  return id === undefined ? path : [table, id, ...segments.slice(2)].join("/");
}

/**
 * A command payload with every entity reference turned into an id: the
 * `…Id` keys and `output`/`target`; `parentId` and `after` for the table the
 * command name says (or the payload's own `table`, as `entity.move` has);
 * `address`/`addresses`; lists such as `layerIds`; and objects inside arrays
 * (Macro actions) the same way.
 */
export function resolvePayloadNames(
  document: Document,
  command: string,
  payload: unknown,
): unknown {
  if (Array.isArray(payload))
    return payload.map((item) => resolvePayloadNames(document, command, item));
  if (typeof payload !== "object" || payload === null) return payload;
  const record = payload as Record<string, unknown>;
  const prefix = command.split(".")[0] ?? "";
  const own =
    typeof record.table === "string" && isTable(record.table)
      ? record.table
      : undefined;
  const siblings = PREFIX_TABLES[prefix] ?? own;
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    resolved[key] = resolveField(document, prefix, siblings, key, value);
  }
  return resolved;
}

/**
 * The table a key's value names: `parentId` and `after` are siblings of the
 * command's entity, `id` only for `entity.move` (a create's `id` is the new
 * one), the rest by the key alone.
 */
function fieldTable(
  prefix: string,
  siblings: TableName | undefined,
  key: string,
): TableName | undefined {
  if (key === "parentId" || key === "after") return siblings;
  if (key === "id") return prefix === "entity" ? siblings : undefined;
  return KEY_TABLES[key];
}

function resolveField(
  document: Document,
  prefix: string,
  siblings: TableName | undefined,
  key: string,
  value: unknown,
): unknown {
  const table = fieldTable(prefix, siblings, key);
  if (table !== undefined && typeof value === "string")
    return resolveId(document, table, value);
  if (key === "address" && typeof value === "string")
    return resolveAddressNames(document, value);
  if (key === "addresses" && Array.isArray(value))
    return (value as unknown[]).map((item) =>
      typeof item === "string" ? resolveAddressNames(document, item) : item,
    );
  const listTable = key.endsWith("Ids")
    ? KEY_TABLES[`${key.slice(0, -3)}Id`]
    : undefined;
  if (listTable !== undefined && Array.isArray(value))
    return (value as unknown[]).map((item) =>
      typeof item === "string" ? resolveId(document, listTable, item) : item,
    );
  if (Array.isArray(value))
    return resolvePayloadNames(document, `${prefix}.`, value);
  return value;
}

/**
 * An error about the resolved Address retold with the Address as the
 * person typed it, so a name stays a name in what they read back.
 */
export function inTypedTerms(
  error: unknown,
  resolved: string,
  typed: string,
): unknown {
  if (!(error instanceof Error) || resolved === typed) return error;
  const message = error.message.replaceAll(resolved, typed);
  return error instanceof CommandError
    ? new CommandError(message, error.issues)
    : new Error(message);
}
