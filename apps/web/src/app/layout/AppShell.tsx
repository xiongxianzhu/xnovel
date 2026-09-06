import { ProjectToolsNav } from "../../features/studio/ProjectToolsNav";
import { Link, matchPath, Outlet, useLocation } from "react-router-dom";
import { SiteBrand } from "../../features/site/SiteBrand";

import { UserMenu } from "../../features/auth/UserMenu";
import { useAuth } from "../../features/auth/useAuth";
import { ProjectDocumentSidebar } from "../../features/documents/ProjectDocumentSidebar";
import { EditorNavigationProvider } from "../../features/editor/EditorNavigationProvider";
import { ConsoleSidebar } from "./ConsoleSidebar";
import { ProjectWritingSummary } from "../../features/projects/ProjectWritingSummary";
import { HeaderPreferences } from "../../features/preferences/HeaderPreferences";

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const matchedProject = matchPath("/projects/:projectId/*", location.pathname);
  const projectRoute =
    matchedProject?.params.projectId === "new" ? null : matchedProject;
  return (
    <EditorNavigationProvider>
      <div className="app-shell">
        <header
          className={
            projectRoute
              ? "top-navigation top-navigation-project"
              : "top-navigation"
          }
        >
          <Link className="brand-link" to="/">
            <SiteBrand />
          </Link>
          {projectRoute?.params.projectId ? (
            <ProjectWritingSummary
              compact
              projectId={projectRoute.params.projectId}
            />
          ) : null}
          <div className="top-navigation-actions">
            <HeaderPreferences />
            <UserMenu />
          </div>
        </header>
        <div className="console-body">
          {projectRoute?.params.projectId ? (
            <>
              {user ? (
                <ProjectDocumentSidebar
                  projectId={projectRoute.params.projectId}
                  userId={user.id}
                  summary={
                    <>
                      <ProjectToolsNav
                        projectId={projectRoute.params.projectId}
                      />
                      <ProjectWritingSummary
                        projectId={projectRoute.params.projectId}
                      />
                    </>
                  }
                />
              ) : null}
              <div className="app-content">
                <Outlet />
              </div>
            </>
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
    </EditorNavigationProvider>
  );
}
