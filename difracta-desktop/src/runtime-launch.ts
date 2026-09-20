import { settings } from "@difracta/core";
import path from "node:path";

/** Where the built pieces the runtime serves sit; `scripts/build.mjs` puts them next to `main.js`. */
export interface RuntimeLocations {
  /** The bundled runtime, one JavaScript file. */
  readonly script: string;
  readonly studioDist: string;
  readonly outputDist: string;
  readonly thumbnailsDir: string;
}

export function runtimeLocations(distDir: string): RuntimeLocations {
  return {
    script: path.join(distDir, "runtime.mjs"),
    studioDist: path.join(distDir, "studio"),
    outputDist: path.join(distDir, "output"),
    thumbnailsDir: path.join(distDir, "thumbnails"),
  };
}

/** `DIFRACTA_PORT` moves Desktop's runtime off the default port, as it does a standalone one. */
export function runtimePort(env: NodeJS.ProcessEnv): number {
  const port = Number.parseInt(env.DIFRACTA_PORT ?? "", 10);
  return Number.isInteger(port) && port > 0 && port < 65_536
    ? port
    : settings.runtime.port;
}

/**
 * The runtime's command line. `free` lets this machine's Studio create, open
 * and save Installations anywhere. Every interface, not loopback: Output pages
 * on TVs and other machines attach to this runtime too.
 */
export function runtimeArguments(options: {
  readonly port: number;
  readonly file: string | undefined;
}): string[] {
  return [
    "--documents",
    "free",
    "--host",
    settings.runtime.host,
    "--port",
    String(options.port),
    ...(options.file === undefined ? [] : [options.file]),
  ];
}

/**
 * The runtime's environment: Desktop's own, plus where the built Studio,
 * Output page and thumbnails are. The bundled runtime cannot find them
 * relative to its source files the way a checkout does. Desktop decides the
 * file, host and port on the command line, so their variables do not travel.
 */
export function runtimeEnvironment(
  base: NodeJS.ProcessEnv,
  locations: RuntimeLocations,
): Record<string, string> {
  const { DIFRACTA_FILE, DIFRACTA_HOST, DIFRACTA_PORT, ...inherited } = base;
  const defined = Object.entries(inherited).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return {
    ...Object.fromEntries(defined),
    DIFRACTA_STUDIO_DIST: locations.studioDist,
    DIFRACTA_OUTPUT_DIST: locations.outputDist,
    DIFRACTA_THUMBNAILS_DIR: locations.thumbnailsDir,
  };
}
