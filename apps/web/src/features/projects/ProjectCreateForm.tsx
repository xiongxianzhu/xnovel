import { Alert, Button, Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";

export function ProjectCreateForm({
  error,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  error: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (title: string) => Promise<void>;
}) {
  const { t } = useTranslation(["common", "projects"]);
  const [title, setTitle] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized) {
      setValidationError(t("projects:titleRequired"));
      return;
    }
    if (normalized.length > 200) {
      setValidationError(t("projects:titleTooLong"));
      return;
    }
    setValidationError(null);
    await onSubmit(normalized);
  }

  return (
    <form className="project-create-form" onSubmit={submit}>
      <div className="project-form-heading">
        <div>
          <h2>{t("projects:createTitle")}</h2>
          <p>{t("projects:createDescription")}</p>
        </div>
        <button
          aria-label={t("common:close")}
          className="plain-icon-button"
          onClick={onCancel}
          type="button"
        >
          ×
        </button>
      </div>
      {validationError || error ? (
        <Alert
          className="form-alert"
          showIcon
          title={validationError ?? error}
          type="error"
        />
      ) : null}
      <label htmlFor="project-title">{t("projects:title")}</label>
      <Input
        autoFocus
        id="project-title"
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("projects:titlePlaceholder")}
        value={title}
      />
      <div className="project-form-actions">
        <Button disabled={isSubmitting} onClick={onCancel} type="default">
          {t("common:cancel")}
        </Button>
        <Button htmlType="submit" loading={isSubmitting} type="primary">
          {isSubmitting ? t("projects:creating") : t("projects:create")}
        </Button>
      </div>
    </form>
  );
}
