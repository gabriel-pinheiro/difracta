/**
 * What every player does with an instance that threw: the error is kept as
 * an `Error`, the instance is disposed without letting a second throw out,
 * and the player refuses to touch the instance again. The Output decides
 * what to show instead (nothing) and when to try again (with a new player).
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** Disposes a failed instance; a throw from its dispose is ignored. */
export function disposeQuietly(
  instance: { dispose?(): void } | undefined,
): void {
  try {
    instance?.dispose?.();
  } catch {
    // The instance already failed; its dispose failing too changes nothing.
  }
}
