import { KeyRound, LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, Button, Dropdown, type MenuProps } from "antd";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { usePreferences } from "../preferences/usePreferences";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";
import { useAuth } from "./useAuth";

export function UserMenu() {
  const { logout, user } = useAuth();
  const { appearance } = usePreferences();
  const { t } = useTranslation(["auth", "settings"]);
  const navigate = useNavigate();

  const items: MenuProps["items"] = [
    {
      key: "summary",
      disabled: true,
      label: (
        <span className="user-menu-summary">
          {t("settings:currentSummary", {
            locale: t(`settings:${localeKeys[appearance.locale]}`),
            mode: t(`settings:${modeKeys[appearance.themeMode]}`),
            palette: t(`settings:${paletteKeys[appearance.themePalette]}`),
          })}
        </span>
      ),
    },
    { type: "divider" },
    {
      icon: <UserRound aria-hidden size={18} strokeWidth={1.8} />,
      key: "profile",
      label: t("settings:profileMenu"),
      onClick: () => void navigate("/settings/profile"),
    },
    {
      icon: <KeyRound aria-hidden size={18} strokeWidth={1.8} />,
      key: "password",
      label: t("settings:passwordMenu"),
      onClick: () => void navigate("/settings/password"),
    },
    {
      icon: <Settings aria-hidden size={18} strokeWidth={1.8} />,
      key: "preferences",
      label: t("settings:open"),
      onClick: () => void navigate("/settings"),
    },
    {
      icon: <LogOut aria-hidden size={18} strokeWidth={1.8} />,
      key: "logout",
      label: t("auth:signOut"),
      onClick: () => void logout(),
    },
  ];

  const initial = user?.nickname.trim().charAt(0).toUpperCase() || "X";
  const avatarUrl = resolveMediaUrl(user?.avatar_url);

  return (
    <Dropdown menu={{ items }} placement="bottomRight" trigger={["click"]}>
      <Button
        aria-label={user?.nickname ?? "账户"}
        className="account-trigger"
        type="text"
      >
        <Avatar
          size={32}
          src={
            avatarUrl ? (
              <img alt="" referrerPolicy="no-referrer" src={avatarUrl} />
            ) : undefined
          }
        >
          {initial}
        </Avatar>
        <span className="account-name">{user?.nickname}</span>
      </Button>
    </Dropdown>
  );
}

const localeKeys = {
  "en-US": "enUS",
  "zh-CN": "zhCN",
  "zh-TW": "zhTW",
} as const;

const modeKeys = {
  dark: "dark",
  light: "light",
  system: "system",
} as const;

const paletteKeys = {
  graphite: "graphite",
  "grape-purple": "grapePurple",
  "harbor-blue": "harborBlue",
  "manuscript-brown": "manuscriptBrown",
  "pine-green": "pineGreen",
} as const;
