import { settings } from "@difracta/core";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface RuntimeConfig {
  readonly host: string;
  readonly port: number;
  /** Where `.difracta` files live; relative paths in requests resolve here. */
  readonly projectsDir: string;
  /** Files to open at startup. The runtime opens nothing else. */
  readonly openPaths: readonly string[];
  readonly studioDist: string | undefined;
  readonly outputDist: string | undefined;
  readonly autosaveIntervalMs: number;
}

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export function configFromEnvironment(
  argv: readonly string[] = process.argv.slice(2),
): RuntimeConfig {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      "projects-dir": { type: "string" },
    },
  });
  const env = process.env;
  return {
    host: values.host ?? env.DIFRACTA_HOST ?? settings.runtime.host,
    port: Number.parseInt(
      values.port ?? env.DIFRACTA_PORT ?? String(settings.runtime.port),
      10,
    ),
    projectsDir: path.resolve(
      values["projects-dir"] ??
        env.DIFRACTA_PROJECTS_DIR ??
        path.join(homedir(), "Difracta"),
    ),
    openPaths: positionals.map((candidate) => path.resolve(candidate)),
    studioDist:
      env.DIFRACTA_STUDIO_DIST ??
      path.join(packageRoot, "difracta-studio", "dist"),
    outputDist:
      env.DIFRACTA_OUTPUT_DIST ??
      path.join(packageRoot, "difracta-output", "dist"),
    autosaveIntervalMs: settings.autosave.delayMs,
  };
}
