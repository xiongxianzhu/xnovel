import { useContext } from "react";

import { EditorNavigationContext } from "./EditorNavigationContext";

export function useEditorNavigation() {
  const context = useContext(EditorNavigationContext);
  if (!context) {
    throw new Error(
      "useEditorNavigation must be used within EditorNavigationProvider",
    );
  }
  return context;
}
