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
  /** The file to open at startup, if any. The runtime opens nothing else. */
  readonly openPath: string | undefined;
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
  if (positionals.length > 1)
    throw new Error(
      "A runtime holds one Installation; pass at most one .difracta file.",
    );
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
    openPath:
      positionals[0] === undefined ? undefined : path.resolve(positionals[0]),
    studioDist:
      env.DIFRACTA_STUDIO_DIST ??
      path.join(packageRoot, "difracta-studio", "dist"),
    outputDist:
      env.DIFRACTA_OUTPUT_DIST ??
      path.join(packageRoot, "difracta-output", "dist"),
    autosaveIntervalMs: settings.autosave.delayMs,
  };
}
