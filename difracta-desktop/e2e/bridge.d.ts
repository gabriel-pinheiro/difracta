import type { DifractaDesktop } from "../src/bridge-contract.ts";

declare global {
  interface Window {
    readonly difractaDesktop?: DifractaDesktop;
  }
}
