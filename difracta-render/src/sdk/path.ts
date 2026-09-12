import type { Path, PathRequirement, Point } from "@difracta/core";

/** What a Path is to a Visual: its Surface Space points and whether it closes. */
export type PathShape = Pick<Path, "points" | "closed">;

/** A place on a Path with the direction of travel there, in pixels. */
export interface PathSample {
  readonly x: number;
  readonly y: number;
  /** Unit tangent, from the first point toward the last. */
  readonly tx: number;
  readonly ty: number;
}

/** Which way off the Path: its sides by travel, or by the Path's centre. */
export type PathSide = "a" | "b" | "outward" | "inward";

/**
 * A Path in the Visual's pixels. Sampling is by fraction of the total
 * length, so a Visual that spreads things evenly along it gets even spacing
 * whatever the segments measure. Side A is the left of travel and Side B
 * the right, as the Glossary defines them; `outward` and `inward` resolve
 * against the centroid, so a frame drawn clockwise or counterclockwise
 * emits the same way.
 */
export interface PathGeometry {
  readonly points: readonly Point[];
  readonly closed: boolean;
  /** Total length in pixels, along every segment. */
  readonly length: number;
  /** The place `t` of the way along, from 0 at the first point to 1 at the end. */
  at(t: number): PathSample;
  /** Unit vector leaving the Path at `sample` on the given side. */
  side(sample: PathSample, side: PathSide): Point;
}

/** Points per Path a shader receives; a Path never has more. */
export const PATH_UNIFORM_POINTS = 16;

/** The pixel geometry of a Path shape drawn in a canvas `width` by `height`. */
export function pathGeometry(
  shape: PathShape,
  width: number,
  height: number,
): PathGeometry {
  const points = shape.points.map((point) => ({
    x: point.x * width,
    y: point.y * height,
  }));
  const segments = shape.closed ? points.length : points.length - 1;
  const lengths: number[] = [];
  let length = 0;
  for (let index = 0; index < segments; index += 1) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    const size =
      from === undefined || to === undefined
        ? 0
        : Math.hypot(to.x - from.x, to.y - from.y);
    lengths.push(size);
    length += size;
  }
  const centroid = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  centroid.x /= Math.max(1, points.length);
  centroid.y /= Math.max(1, points.length);
  const first = points[0] ?? { x: width / 2, y: height / 2 };
  return {
    points,
    closed: shape.closed,
    length,
    at(t) {
      let distance = Math.min(Math.max(0, t), 1) * length;
      for (let index = 0; index < lengths.length; index += 1) {
        const size = lengths[index] ?? 0;
        const from = points[index];
        const to = points[(index + 1) % points.length];
        if (from === undefined || to === undefined) continue;
        if (distance <= size || index === lengths.length - 1) {
          const tx = size > 0 ? (to.x - from.x) / size : 1;
          const ty = size > 0 ? (to.y - from.y) / size : 0;
          const along = Math.min(distance, size);
          return { x: from.x + tx * along, y: from.y + ty * along, tx, ty };
        }
        distance -= size;
      }
      return { x: first.x, y: first.y, tx: 1, ty: 0 };
    },
    side(sample, side) {
      // Left of travel with y down is the tangent turned counterclockwise on screen.
      const left = { x: sample.ty, y: -sample.tx };
      if (side === "a") return left;
      if (side === "b") return { x: -left.x, y: -left.y };
      const away =
        left.x * (sample.x - centroid.x) + left.y * (sample.y - centroid.y) >=
        0;
      const outward = away ? left : { x: -left.x, y: -left.y };
      return side === "outward" ? outward : { x: -outward.x, y: -outward.y };
    },
  };
}

/**
 * The uniforms a shader Visual reads each Path through, declared by the
 * engine ahead of the fragment: `u_path_<key>_points[16]` in Surface Space,
 * `u_path_<key>_count` and `u_path_<key>_closed`.
 */
export function pathDeclarations(
  requirements: readonly PathRequirement[] | undefined,
): string {
  return (requirements ?? [])
    .map(
      ({ key }) =>
        `uniform vec2 u_path_${key}_points[${String(PATH_UNIFORM_POINTS)}];\nuniform int u_path_${key}_count;\nuniform bool u_path_${key}_closed;`,
    )
    .join("\n");
}

/** The Path's points packed for `uniform2fv`, unused slots left at zero. */
export function pathUniformPoints(shape: PathShape): Float32Array {
  const values = new Float32Array(PATH_UNIFORM_POINTS * 2);
  shape.points.slice(0, PATH_UNIFORM_POINTS).forEach((point, index) => {
    values[index * 2] = point.x;
    values[index * 2 + 1] = point.y;
  });
  return values;
}

/** Path shapes by key, as the document holds them. */
export type PathShapes = Readonly<Record<string, PathShape>>;

export interface PathTracker {
  /**
   * The geometry for the current shapes at the canvas size, rebuilt only
   * for a key whose shape object or size changed; `changed` says whether
   * any did, which counts as a change for the instance.
   */
  resolve(
    shapes: PathShapes,
    width: number,
    height: number,
  ): {
    readonly paths: Readonly<Record<string, PathGeometry>>;
    readonly changed: boolean;
  };
}

/** Keeps a Visual instance's Path geometry across frames (the document is immutable per revision, so identity is exact). */
export function pathTracker(): PathTracker {
  const cache = new Map<
    string,
    {
      readonly shape: PathShape;
      readonly width: number;
      readonly height: number;
      readonly geometry: PathGeometry;
    }
  >();
  return {
    resolve(shapes, width, height) {
      let changed = false;
      const paths: Record<string, PathGeometry> = {};
      for (const [key, shape] of Object.entries(shapes)) {
        const entry = cache.get(key);
        if (
          entry?.shape === shape &&
          entry.width === width &&
          entry.height === height
        ) {
          paths[key] = entry.geometry;
          continue;
        }
        changed = true;
        const geometry = pathGeometry(shape, width, height);
        cache.set(key, { shape, width, height, geometry });
        paths[key] = geometry;
      }
      for (const key of cache.keys())
        if (!(key in shapes)) {
          cache.delete(key);
          changed = true;
        }
      return { paths, changed };
    },
  };
}
