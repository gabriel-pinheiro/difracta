import { useEffect, useState } from "react";

import { menuBridge } from "./menu-bridge";

/**
 * Whether Studio draws its own bar. In a browser, always. In Difracta Desktop
 * the native menu bar replaces it, except while the window is full screen:
 * Windows and Linux hide the native bar there, and a menu nobody can reach is
 * worse than two looks.
 */
export function useInPageBar(): boolean {
  const bridge = menuBridge();
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => bridge?.onFullScreenChange(setFullScreen), [bridge]);
  return bridge === undefined || fullScreen;
}
