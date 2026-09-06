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
const SystemSettingsPage = lazy(() =>
  import("../../pages/settings/SiteSettingsPage").then((module) => ({
    default: module.SystemSettingsPage,
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
const SkillsWorkspacePage = lazy(() =>
  import("../../pages/skills/SkillsWorkspacePage").then((module) => ({
    default: module.SkillsWorkspacePage,
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

const StudioHubPage = lazy(() =>
  import("../../pages/studio/StudioPages").then((module) => ({
    default: module.StudioHubPage,
  })),
);
const StudioListPage = lazy(() =>
  import("../../pages/studio/StudioPages").then((module) => ({
    default: module.StudioListPage,
  })),
);
const StudioRecordPage = lazy(() =>
  import("../../pages/studio/StudioPages").then((module) => ({
    default: module.StudioRecordPage,
  })),
);
const RecallPage = lazy(() =>
  import("../../pages/studio/RecallPage").then((module) => ({
    default: module.RecallPage,
  })),
);
const RevisionPage = lazy(() =>
  import("../../pages/studio/RevisionPage").then((module) => ({
    default: module.RevisionPage,
  })),
);
const SearchPage = lazy(() =>
  import("../../pages/studio/SearchPage").then((module) => ({
    default: module.SearchPage,
  })),
);
const ImportPage = lazy(() =>
  import("../../pages/studio/DeliveryPages").then((module) => ({
    default: module.ImportPage,
  })),
);
const ExportPage = lazy(() =>
  import("../../pages/studio/DeliveryPages").then((module) => ({
    default: module.ExportPage,
  })),
);
const SchedulePage = lazy(() =>
  import("../../pages/studio/DeliveryPages").then((module) => ({
    default: module.SchedulePage,
  })),
);
const BatchListPage = lazy(() =>
  import("../../pages/studio/BatchPages").then((module) => ({
    default: module.BatchListPage,
  })),
);
const BatchCreatePage = lazy(() =>
  import("../../pages/studio/BatchPages").then((module) => ({
    default: module.BatchCreatePage,
  })),
);
const BatchDetailPage = lazy(() =>
  import("../../pages/studio/BatchPages").then((module) => ({
    default: module.BatchDetailPage,
  })),
);
const AiHistoryPage = lazy(() =>
  import("../../pages/studio/AiHistoryPage").then((module) => ({
    default: module.AiHistoryPage,
  })),
);
const PlanningListPage = lazy(() =>
  import("../../pages/studio/PlanningPages").then((module) => ({
    default: module.PlanningListPage,
  })),
);
const PlanningRecordPage = lazy(() =>
  import("../../pages/studio/PlanningPages").then((module) => ({
    default: module.PlanningRecordPage,
  })),
);
const ReferencesPage = lazy(() =>
  import("../../pages/studio/PlanningPages").then((module) => ({
    default: module.ReferencesPage,
  })),
);
const DocumentMovePage = lazy(() =>
  import("../../pages/studio/PlanningPages").then((module) => ({
    default: module.DocumentMovePage,
  })),
);
const SkillCreatePage = lazy(() =>
  import("../../pages/skills/SkillPages").then((module) => ({
    default: module.SkillCreatePage,
  })),
);
const SkillRecordPage = lazy(() =>
  import("../../pages/skills/SkillPages").then((module) => ({
    default: module.SkillRecordPage,
  })),
);
const SkillVersionsPage = lazy(() =>
  import("../../pages/skills/SkillPages").then((module) => ({
    default: module.SkillVersionsPage,
  })),
);
const AdminUserPage = lazy(() =>
  import("../../pages/admin/UserPages").then((module) => ({
    default: module.AdminUserPage,
  })),
);
const LoginAuditDetailPage = lazy(() =>
  import("../../pages/admin/UserPages").then((module) => ({
    default: module.LoginAuditDetailPage,
  })),
);

const WorldMovePage = lazy(() =>
  import("../../pages/studio/PlanningPages").then((module) => ({
    default: module.WorldMovePage,
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
            <Route
              path="/projects/:projectId/studio"
              element={<StudioHubPage />}
            />
            <Route
              path="/projects/:projectId/studio/:kind"
              element={<StudioListPage />}
            />
            <Route
              path="/projects/:projectId/studio/:kind/new"
              element={<StudioRecordPage />}
            />
            <Route
              path="/projects/:projectId/studio/:kind/:recordId"
              element={<StudioRecordPage />}
            />
            <Route
              path="/projects/:projectId/studio/:kind/:recordId/edit"
              element={<StudioRecordPage />}
            />
            <Route
              path="/projects/:projectId/recall"
              element={<RecallPage />}
            />
            <Route
              path="/projects/:projectId/search"
              element={<SearchPage />}
            />
            <Route
              path="/projects/:projectId/documents/:documentId/revisions"
              element={<RevisionPage />}
            />
            <Route
              path="/projects/:projectId/documents/:documentId/move"
              element={<DocumentMovePage />}
            />
            <Route
              path="/projects/:projectId/references/:documentId"
              element={<ReferencesPage />}
            />
            <Route
              path="/projects/:projectId/references/:documentId/edit"
              element={<ReferencesPage />}
            />
            <Route
              path="/projects/:projectId/references/:documentId/new"
              element={<ReferencesPage />}
            />
            <Route path="/import" element={<ImportPage />} />
            <Route
              path="/projects/:projectId/import"
              element={<ImportPage />}
            />
            <Route
              path="/projects/:projectId/export"
              element={<ExportPage />}
            />
            <Route
              path="/projects/:projectId/schedule"
              element={<SchedulePage />}
            />
            <Route
              path="/projects/:projectId/batches"
              element={<BatchListPage />}
            />
            <Route
              path="/projects/:projectId/batches/new"
              element={<BatchCreatePage />}
            />
            <Route
              path="/projects/:projectId/batches/:batchId"
              element={<BatchDetailPage />}
            />
            <Route
              path="/projects/:projectId/ai-history"
              element={<AiHistoryPage />}
            />
            <Route
              path="/projects/:projectId/ai-history/:taskId"
              element={<AiHistoryPage />}
            />
            <Route path="/ai/history" element={<AiHistoryPage />} />
            <Route path="/ai/history/:taskId" element={<AiHistoryPage />} />
            <Route path="/skills/new" element={<SkillCreatePage />} />
            <Route path="/skills/:skillId" element={<SkillRecordPage />} />
            <Route path="/skills/:skillId/edit" element={<SkillRecordPage />} />
            <Route
              path="/skills/:skillId/versions"
              element={<SkillVersionsPage />}
            />
            <Route
              path="/skills/:skillId/versions/:versionId"
              element={<SkillVersionsPage />}
            />
            <Route
              path="/projects/:projectId/documents"
              element={<PlanningListPage />}
            />
            <Route
              path="/projects/:projectId/documents/new"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/documents/:recordId"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/documents/:recordId/edit"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/characters"
              element={<PlanningListPage />}
            />
            <Route
              path="/projects/:projectId/characters/new"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/characters/:recordId"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/characters/:recordId/edit"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/world/:recordId/move"
              element={<WorldMovePage />}
            />
            <Route
              path="/projects/:projectId/world"
              element={<PlanningListPage />}
            />
            <Route
              path="/projects/:projectId/world/new"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/world/:recordId"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/projects/:projectId/world/:recordId/edit"
              element={<PlanningRecordPage />}
            />
            <Route
              path="/admin/users/new"
              element={
                <AdminOnly>
                  <AdminUserPage />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/users/:userId"
              element={
                <AdminOnly>
                  <AdminUserPage />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/users/:userId/edit"
              element={
                <AdminOnly>
                  <AdminUserPage />
                </AdminOnly>
              }
            />
            <Route
              path="/admin/audit/login/:sessionId"
              element={
                <AdminOnly>
                  <LoginAuditDetailPage />
                </AdminOnly>
              }
            />
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
            <Route path="/settings" element={<SystemSettingsPage />} />
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
            <Route path="/skills" element={<SkillsWorkspacePage />} />
            <Route
              path="/admin/skills"
              element={
                <AdminOnly>
                  <Navigate replace to="/skills?tab=security" />
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
