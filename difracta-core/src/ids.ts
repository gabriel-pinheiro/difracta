/**
 * Entity identities are strings branded by entity kind so a SurfaceId cannot
 * be passed where an OutputId is expected. Generated ids are
 * `<kind>_<12 hex>`; imported ids keep whatever text the file carried.
 */
export type Id<TKind extends string> = string & { readonly __kind: TKind };

export type InstallationId = Id<"installation">;
export type OutputId = Id<"output">;
export type SurfaceId = Id<"surface">;
export type MaskId = Id<"mask">;
export type SceneId = Id<"scene">;
export type LayerId = Id<"layer">;
export type SessionId = Id<"session">;
export type DocumentId = Id<"document">;

export function id<TKind extends string>(_kind: TKind, raw: string): Id<TKind> {
  return raw as Id<TKind>;
}

export function generateId<TKind extends string>(kind: TKind): Id<TKind> {
  const random = (
    globalThis as unknown as { crypto: { randomUUID(): string } }
  ).crypto
    .randomUUID()
    .replaceAll("-", "")
    .slice(0, 12);
  return `${kind}_${random}` as Id<TKind>;
}
