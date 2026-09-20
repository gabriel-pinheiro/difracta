import type { DifractaDesktop } from "../src/bridge-contract.ts";
import type { DifractaLaunch } from "../src/launch-contract.ts";
import type { DifractaMenu } from "../src/menu-contract.ts";

declare global {
  interface Window {
    readonly difractaDesktop?: DifractaDesktop;
    readonly difractaLaunch?: DifractaLaunch;
    readonly difractaMenu?: DifractaMenu;
  }
}
