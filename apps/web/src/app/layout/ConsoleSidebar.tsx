import { ChevronDown, ChevronLeft, ChevronRight, List, X } from "lucide-react";
import { Button, Popover, Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
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
  const collapseKey = user ? `xnovel:console-sidebar:v1:${user.id}` : null;
  const [collapsed, setCollapsed] = useState(() =>
    collapseKey
      ? window.localStorage.getItem(collapseKey) === "collapsed"
      : false,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const isAdmin = user?.role === "admin";
  const location = useLocation();
  const navigate = useNavigate();
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const auditActive = location.pathname.startsWith("/admin/audit/");
  const administrationItems = isAdmin ? administrationNavigation : [];

  useEffect(() => {
    if (!collapseKey) return;
    window.localStorage.setItem(
      collapseKey,
      collapsed ? "collapsed" : "expanded",
    );
  }, [collapseKey, collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() =>
      sidebarRef.current
        ?.querySelector<HTMLElement>("a, button:not([disabled])")
        ?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        requestAnimationFrame(() => mobileTriggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

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
        ref={mobileTriggerRef}
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
        ref={sidebarRef}
      >
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
          />

          {administrationItems.length > 0 ? (
            <section className="console-navigation-group">
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
          onClick={() => {
            setMobileOpen(false);
            requestAnimationFrame(() => mobileTriggerRef.current?.focus());
          }}
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
}: {
  collapsed: boolean;
  items: NavigationItem[];
  onNavigate: (path: string) => void;
}) {
  return (
    <section className="console-navigation-group">
      {items.map((item) => (
        <NavItem
          collapsed={collapsed}
          item={item}
          key={item.key}
          onNavigate={onNavigate}
        />
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
    <Tooltip
      align={{ offset: [0, 0] }}
      arrow={false}
      classNames={{ root: "console-nav-tooltip" }}
      mouseEnterDelay={0}
      placement="right"
      title={t(item.labelKey)}
    >
      {link}
    </Tooltip>
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
  const [popoverOpen, setPopoverOpen] = useState(false);
  const AuditIcon = items[0]?.icon;
  const open = expanded || active;
  const trigger = (
    <button
      aria-expanded={collapsed ? popoverOpen : open}
      aria-label={t("audit")}
      className={[
        "console-nav-item",
        active ? "console-nav-item-parent-active" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={collapsed ? undefined : onToggle}
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
    <Popover
      align={{ offset: [0, 0] }}
      arrow={false}
      classNames={{ root: "console-nav-audit-popover" }}
      content={
        <div
          className="console-nav-audit-flyout"
          onClick={() => setPopoverOpen(false)}
        >
          <strong>{t("audit")}</strong>
          {items.map((item) => (
            <NavItem item={item} key={item.key} />
          ))}
        </div>
      }
      onOpenChange={setPopoverOpen}
      open={popoverOpen}
      placement="rightTop"
      trigger={["hover", "focus", "click"]}
    >
      {trigger}
    </Popover>
  );
}
