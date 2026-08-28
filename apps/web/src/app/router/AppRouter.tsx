import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { useAuth } from "../../features/auth/useAuth";

const AppShell = lazy(() =>
  import("../layout/AppShell").then((module) => ({
    default: module.AppShell,
  })),
);
const DashboardPage = lazy(() =>
  import("../../pages/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const PlaceholderPage = lazy(() =>
  import("../../pages/console/PlaceholderPage").then((module) => ({
    default: module.PlaceholderPage,
  })),
);
const ForbiddenPage = lazy(() =>
  import("../../pages/console/PlaceholderPage").then((module) => ({
    default: module.ForbiddenPage,
  })),
);
const ProjectListPage = lazy(() =>
  import("../../pages/projects/ProjectListPage").then((module) => ({
    default: module.ProjectListPage,
  })),
);
const LoginPage = lazy(() =>
  import("../../pages/login/LoginPage").then((module) => ({
    default: module.LoginPage,
  })),
);
const PreferencesPage = lazy(() =>
  import("../../pages/settings/PreferencesPage").then((module) => ({
    default: module.PreferencesPage,
  })),
);
const PasswordChangePage = lazy(() =>
  import("../../pages/settings/PasswordChangePage").then((module) => ({
    default: module.PasswordChangePage,
  })),
);
const ProjectDetailPage = lazy(() =>
  import("../../pages/projects/ProjectDetailPage").then((module) => ({
    default: module.ProjectDetailPage,
  })),
);
const ProviderPage = lazy(() =>
  import("../../pages/ai/ProviderPage").then((module) => ({
    default: module.ProviderPage,
  })),
);
const SkillsPage = lazy(() =>
  import("../../pages/skills/SkillsPage").then((module) => ({
    default: module.SkillsPage,
  })),
);
const AdminSkillsPage = lazy(() =>
  import("../../pages/admin/AdminSkillsPage").then((module) => ({
    default: module.AdminSkillsPage,
  })),
);

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedApplication />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate replace to="/dashboard" />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectListPage />} />
            <Route
              path="/projects/:projectId"
              element={<ProjectDetailPage />}
            />
            <Route
              path="/settings"
              element={<Navigate replace to="/settings/preferences" />}
            />
            <Route path="/settings/preferences" element={<PreferencesPage />} />
            <Route path="/settings/password" element={<PasswordChangePage />} />
            <Route path="/ai-models" element={<ProviderPage />} />
            <Route path="/skills" element={<SkillsPage />} />
            <Route
              path="/admin/skills"
              element={
                <AdminOnly>
                  <AdminSkillsPage />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminOnly>
                  <PlaceholderPage
                    descriptionKey="usersDescription"
                    titleKey="users"
                  />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/audit/login"
              element={
                <AdminOnly>
                  <PlaceholderPage
                    descriptionKey="loginAuditDescription"
                    titleKey="loginAudit"
                  />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/audit/operations"
              element={
                <AdminOnly>
                  <PlaceholderPage
                    descriptionKey="operationAuditDescription"
                    titleKey="operationAudit"
                  />
                </AdminOnly>
              }
            />
          </Route>
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "admin" ? children : <ForbiddenPage />;
}

function ProtectedApplication() {
  const { status, user } = useAuth();
  const location = useLocation();
  const { t } = useTranslation("common");

  if (status === "bootstrapping") {
    return (
      <main className="bootstrap-state" aria-busy="true">
        <div className="bootstrap-mark" aria-hidden>
          x
        </div>
        <p>{t("loading")}</p>
      </main>
    );
  }
  if (status === "anonymous") {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}` }}
        to="/login"
      />
    );
  }
  if (
    user?.must_change_password &&
    location.pathname !== "/settings/password"
  ) {
    return <Navigate replace to="/settings/password" />;
  }
  if (
    !user?.must_change_password &&
    location.pathname === "/settings/password"
  ) {
    return <Navigate replace to="/" />;
  }
  return <Outlet />;
}

function RouteFallback() {
  const { t } = useTranslation("common");
  return (
    <main className="bootstrap-state" aria-busy="true">
      <div className="bootstrap-mark" aria-hidden>
        x
      </div>
      <p>{t("loading")}</p>
    </main>
  );
}
