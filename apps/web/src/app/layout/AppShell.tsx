import { matchPath, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { UserMenu } from "../../features/auth/UserMenu";
import { useAuth } from "../../features/auth/useAuth";
import { ProjectDocumentSidebar } from "../../features/documents/ProjectDocumentSidebar";
import { EditorNavigationProvider } from "../../features/editor/EditorNavigationProvider";
import { ConsoleSidebar } from "./ConsoleSidebar";

export function AppShell() {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const location = useLocation();
  const projectRoute = matchPath("/projects/:projectId", location.pathname);
  return (
    <div className="app-shell">
      <header
        className={
          projectRoute
            ? "top-navigation top-navigation-project"
            : "top-navigation"
        }
      >
        <a className="brand-link" href="/" aria-label={t("appName")}>
          xnovel
        </a>
        <UserMenu />
      </header>
      <div className="console-body">
        {projectRoute?.params.projectId ? (
          <EditorNavigationProvider>
            {user ? (
              <ProjectDocumentSidebar
                projectId={projectRoute.params.projectId}
                userId={user.id}
              />
            ) : null}
            <div className="app-content">
              <Outlet />
            </div>
          </EditorNavigationProvider>
        ) : (
          <>
            <ConsoleSidebar />
            <div className="app-content">
              <Outlet />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
