import type { ClientKind, ShareDeclaration } from "@difracta/protocol";

/** What the runtime tells Sharers, Viewers and requesters about Screen Shares, in words a person can read. */
export const shareMessages = {
  noInstallation: "No Installation is open.",
  gone: (mediaId: string): string =>
    `No Screen Share “${mediaId}” in the open Installation.`,
  notAShare: (name: string): string =>
    `“${name}” is not a Screen Share; only a Media item of kind share can be shared into.`,
  notDesktop: (kind: ClientKind | undefined): string =>
    `Only a connection of kind “desktop” can share into a Screen Share; this one is “${kind ?? "?"}”.`,
  notShared: (name: string): string => `Nobody shares into “${name}”.`,
  stopped: "Another client stopped this share.",
  replaced: (by: ShareDeclaration, name: string): string =>
    `${by.sharer} shares into “${name}” now.`,
  takenMeanwhile: (name: string): string =>
    `Another Sharer shares into “${name}” now; it took the slot while this one was away.`,
  full: (name: string, max: number): string =>
    `“${name}” has ${String(max)} Viewers, the most a Screen Share takes.`,
} as const;
