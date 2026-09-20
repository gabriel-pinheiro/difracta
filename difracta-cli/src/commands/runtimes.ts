import { browseRuntimes } from "@difracta/client/discovery";
import { settings } from "@difracta/core";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { formatRuntimes } from "../discovery.ts";

export function registerRuntimes(program: Command, cli: Cli): void {
  program
    .command("runtimes")
    .description(
      "List the runtimes announcing themselves on the local network (Zeroconf, _difracta._tcp), this machine's included: name, address:port to pass to --url, host, version, open Installation. Needs no runtime URL.",
    )
    .action(async () => {
      const listenMs = settings.discovery.browseMs;
      const runtimes = await browseRuntimes(listenMs);
      cli.print(runtimes, () => formatRuntimes(runtimes, listenMs));
    });
}
