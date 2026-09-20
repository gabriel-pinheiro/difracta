/** A runtime Desktop connected to before, kept for the launch page. */
export interface RememberedRuntime {
  /** Where it was reached, `http://host:port`. */
  readonly origin: string;
  /** Its Zeroconf instance name when it was picked from the list; null for a typed address. */
  readonly name: string | null;
}

/**
 * The list with `runtime` first. An entry with the same origin, or with the
 * same announced name, is the same runtime (a name outlives the address DHCP
 * hands out) and is replaced; past `limit` the oldest drop off.
 */
export function rememberRuntime(
  remembered: readonly RememberedRuntime[],
  runtime: RememberedRuntime,
  limit: number,
): RememberedRuntime[] {
  const others = remembered.filter(
    (known) =>
      known.origin !== runtime.origin &&
      (runtime.name === null || known.name !== runtime.name),
  );
  return [runtime, ...others].slice(0, limit);
}

export function forgetRuntime(
  remembered: readonly RememberedRuntime[],
  origin: string,
): RememberedRuntime[] {
  return remembered.filter((known) => known.origin !== origin);
}
