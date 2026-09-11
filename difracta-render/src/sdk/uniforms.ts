/**
 * What a shader instance hands its fragment each frame, by name; the engine
 * sets `u_<name>` from the value's shape. Numbers are floats and pairs to
 * quadruples are vectors; booleans are bools. A `Float32Array` is an array
 * of floats, and `vec2s`, `vec3s`, `vec4s` make arrays of vectors, for a
 * fragment that reads several live events at once through a fixed-size
 * `uniform vec2 u_points[N]`.
 */
export interface UniformArray {
  readonly size: 2 | 3 | 4;
  readonly values: Float32Array;
}

export type UniformValue =
  | number
  | boolean
  | readonly [number, number]
  | readonly [number, number, number]
  | readonly [number, number, number, number]
  | Float32Array
  | UniformArray;

export type Uniforms = Readonly<Record<string, UniformValue>>;

function flatten(size: 2 | 3 | 4, list: readonly (readonly number[])[]) {
  const values = new Float32Array(list.length * size);
  list.forEach((vector, index) =>
    values.set(vector.slice(0, size), index * size),
  );
  return { size, values };
}

export const vec2s = (
  list: readonly (readonly [number, number])[],
): UniformArray => flatten(2, list);
export const vec3s = (
  list: readonly (readonly [number, number, number])[],
): UniformArray => flatten(3, list);
export const vec4s = (
  list: readonly (readonly [number, number, number, number])[],
): UniformArray => flatten(4, list);
