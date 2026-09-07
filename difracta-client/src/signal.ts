/** A minimal observable value. Framework bindings subscribe to these. */
export interface ReadonlySignal<TValue> {
  get(): TValue;
  subscribe(listener: (value: TValue) => void): () => void;
}

export class Signal<TValue> implements ReadonlySignal<TValue> {
  #value: TValue;
  readonly #listeners = new Set<(value: TValue) => void>();

  constructor(initial: TValue) {
    this.#value = initial;
  }

  get(): TValue {
    return this.#value;
  }

  set(value: TValue): void {
    if (Object.is(value, this.#value)) return;
    this.#value = value;
    for (const listener of this.#listeners) listener(value);
  }

  subscribe(listener: (value: TValue) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
