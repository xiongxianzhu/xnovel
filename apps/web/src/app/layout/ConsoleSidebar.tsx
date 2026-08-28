import { ChevronDown, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Button } from "antd";
import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../features/auth/useAuth";
import {
  administrationNavigation,
  workspaceNavigation,
  type NavigationItem,
} from "./ConsoleNavigation";

export function ConsoleSidebar() {
  const { user } = useAuth();
  const { t } = useTranslation("console");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const navigate = useNavigate();

  const auditActive = location.pathname.startsWith("/admin/audit/");
  const administrationItems = isAdmin ? administrationNavigation : [];

  function go(path: string) {
    void navigate(path);
    setMobileOpen(false);
  }

  return (
    <>
      <Button
        aria-label={t("openNavigation")}
        className="mobile-navigation-trigger"
        icon={<List aria-hidden size={22} />}
        onClick={() => setMobileOpen(true)}
        type="text"
      />
      <aside
        aria-label={t("navigation")}
        className={[
          "console-sidebar",
          collapsed ? "console-sidebar-collapsed" : "",
          mobileOpen ? "console-sidebar-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="console-sidebar-header">
          {!collapsed ? <span>{t("navigation")}</span> : null}
        </div>

        <Button
          aria-expanded={mobileOpen || !collapsed}
          aria-label={
            mobileOpen
              ? t("closeNavigation")
              : collapsed
                ? t("expandNavigation")
                : t("collapseNavigation")
          }
          className="console-sidebar-toggle"
          icon={
            mobileOpen ? (
              <X aria-hidden size={18} />
            ) : collapsed ? (
              <ChevronRight aria-hidden size={18} />
            ) : (
              <ChevronLeft aria-hidden size={18} />
            )
          }
          onClick={() => {
            if (mobileOpen) {
              setMobileOpen(false);
            } else {
              setCollapsed((value) => !value);
            }
          }}
          type="text"
        />

        <nav className="console-sidebar-content">
          <NavigationGroup
            collapsed={collapsed}
            items={workspaceNavigation}
            onNavigate={go}
            title={t("workspace")}
          />

          {administrationItems.length > 0 ? (
            <section className="console-navigation-group">
              {!collapsed ? (
                <div className="console-navigation-group-title">
                  {t("administration")}
                </div>
              ) : null}
              {administrationItems
                .filter((item) => !item.path.startsWith("/admin/audit/"))
                .map((item) => (
                  <NavItem collapsed={collapsed} item={item} key={item.key} />
                ))}
              <AuditNavigation
                active={auditActive}
                collapsed={collapsed}
                expanded={auditExpanded}
                items={administrationItems.filter((item) =>
                  item.path.startsWith("/admin/audit/"),
                )}
                onToggle={() => setAuditExpanded((value) => !value)}
              />
            </section>
          ) : null}
        </nav>
      </aside>
      {mobileOpen ? (
        <button
          aria-label={t("closeNavigation")}
          className="console-sidebar-scrim"
          onClick={() => setMobileOpen(false)}
          type="button"
        />
      ) : null}
    </>
  );
}

function NavigationGroup({
  collapsed,
  items,
  onNavigate,
  title,
}: {
  collapsed: boolean;
  items: NavigationItem[];
  onNavigate: (path: string) => void;
  title: string;
}) {
  return (
    <section className="console-navigation-group">
      {!collapsed ? (
        <div className="console-navigation-group-title">{title}</div>
      ) : null}
      {items.map((item) => (
        <NavItem item={item} key={item.key} onNavigate={onNavigate} />
      ))}
    </section>
  );
}

function NavItem({
  collapsed,
  item,
  nested = false,
  onNavigate,
}: {
  collapsed?: boolean;
  item: NavigationItem;
  nested?: boolean;
  onNavigate?: (path: string) => void;
}) {
  const { t } = useTranslation("console");
  const IconComponent = item.icon;
  const link = (
    <NavLink
      aria-label={t(item.labelKey)}
      className={({ isActive }) =>
        [
          "console-nav-item",
          nested ? "console-nav-item-nested" : "",
          isActive ? "console-nav-item-active" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onClick={() => onNavigate?.(item.path)}
      to={item.path}
    >
      <IconComponent aria-hidden size={19} strokeWidth={1.8} />
      {!collapsed ? <span>{t(item.labelKey)}</span> : null}
    </NavLink>
  );

  if (!collapsed) {
    return link;
  }

  return (
    <div className="console-nav-flyout-anchor">
      {link}
      <div className="console-nav-flyout" role="tooltip">
        {t(item.labelKey)}
      </div>
    </div>
  );
}

function AuditNavigation({
  active,
  collapsed,
  expanded,
  items,
  onToggle,
}: {
  active: boolean;
  collapsed: boolean;
  expanded: boolean;
  items: NavigationItem[];
  onToggle: () => void;
}) {
  const { t } = useTranslation("console");
  const AuditIcon = items[0]?.icon;
  const open = expanded || active;
  const trigger = (
    <button
      aria-expanded={open}
      aria-label={t("audit")}
      className={[
        "console-nav-item",
        active ? "console-nav-item-parent-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onToggle}
      type="button"
    >
      {AuditIcon ? <AuditIcon aria-hidden size={19} strokeWidth={1.8} /> : null}
      {!collapsed ? (
        <>
          <span>{t("audit")}</span>
          {open ? (
            <ChevronDown aria-hidden className="console-nav-caret" size={18} />
          ) : (
            <ChevronRight aria-hidden className="console-nav-caret" size={18} />
          )}
        </>
      ) : null}
    </button>
  );

  if (!collapsed) {
    return (
      <>
        {trigger}
        {open ? (
          <div className="console-nav-submenu">
            {items.map((item) => (
              <NavItem item={item} key={item.key} nested />
            ))}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="console-nav-flyout-anchor">
      {trigger}
      <div className="console-nav-flyout console-nav-audit-flyout">
        <strong>{t("audit")}</strong>
        {items.map((item) => (
          <NavItem item={item} key={item.key} />
        ))}
      </div>
    </div>
  );
}
