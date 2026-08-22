import { ArrowRight, BookOpenText } from "lucide-react";
import { Button } from "antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../features/auth/useAuth";

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation(["common", "console"]);

  return (
    <main className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="page-heading dashboard-heading">
        <p className="eyebrow">{t("console:dashboardEyebrow")}</p>
        <h1 id="dashboard-title">
          {t("console:dashboardGreeting", {
            name: user?.nickname || user?.username,
          })}
        </h1>
        <p className="page-description">{t("console:dashboardDescription")}</p>
      </header>

      <section className="dashboard-start-panel">
        <div className="dashboard-start-icon" aria-hidden>
          <BookOpenText size={28} />
        </div>
        <div>
          <p className="eyebrow">{t("console:dashboardStartEyebrow")}</p>
          <h2>{t("console:dashboardStartTitle")}</h2>
          <p>{t("console:dashboardStartDescription")}</p>
        </div>
        <Link to="/projects">
          <Button icon={<ArrowRight aria-hidden />} type="primary">
            {t("console:openProjects")}
          </Button>
        </Link>
      </section>

      <section
        className="dashboard-overview"
        aria-label={t("console:overview")}
      >
        <div>
          <span>{t("console:overviewWriting")}</span>
          <strong>{t("console:overviewWritingValue")}</strong>
        </div>
        <div>
          <span>{t("console:overviewPlanning")}</span>
          <strong>{t("console:overviewPlanningValue")}</strong>
        </div>
        <div>
          <span>{t("console:overviewAi")}</span>
          <strong>{t("console:overviewAiValue")}</strong>
        </div>
      </section>
    </main>
  );
}
