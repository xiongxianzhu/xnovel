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
const ProjectFormPage = lazy(() =>
  import("../../pages/projects/ProjectFormPage").then((module) => ({
    default: module.ProjectFormPage,
  })),
);
const ProjectInfoPage = lazy(() =>
  import("../../pages/projects/ProjectInfoPage").then((module) => ({
    default: module.ProjectInfoPage,
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
const ProfilePage = lazy(() =>
  import("../../pages/settings/ProfilePage").then((module) => ({
    default: module.ProfilePage,
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
const ProviderDetailPage = lazy(() =>
  import("../../pages/ai/ProviderDetailPage").then((module) => ({
    default: module.ProviderDetailPage,
  })),
);
const ProviderFormPage = lazy(() =>
  import("../../pages/ai/ProviderFormPage").then((module) => ({
    default: module.ProviderFormPage,
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
const AdminUsersPage = lazy(() =>
  import("../../pages/admin/AdminUsersPage").then((module) => ({
    default: module.AdminUsersPage,
  })),
);
const AdminLoginAuditPage = lazy(() =>
  import("../../pages/admin/AdminAuditPage").then((module) => ({
    default: module.AdminLoginAuditPage,
  })),
);
const AdminOperationAuditPage = lazy(() =>
  import("../../pages/admin/AdminAuditPage").then((module) => ({
    default: module.AdminOperationAuditPage,
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
            <Route path="/projects/new" element={<ProjectFormPage />} />
            <Route
              path="/projects/:projectId/details"
              element={<ProjectInfoPage />}
            />
            <Route
              path="/projects/:projectId/edit"
              element={<ProjectFormPage />}
            />
            <Route
              path="/projects/:projectId"
              element={<ProjectDetailPage />}
            />
            <Route
              path="/settings"
              element={<Navigate replace to="/settings/preferences" />}
            />
            <Route path="/settings/preferences" element={<PreferencesPage />} />
            <Route path="/settings/profile" element={<ProfilePage />} />
            <Route path="/settings/password" element={<PasswordChangePage />} />
            <Route path="/ai-models" element={<ProviderPage />} />
            <Route path="/ai-models/new" element={<ProviderFormPage />} />
            <Route
              path="/ai-models/:configId"
              element={<ProviderDetailPage />}
            />
            <Route
              path="/ai-models/:configId/edit"
              element={<ProviderFormPage />}
            />
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
                  <AdminUsersPage />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/audit/login"
              element={
                <AdminOnly>
                  <AdminLoginAuditPage />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/audit/operations"
              element={
                <AdminOnly>
                  <AdminOperationAuditPage />
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
