/**
 * A stand-in for a 2D context that records every call instead of drawing,
 * so a Visual's behaviour can be tested without a browser: where it drew,
 * how many times, with which colors.
 */
export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface RecordingContext {
  readonly context: CanvasRenderingContext2D;
  readonly calls: readonly RecordedCall[];
  callsTo(method: string): readonly RecordedCall[];
  clear(): void;
}

export function recordingContext(): RecordingContext {
  const calls: RecordedCall[] = [];
  const properties = new Map<string | symbol, unknown>();
  const proxy: object = new Proxy(
    {},
    {
      get(_target, property) {
        if (properties.has(property)) return properties.get(property);
        if (typeof property === "symbol") return undefined;
        return (...args: readonly unknown[]): object => {
          calls.push({ method: property, args });
          return proxy;
        };
      },
      set(_target, property, value: unknown) {
        properties.set(property, value);
        return true;
      },
    },
  );
  return {
    context: proxy as CanvasRenderingContext2D,
    calls,
    callsTo: (method) => calls.filter((call) => call.method === method),
    clear: () => {
      calls.length = 0;
    },
  };
}
