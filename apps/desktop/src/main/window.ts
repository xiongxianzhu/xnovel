export function usesCustomWindowControls(platform: string): boolean {
  return platform === "win32";
}

export function windowChrome(platform: string): { frame: boolean } {
  return { frame: !usesCustomWindowControls(platform) };
}
