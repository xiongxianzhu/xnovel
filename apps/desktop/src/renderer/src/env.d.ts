import type { XnovelDesktopApi } from "../../shared/contracts";

declare global {
  interface Window {
    xnovelDesktop: XnovelDesktopApi;
  }
}

export {};
