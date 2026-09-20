import { settings } from "@difracta/core";
import { Bonjour, type Service } from "bonjour-service";
import { hostname } from "node:os";

import {
  instanceName,
  type Announcer,
  type DiscoveryTxt,
} from "./advertisement.ts";

export interface BonjourAnnouncerOptions {
  /** The HTTP port the runtime listens on. */
  readonly port: number;
  readonly log: (message: string) => void;
}

/**
 * `_difracta._tcp` over Zeroconf. `bonjour-service` cannot change the TXT
 * record of a published service, so a new record means unpublishing and
 * publishing again: browsers see the runtime leave and come back at once.
 * The first publish probes for the name; the ones after it do not, the name
 * being ours already. Zeroconf errors are logged, never fatal.
 */
export class BonjourAnnouncer implements Announcer {
  readonly #options: BonjourAnnouncerOptions;
  #bonjour: Bonjour | undefined;
  #service: Service | undefined;
  #txt: DiscoveryTxt = {};
  #unpublishing = false;

  constructor(options: BonjourAnnouncerOptions) {
    this.#options = options;
    this.#bonjour = new Bonjour({}, (error: Error) => {
      options.log(`Zeroconf: ${error.message}`);
    });
  }

  announce(txt: DiscoveryTxt): void {
    this.#txt = txt;
    // The unpublish under way publishes the newest record when it is done.
    if (this.#unpublishing) return;
    const service = this.#service;
    if (service === undefined) {
      this.#publish(true);
      return;
    }
    this.#unpublishing = true;
    this.#service = undefined;
    // Typed as a bare function by the library: it takes the callback.
    (service.stop as (done: () => void) => void)(() => {
      this.#unpublishing = false;
      this.#publish(false);
    });
  }

  async close(): Promise<void> {
    const bonjour = this.#bonjour;
    this.#bonjour = undefined;
    this.#service = undefined;
    if (bonjour !== undefined)
      await new Promise<void>((resolve) => {
        bonjour.unpublishAll(() => {
          bonjour.destroy(() => resolve());
        });
      });
  }

  #publish(probe: boolean): void {
    if (this.#bonjour === undefined) return;
    try {
      this.#service = this.#bonjour.publish({
        name: instanceName(hostname(), this.#options.port),
        type: settings.discovery.serviceType,
        protocol: "tcp",
        port: this.#options.port,
        txt: { ...this.#txt },
        probe,
        disableIPv6: true,
      });
    } catch (error) {
      this.#options.log(`Zeroconf: ${String(error)}`);
    }
  }
}
