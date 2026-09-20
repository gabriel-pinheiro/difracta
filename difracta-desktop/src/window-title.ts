/** What of the open Installation the title shows; the document summary has all three. */
export interface TitleDocument {
  readonly name: string;
  readonly path: string | null;
  readonly dirty: boolean;
}

/** Where Studio comes from, which only main knows. */
export type TitleWhere =
  | {
      readonly kind: "local";
      /** `os.homedir()`, shown as `~`. */ readonly home: string;
    }
  | {
      readonly kind: "remote";
      /** `remoteLabel`: "stage-pc (10.0.0.5:4800)". */ readonly label: string;
    };

/** `file` with the home directory written `~`, as a shell would. */
function fromHome(file: string, home: string): string {
  const inside =
    home !== "" &&
    file.startsWith(home) &&
    ["/", "\\"].includes(file.charAt(home.length));
  return inside ? `~${file.slice(home.length)}` : file;
}

/**
 * The Studio window's title. In Desktop it stands in for the in-page bar's
 * middle: the Installation's name, then where it lives, which is its file on
 * this computer or the runtime it is open in elsewhere (its path is on that
 * machine's disk and says nothing here). `* ` in front means unsaved changes.
 * Plain ASCII, since window managers and task switchers draw it with
 * whatever font they have.
 *
 *   * Living - ~/shows/living.difracta - Difracta
 *   Untitled - Difracta
 *   Living - stage-pc (10.0.0.5:4800) - Difracta
 */
export function windowTitle(
  document: TitleDocument | null,
  where: TitleWhere,
): string {
  const place =
    where.kind === "remote"
      ? where.label
      : document?.path == null
        ? undefined
        : fromHome(document.path, where.home);
  const parts = [document?.name, place, "Difracta"].filter(
    (part) => part !== undefined,
  );
  return `${document?.dirty === true ? "* " : ""}${parts.join(" - ")}`;
}
