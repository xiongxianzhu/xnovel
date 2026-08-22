import { ArrowLeft } from "lucide-react";
import { Button } from "antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function PlaceholderPage({
  descriptionKey,
  titleKey,
}: {
  descriptionKey: string;
  titleKey: string;
}) {
  const { t } = useTranslation("console");
  return (
    <main className="placeholder-page" aria-labelledby="placeholder-title">
      <p className="eyebrow">{t("placeholderEyebrow")}</p>
      <h1 id="placeholder-title">{t(titleKey)}</h1>
      <p className="page-description">{t(descriptionKey)}</p>
      <section className="placeholder-panel">
        <span className="placeholder-status">{t("notConnected")}</span>
        <p>{t("placeholderDetails")}</p>
        <Link to="/dashboard">
          <Button icon={<ArrowLeft aria-hidden />}>
            {t("backToDashboard")}
          </Button>
        </Link>
      </section>
    </main>
  );
}

export function ForbiddenPage() {
  const { t } = useTranslation("console");
  return (
    <main className="placeholder-page" aria-labelledby="forbidden-title">
      <p className="eyebrow">{t("placeholderEyebrow")}</p>
      <h1 id="forbidden-title">{t("forbiddenTitle")}</h1>
      <p className="page-description">{t("forbiddenDescription")}</p>
      <Link to="/dashboard">
        <Button type="primary">{t("backToDashboard")}</Button>
      </Link>
    </main>
  );
}
