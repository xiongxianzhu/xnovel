import { createContext } from "react";

export type EditorLeaveGuard = {
  isBlocked: () => boolean;
  save: () => Promise<boolean>;
  stash: () => void;
};

export type EditorNavigationContextValue = {
  blocked: boolean;
  registerGuard: (guard: EditorLeaveGuard) => () => void;
  setBlocked: (blocked: boolean) => void;
  requestDocumentChange: () => Promise<boolean>;
};

export const EditorNavigationContext =
  createContext<EditorNavigationContextValue | null>(null);
