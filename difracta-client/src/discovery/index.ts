/**
 * `@difracta/client/discovery`: finding runtimes on the local network. Node
 * only (Zeroconf needs UDP sockets), so it is a subpath of its own and the
 * package's main entry, which browsers bundle, never imports it.
 */
export * from "./discovered-runtime.ts";
export * from "./runtime-browser.ts";
export * from "./runtime-list.ts";
