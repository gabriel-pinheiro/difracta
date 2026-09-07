/**
 * A Patch is the unit of change. Commands return patches, the runtime applies
 * them, replicates them as deltas, and stores their inverses for undo. Paths
 * address a value inside the Document: `["installation", "name"]`,
 * `["outputs", outputId]`, `["outputs", outputId, "name"]`.
 */
export type PatchPath = readonly string[];

export type Patch =
  | { readonly op: "set"; readonly path: PatchPath; readonly value: unknown }
  | { readonly op: "remove"; readonly path: PatchPath };

type Node = Readonly<Record<string, unknown>>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getAtPath(root: unknown, path: PatchPath): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!isNode(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function setAtPath(node: unknown, path: PatchPath, value: unknown): unknown {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  const base: Node = isNode(node) ? node : {};
  return { ...base, [head]: setAtPath(base[head], rest, value) };
}

function removeAtPath(node: unknown, path: PatchPath): unknown {
  const [head, ...rest] = path;
  if (head === undefined || !isNode(node)) return node;
  if (rest.length === 0) {
    if (!(head in node)) return node;
    const { [head]: _removed, ...remaining } = node;
    return remaining;
  }
  if (!(head in node)) return node;
  return { ...node, [head]: removeAtPath(node[head], rest) };
}

export function applyPatch<TDocument>(
  document: TDocument,
  patch: Patch,
): TDocument {
  if (patch.path.length === 0) {
    throw new Error("A patch path must not be empty.");
  }
  return (
    patch.op === "set"
      ? setAtPath(document, patch.path, patch.value)
      : removeAtPath(document, patch.path)
  ) as TDocument;
}

export function applyPatches<TDocument>(
  document: TDocument,
  patches: readonly Patch[],
): TDocument {
  return patches.reduce(applyPatch, document);
}

/** The patch that undoes `patch` when applied to `document`'s successor. */
export function invertPatch(document: unknown, patch: Patch): Patch {
  const previous = getAtPath(document, patch.path);
  return previous === undefined
    ? { op: "remove", path: patch.path }
    : { op: "set", path: patch.path, value: previous };
}

/**
 * Inverse of an ordered patch list. Each inverse is computed against the
 * document as it was right before its patch, and the list is reversed so
 * applying it restores the original document.
 */
export function invertPatches(
  document: unknown,
  patches: readonly Patch[],
): Patch[] {
  const inverses: Patch[] = [];
  let current = document;
  for (const patch of patches) {
    inverses.push(invertPatch(current, patch));
    current = applyPatch(current, patch);
  }
  return inverses.reverse();
}

/** True when one path is the other or an ancestor of it. */
export function pathsOverlap(first: PatchPath, second: PatchPath): boolean {
  const length = Math.min(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

export function patchesOverlap(
  first: readonly Patch[],
  second: readonly Patch[],
): boolean {
  return first.some((a) => second.some((b) => pathsOverlap(a.path, b.path)));
}
