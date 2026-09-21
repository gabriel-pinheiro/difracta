import type { DisplayActionResult, DisplayHostLive } from "@difracta/protocol";
import type { Command } from "commander";

import type { Cli } from "../cli.ts";
import { formatDisplayHosts } from "../display-hosts.ts";
import { resolveId } from "../names.ts";

export function registerDisplays(program: Command, cli: Cli): void {
  const displays = program
    .command("displays")
    .description(
      "Put Outputs on the Displays (physical screens) of the Display Hosts connected to the runtime, from any machine. A host is named by its id, or its name when only one has it; a Display by its id, or its label when only one of the host's has it.",
    );

  displays
    .command("list")
    .description(
      "List the connected Display Hosts (id, name) and under each its Displays: id, label, size and position, scale factor, primary or internal, and the Output it shows.",
    )
    .action(() =>
      cli.withClient(async (client) => {
        const hosts = await client.request<DisplayHostLive[]>(
          "displays.list",
          {},
        );
        const outputs = client.document.get()?.outputs ?? [];
        cli.print(hosts, () => formatDisplayHosts(hosts, outputs));
      }),
    );

  displays
    .command("show <host> <display> <output>")
    .description(
      "Ask a host to show an Output (id or name) on one of its Displays, replacing what that Display showed. Fails when the host is not connected, has no such Display, the Output is not in the open Installation, or the host does not answer.",
    )
    .action((host: string, display: string, output: string) =>
      cli.withDocument(async (client, summary) => {
        const { document } = await cli.replica(client, summary.id);
        const result = await client.request<DisplayActionResult>(
          "displays.show",
          { host, display, output: resolveId(document, "outputs", output) },
        );
        const name = document.outputs[result.output ?? ""]?.name ?? output;
        cli.print(
          result,
          () =>
            `Showing ${name} on Display ${result.display} of ${result.host}.`,
        );
      }),
    );

  displays
    .command("hide <host> <display>")
    .description("Ask a host to stop showing an Output on one of its Displays.")
    .action((host: string, display: string) =>
      cli.withClient(async (client) => {
        const result = await client.request<DisplayActionResult>(
          "displays.hide",
          { host, display },
        );
        cli.print(
          result,
          () => `Display ${result.display} of ${result.host} shows nothing.`,
        );
      }),
    );
}
