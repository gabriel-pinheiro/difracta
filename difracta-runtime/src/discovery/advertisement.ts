import { settings } from "@difracta/core";

import type { DocumentStore } from "../documents/document-store.ts";

/** The TXT record of `_difracta._tcp`: what a list of runtimes shows before connecting. */
export type DiscoveryTxt = Readonly<Record<string, string>>;

/** A TXT entry is one length-prefixed string, "key=value" in at most 255 bytes. */
const TXT_ENTRY_BYTES = 255;

/** `value` cut to `bytes` of UTF-8 without splitting a character. */
function truncated(value: string, bytes: number): string {
  let used = 0;
  let result = "";
  for (const character of value) {
    used += Buffer.byteLength(character);
    if (used > bytes) break;
    result += character;
  }
  return result;
}

/**
 * The runtime's version and the open Installation's name, which is left out
 * when nothing is open. Never the file's path: it would tell the network how
 * the machine's folders are laid out.
 */
export function discoveryTxt(
  version: string,
  documentName: string | undefined,
): DiscoveryTxt {
  const entry = (key: string, value: string): [string, string] => [
    key,
    truncated(value, TXT_ENTRY_BYTES - key.length - 1),
  ];
  return Object.fromEntries([
    entry("version", version),
    ...(documentName === undefined || documentName === ""
      ? []
      : [entry("document", documentName)]),
  ]);
}

/**
 * "Difracta on <hostname>", like the OSC door. A runtime on another port than
 * the default adds it, so two on one machine do not claim the same name.
 */
export function instanceName(host: string, port: number): string {
  const machine = host.replace(/\.local$/i, "");
  const suffix = port === settings.runtime.port ? "" : ` (${String(port)})`;
  return `${settings.discovery.name} on ${machine}${suffix}`;
}

/**
 * Whether a runtime listening on `host` can be reached from another machine.
 * One bound to loopback (127.0.0.0/8, `::1`, `localhost`) cannot, so
 * announcing it would list a runtime nobody on the network could open.
 */
export function reachableFromNetwork(host: string): boolean {
  const bare = host.toLowerCase().replace(/^\[|\]$/g, "");
  return !(
    bare === "localhost" ||
    bare === "::1" ||
    /^127(\.\d{1,3}){3}$/.test(bare) ||
    /^::ffff:127(\.\d{1,3}){3}$/.test(bare)
  );
}

/** Puts the service on the network; `bonjour-announcer.ts` is the real one. */
export interface Announcer {
  /** Announces the service with this TXT record, in place of what it announced before. */
  announce(txt: DiscoveryTxt): void;
  close(): Promise<void>;
}

export interface AdvertisementOptions {
  readonly store: DocumentStore;
  readonly version: string;
  readonly announcer: Announcer;
  /** Overrides `settings.discovery.txtUpdateDelayMs`. */
  readonly txtUpdateDelayMs?: number;
}

/**
 * Keeps the runtime's `_difracta._tcp` announcement in step with the open
 * document. The store reports every summary change, an Output or a save as
 * much as a rename, so the TXT record is compared and only a different one is
 * announced again, once, after the changes have been quiet for the delay.
 */
export class RuntimeAdvertisement {
  readonly #options: AdvertisementOptions;
  readonly #unsubscribeStore: () => void;
  #announced: string;
  #timer: NodeJS.Timeout | undefined;

  constructor(options: AdvertisementOptions) {
    this.#options = options;
    const txt = this.#txt();
    this.#announced = JSON.stringify(txt);
    options.announcer.announce(txt);
    this.#unsubscribeStore = options.store.onChange(() => this.#schedule());
  }

  async close(): Promise<void> {
    this.#unsubscribeStore();
    clearTimeout(this.#timer);
    this.#timer = undefined;
    await this.#options.announcer.close();
  }

  #txt(): DiscoveryTxt {
    return discoveryTxt(
      this.#options.version,
      this.#options.store.current()?.name,
    );
  }

  #schedule(): void {
    const pending = this.#timer !== undefined;
    if (!pending && JSON.stringify(this.#txt()) === this.#announced) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(
      () => this.#update(),
      this.#options.txtUpdateDelayMs ?? settings.discovery.txtUpdateDelayMs,
    );
    this.#timer.unref();
  }

  #update(): void {
    this.#timer = undefined;
    const txt = this.#txt();
    const next = JSON.stringify(txt);
    // Open then back again within the delay ends where it started.
    if (next === this.#announced) return;
    this.#announced = next;
    this.#options.announcer.announce(txt);
  }
}
