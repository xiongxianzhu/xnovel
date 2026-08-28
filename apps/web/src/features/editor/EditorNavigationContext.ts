import { createContext } from "react";

export type EditorLeaveGuard = {
  isBlocked: () => boolean;
  save: () => Promise<boolean>;
  stash: () => void;
};

export type EditorNavigationContextValue = {
  registerGuard: (guard: EditorLeaveGuard) => () => void;
  requestDocumentChange: () => Promise<boolean>;
};

export const EditorNavigationContext =
  createContext<EditorNavigationContextValue | null>(null);
