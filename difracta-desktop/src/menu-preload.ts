/**
 * The preload script of a Studio window showing a runtime elsewhere. It hands
 * that page `window.difractaMenu` and nothing more: no file pickers, no open
 * requests, which are `preload.ts`'s and stay with the runtime on this
 * computer. Bundled into one CommonJS file like the other preloads.
 */
import { exposeMenu } from "./menu-expose.ts";

exposeMenu();
