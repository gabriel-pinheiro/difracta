import { homedir } from "node:os";
import path from "node:path";

/**
 * Where the runtime keeps what is the machine's and not the Installation's:
 * the Registry in the user's config folder, and a Pack's baked files in the
 * cache folder when the Pack's own `.difracta/` cannot be written. Each
 * follows the platform's convention; an environment variable moves it, which
 * Docker and tests use.
 */
export interface DirEnvironment {
  readonly XDG_CONFIG_HOME?: string | undefined;
  readonly XDG_CACHE_HOME?: string | undefined;
  readonly APPDATA?: string | undefined;
  readonly LOCALAPPDATA?: string | undefined;
  readonly DIFRACTA_PACKS_FILE?: string | undefined;
  readonly DIFRACTA_CACHE_DIR?: string | undefined;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/** The user's config folder: `$XDG_CONFIG_HOME` or `~/.config`, `~/Library/Application Support`, `%APPDATA%`. */
export function userConfigDir(
  env: DirEnvironment,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (platform === "win32")
    return nonEmpty(env.APPDATA) ?? path.join(home, "AppData", "Roaming");
  if (platform === "darwin")
    return path.join(home, "Library", "Application Support");
  return nonEmpty(env.XDG_CONFIG_HOME) ?? path.join(home, ".config");
}

/** The user's cache folder: `$XDG_CACHE_HOME` or `~/.cache`, `~/Library/Caches`, `%LOCALAPPDATA%`. */
export function userCacheDir(
  env: DirEnvironment,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  if (platform === "win32")
    return nonEmpty(env.LOCALAPPDATA) ?? path.join(home, "AppData", "Local");
  if (platform === "darwin") return path.join(home, "Library", "Caches");
  return nonEmpty(env.XDG_CACHE_HOME) ?? path.join(home, ".cache");
}

/** The Registry's file: `DIFRACTA_PACKS_FILE`, else `<config>/difracta/packs.json`. */
export function registryFile(
  env: DirEnvironment,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  return (
    nonEmpty(env.DIFRACTA_PACKS_FILE) ??
    path.join(userConfigDir(env, platform, home), "difracta", "packs.json")
  );
}

/** Where Packs whose folder cannot be written keep their baked files: `DIFRACTA_CACHE_DIR`, else `<cache>/difracta/packs`. */
export function packsCacheDir(
  env: DirEnvironment,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  return (
    nonEmpty(env.DIFRACTA_CACHE_DIR) ??
    path.join(userCacheDir(env, platform, home), "difracta", "packs")
  );
}
