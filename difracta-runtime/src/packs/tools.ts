import { access } from "node:fs/promises";
import path from "node:path";

/** The ffmpeg and ffprobe executables the baker runs. */
export interface BakeTools {
  readonly ffmpeg: string;
  readonly ffprobe: string;
}

export interface ToolEnvironment {
  readonly PATH?: string | undefined;
  readonly Path?: string | undefined;
  readonly DIFRACTA_FFMPEG?: string | undefined;
  readonly DIFRACTA_FFPROBE?: string | undefined;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** The first `<dir>/<name>` on `PATH` that exists, `.exe` added on Windows. */
async function onPath(
  name: string,
  env: ToolEnvironment,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  const list = env.PATH ?? env.Path ?? "";
  const file = platform === "win32" ? `${name}.exe` : name;
  for (const dir of list.split(path.delimiter)) {
    if (dir === "") continue;
    const candidate = path.join(dir, file);
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

/**
 * Where ffmpeg and ffprobe are: `DIFRACTA_FFMPEG` and `DIFRACTA_FFPROBE`,
 * else the first on `PATH`. Undefined when either is missing: the runtime
 * then loads Packs without baking and says so in their live state.
 */
export async function locateTools(
  env: ToolEnvironment = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<BakeTools | undefined> {
  const named = async (variable: string | undefined, name: string) =>
    variable !== undefined && variable.trim() !== ""
      ? (await exists(variable))
        ? variable
        : undefined
      : onPath(name, env, platform);
  const ffmpeg = await named(env.DIFRACTA_FFMPEG, "ffmpeg");
  const ffprobe = await named(env.DIFRACTA_FFPROBE, "ffprobe");
  return ffmpeg === undefined || ffprobe === undefined
    ? undefined
    : { ffmpeg, ffprobe };
}
