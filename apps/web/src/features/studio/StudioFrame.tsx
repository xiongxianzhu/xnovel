import type { ReactNode } from "react";
import { Alert, Button, Skeleton } from "antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./studio.css";

export function StudioFrame({
  title,
  back,
  actions,
  children,
}: {
  title: string;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation("studio");
  return (
    <main className="studio-page">
      <header className="studio-heading">
        <div>
          {back ? <Link to={back}>{t("back")}</Link> : null}
          <h1>{title}</h1>
        </div>
        <div className="studio-actions">{actions}</div>
      </header>
      {children}
    </main>
  );
}

export function StudioLoading() {
  return <Skeleton active paragraph={{ rows: 4 }} />;
}
export function StudioError({ retry }: { retry?: () => void }) {
  const { t } = useTranslation("studio");
  return (
    <Alert
      type="error"
      showIcon
      title={t("requestFailed")}
      action={
        retry ? <Button onClick={retry}>{t("common:retry")}</Button> : undefined
      }
    />
  );
}

export function SourceLabel({
  stale,
  missing,
  manual,
}: {
  stale?: boolean;
  missing?: boolean;
  manual?: boolean;
}) {
  const { t } = useTranslation("studio");
  return (
    <span
      className={stale ? "studio-state studio-state-warning" : "studio-state"}
    >
      {t(
        missing ? "missing" : stale ? "stale" : manual ? "manual" : "verified",
      )}
    </span>
  );
}

export function DraftNotice({
  onRestore,
  onDiscard,
}: {
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation("studio");
  return (
    <Alert
      type="info"
      title={t("draft")}
      action={
        <div className="studio-actions">
          <Button onClick={onRestore}>{t("restore")}</Button>
          <Button onClick={onDiscard}>{t("delete")}</Button>
        </div>
      }
    />
  );
}
