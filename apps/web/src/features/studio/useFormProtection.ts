import { useContext, useEffect, useRef } from "react";
import { EditorNavigationContext } from "../editor/EditorNavigationContext";

export function useFormProtection(
  dirty: boolean | (() => boolean),
  save: () => Promise<boolean>,
  stash: () => void,
) {
  const navigation = useContext(EditorNavigationContext);
  const registerGuard = navigation?.registerGuard;
  const state = useRef({ dirty, save, stash });
  useEffect(() => {
    state.current = { dirty, save, stash };
  }, [dirty, save, stash]);
  useEffect(
    () =>
      registerGuard?.({
        kind: "form",
        isBlocked: () =>
          typeof state.current.dirty === "function"
            ? state.current.dirty()
            : state.current.dirty,
        save: () => state.current.save(),
        stash: () => state.current.stash(),
      }),
    [registerGuard],
  );
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !(typeof state.current.dirty === "function"
          ? state.current.dirty()
          : state.current.dirty)
      )
        return;
      state.current.stash();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
}
