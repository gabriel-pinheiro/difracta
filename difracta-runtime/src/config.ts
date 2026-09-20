import { settings } from "@difracta/core";
import { DocumentsModeSchema, type DocumentsMode } from "@difracta/protocol";
import { parseArgs } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface RuntimeConfig {
  readonly host: string;
  readonly port: number;
  /**
   * `pinned`: the runtime keeps `openPath` open and refuses new, open, close
   * and save to another path. `free`: loopback clients may do all of those;
   * any other peer is still treated as pinned.
   */
  readonly documents: DocumentsMode;
  /** The file to open at startup; a pinned runtime always has one and creates it when missing. */
  readonly openPath: string | undefined;
  readonly studioDist: string | undefined;
  readonly outputDist: string | undefined;
  /** The Catalog's thumbnails; undefined serves the ones inside `@difracta/visuals`. */
  readonly thumbnailsDir: string | undefined;
  readonly autosaveIntervalMs: number;
  /** OSC and OSCQuery port; undefined keeps the door closed. */
  readonly oscPort: number | undefined;
  /** Announce the runtime on the local network with Zeroconf; one bound to loopback never is. */
  readonly discovery: boolean;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value === "" ? undefined : value;
}

const packageRoot = fileURLToPath(new URL("../..", import.meta.url));

export function configFromEnvironment(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      documents: { type: "string" },
      "osc-port": { type: "string" },
      "no-osc": { type: "boolean" },
      "no-discovery": { type: "boolean" },
    },
  });
  if (positionals.length > 1)
    throw new Error(
      "A runtime holds one Installation; pass at most one .difracta file.",
    );
  const documents = DocumentsModeSchema.safeParse(
    values.documents ?? settings.runtime.documents,
  );
  if (!documents.success)
    throw new Error(
      `--documents takes "pinned" or "free", not “${String(values.documents)}”.`,
    );
  const file = positionals[0] ?? nonEmpty(env.DIFRACTA_FILE);
  if (documents.data === "pinned" && file === undefined)
    throw new Error(
      "Name the .difracta file to hold: difracta-runtime <file.difracta>, or set DIFRACTA_FILE. It is created when missing. Pass --documents free to start without one.",
    );
  return {
    host: values.host ?? env.DIFRACTA_HOST ?? settings.runtime.host,
    port: Number.parseInt(
      values.port ?? env.DIFRACTA_PORT ?? String(settings.runtime.port),
      10,
    ),
    documents: documents.data,
    openPath: file === undefined ? undefined : path.resolve(file),
    studioDist:
      env.DIFRACTA_STUDIO_DIST ??
      path.join(packageRoot, "difracta-studio", "dist"),
    outputDist:
      env.DIFRACTA_OUTPUT_DIST ??
      path.join(packageRoot, "difracta-output", "dist"),
    thumbnailsDir: nonEmpty(env.DIFRACTA_THUMBNAILS_DIR),
    autosaveIntervalMs: settings.autosave.delayMs,
    oscPort:
      values["no-osc"] === true || env.DIFRACTA_NO_OSC === "1"
        ? undefined
        : Number.parseInt(
            values["osc-port"] ??
              env.DIFRACTA_OSC_PORT ??
              String(settings.osc.port),
            10,
          ),
    discovery: !(
      values["no-discovery"] === true || env.DIFRACTA_NO_DISCOVERY === "1"
    ),
  };
}
