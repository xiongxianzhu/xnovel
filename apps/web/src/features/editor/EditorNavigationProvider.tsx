import { Alert, Button, Modal } from "antd";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import {
  EditorNavigationContext,
  type EditorLeaveGuard,
} from "./EditorNavigationContext";

type PendingDecision = {
  resolve: (allowed: boolean) => void;
};

export function EditorNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { t } = useTranslation(["common", "projects"]);
  const guardRef = useRef<EditorLeaveGuard | null>(null);
  const decisionPendingRef = useRef(false);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const registerGuard = useCallback((guard: EditorLeaveGuard) => {
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) {
        guardRef.current = null;
        setBlocked(false);
      }
    };
  }, []);

  const requestDocumentChange = useCallback(async () => {
    const guard = guardRef.current;
    if (!guard?.isBlocked()) return true;
    if (decisionPendingRef.current) return false;
    decisionPendingRef.current = true;
    return new Promise<boolean>((resolve) => {
      setError(null);
      setPending({ resolve });
    });
  }, []);

  const value = useMemo(
    () => ({ blocked, registerGuard, requestDocumentChange, setBlocked }),
    [blocked, registerGuard, requestDocumentChange],
  );

  function finish(allowed: boolean) {
    pending?.resolve(allowed);
    decisionPendingRef.current = false;
    setPending(null);
    setError(null);
  }

  async function saveAndContinue() {
    const guard = guardRef.current;
    if (!guard) {
      finish(true);
      return;
    }
    setSaving(true);
    const saved = await guard.save();
    setSaving(false);
    if (saved) finish(true);
    else setError(t("projects:saveBeforeSwitchFailed"));
  }

  return (
    <EditorNavigationContext.Provider value={value}>
      {children}
      <Modal
        closable={!saving}
        footer={null}
        onCancel={() => finish(false)}
        open={Boolean(pending)}
        title={t("projects:unsavedChangesTitle")}
      >
        <div className="document-confirm-dialog">
          <p>{t("projects:unsavedChangesDescription")}</p>
          {error ? <Alert showIcon title={error} type="error" /> : null}
          <div className="document-dialog-actions document-switch-actions">
            <Button disabled={saving} onClick={() => finish(false)}>
              {t("projects:stayHere")}
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                guardRef.current?.stash();
                finish(true);
              }}
            >
              {t("projects:stashAndSwitch")}
            </Button>
            <Button
              loading={saving}
              onClick={() => void saveAndContinue()}
              type="primary"
            >
              {t("projects:saveAndSwitch")}
            </Button>
          </div>
        </div>
      </Modal>
    </EditorNavigationContext.Provider>
  );
}
