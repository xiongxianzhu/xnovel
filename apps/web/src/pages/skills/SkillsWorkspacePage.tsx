import { Tabs } from "antd";
import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "../../features/auth/useAuth";
import { SkillsPage } from "./SkillsPage";

const AdminSkillsPage = lazy(() =>
  import("../admin/AdminSkillsPage").then((module) => ({
    default: module.AdminSkillsPage,
  })),
);

export function SkillsWorkspacePage() {
  const { user } = useAuth();
  const { t } = useTranslation("skills");
  const [params, setParams] = useSearchParams();

  if (user?.role !== "admin") return <SkillsPage />;

  return (
    <Tabs
      className="skills-workspace"
      activeKey={params.get("tab") === "security" ? "security" : "personal"}
      destroyOnHidden
      onChange={(key) => setParams(key === "security" ? { tab: key } : {})}
      items={[
        { key: "personal", label: t("personalTab"), children: <SkillsPage /> },
        {
          key: "security",
          label: t("securityTab"),
          children: (
            <Suspense fallback={<p role="status">{t("common:loading")}</p>}>
              <AdminSkillsPage />
            </Suspense>
          ),
        },
      ]}
    />
  );
}
