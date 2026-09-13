/**
 * A command's payload schema as a field list a person or an agent reads at
 * a glance: one line per field with its type, whether it is required, its
 * default, and the shapes it nests. `--json describe` prints the JSON
 * Schema itself; this is the human side.
 */
interface JsonSchema {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: JsonSchema | boolean;
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly items?: JsonSchema | false;
  readonly prefixItems?: readonly JsonSchema[];
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly default?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly description?: string;
}

const isColor = (schema: JsonSchema): boolean =>
  schema.prefixItems?.length === 4 &&
  schema.prefixItems.every(
    (item) =>
      item.type === "number" && item.minimum === 0 && item.maximum === 1,
  );

/** The type as it would be typed: `string | null`, `"visual" | "group"`, `[r, g, b, a]`, `{<key>: number}`. */
export function schemaType(schema: JsonSchema): string {
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum !== undefined)
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives !== undefined)
    return alternatives.map(schemaType).join(" | ");
  if (schema.type === "array") {
    if (isColor(schema)) return "[r, g, b, a]";
    if (schema.prefixItems !== undefined)
      return `[${schema.prefixItems.map(schemaType).join(", ")}]`;
    if (schema.items === undefined || schema.items === false) return "array";
    const alternatives = schema.items.anyOf ?? schema.items.oneOf;
    return alternatives?.every((item) => item.properties !== undefined)
      ? "object[]"
      : `${schemaType(schema.items)}[]`;
  }
  if (schema.type === "object") {
    if (schema.properties !== undefined) return "object";
    if (typeof schema.additionalProperties === "object")
      return `{<key>: ${schemaType(schema.additionalProperties)}}`;
    return "object";
  }
  if (
    (schema.type === "number" || schema.type === "integer") &&
    (schema.minimum !== undefined || schema.maximum !== undefined)
  )
    return `${schema.type} ${schema.minimum ?? "…"}..${schema.maximum ?? "…"}`;
  if (Array.isArray(schema.type)) return schema.type.join(" | ");
  return typeof schema.type === "string" ? schema.type : "any";
}

/** The object shapes a field nests, through alternatives and array items. */
function nestedObjects(schema: JsonSchema): readonly JsonSchema[] {
  if (schema.properties !== undefined) return [schema];
  const alternatives = schema.anyOf ?? schema.oneOf;
  if (alternatives !== undefined) return alternatives.flatMap(nestedObjects);
  if (schema.type === "array" && schema.items !== undefined && schema.items)
    return nestedObjects(schema.items);
  return [];
}

/** One object's fields, one per line, required ones starred; nested objects follow indented. */
export function formatSchema(schema: JsonSchema, indent = ""): string[] {
  const required = new Set(schema.required ?? []);
  const lines: string[] = [];
  for (const [name, field] of Object.entries(schema.properties ?? {})) {
    const parts = [
      `${indent}${name}${required.has(name) ? "*" : ""}`,
      schemaType(field),
    ];
    if (field.default !== undefined)
      parts.push(`(default ${JSON.stringify(field.default)})`);
    if (field.description !== undefined) parts.push(field.description);
    lines.push(parts.join("  "));
    const nested = nestedObjects(field);
    if (nested.length === 1 && nested[0] !== undefined)
      lines.push(...formatSchema(nested[0], `${indent}  `));
    else
      for (const shape of nested)
        lines.push(
          `${indent}  · ${Object.entries(shape.properties ?? {})
            .map(
              ([key, value]) =>
                `${key}${(shape.required ?? []).includes(key) ? "*" : ""}: ${schemaType(value)}`,
            )
            .join("  ")}`,
        );
  }
  return lines;
}
