import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { UserMenu } from "../../features/auth/UserMenu";
import { ConsoleSidebar } from "./ConsoleSidebar";

export function AppShell() {
  const { t } = useTranslation("common");
  return (
    <div className="app-shell">
      <header className="top-navigation">
        <a className="brand-link" href="/" aria-label={t("appName")}>
          xnovel
        </a>
        <UserMenu />
      </header>
      <div className="console-body">
        <ConsoleSidebar />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
