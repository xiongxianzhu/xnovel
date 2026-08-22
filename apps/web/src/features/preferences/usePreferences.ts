import { useContext } from "react";

import { PreferenceContext } from "./PreferenceContext";

export function usePreferences() {
  const context = useContext(PreferenceContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferenceProvider");
  }
  return context;
}
