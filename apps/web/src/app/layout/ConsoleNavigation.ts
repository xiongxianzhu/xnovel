import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  Brain,
  ChartNoAxesColumnIncreasing,
  Settings,
  List,
  LogIn,
  Users,
} from "lucide-react";

export type NavigationItem = {
  key: string;
  labelKey: string;
  path: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const workspaceNavigation: NavigationItem[] = [
  {
    key: "dashboard",
    labelKey: "dashboard",
    path: "/dashboard",
    icon: ChartNoAxesColumnIncreasing,
  },
  {
    key: "projects",
    labelKey: "projects",
    path: "/projects",
    icon: BookOpenText,
  },
  {
    key: "aiModels",
    labelKey: "aiModels",
    path: "/ai-models",
    icon: Brain,
  },
  {
    key: "settings",
    labelKey: "settings",
    path: "/settings",
    icon: Settings,
  },
];

export const administrationNavigation: NavigationItem[] = [
  {
    key: "users",
    labelKey: "users",
    path: "/admin/users",
    icon: Users,
    adminOnly: true,
  },
  {
    key: "loginAudit",
    labelKey: "loginAudit",
    path: "/admin/audit/login",
    icon: LogIn,
    adminOnly: true,
  },
  {
    key: "operationAudit",
    labelKey: "operationAudit",
    path: "/admin/audit/operations",
    icon: List,
    adminOnly: true,
  },
];
