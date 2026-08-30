import { Alert, Button, Form, Input } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../features/auth/useAuth";
import { isApiError } from "../../shared/api/errors";

interface PasswordChangeValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function PasswordChangePage() {
  const { changePassword, logout, user } = useAuth();
  const { t } = useTranslation(["common", "settings"]);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(values: PasswordChangeValues) {
    setSubmitting(true);
    setError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      await navigate(user?.must_change_password ? "/" : "/settings/profile", {
        replace: true,
      });
    } catch (reason) {
      setError(
        isApiError(reason) && reason.code === 10001
          ? t("settings:passwordInvalid")
          : t("settings:passwordChangeFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      aria-labelledby="password-change-title"
      className="password-change-page"
    >
      <section className="password-change-panel">
        <h1 id="password-change-title">
          {t(
            user?.must_change_password
              ? "settings:passwordChangeTitle"
              : "settings:passwordMenu",
          )}
        </h1>
        <p className="page-description">
          {t(
            user?.must_change_password
              ? "settings:passwordChangeDescription"
              : "settings:passwordVoluntaryDescription",
          )}
        </p>
        <Alert
          className="password-rules"
          description={t("settings:passwordRules")}
          showIcon
          title={t("settings:passwordRulesTitle")}
          type="info"
        />
        {error ? (
          <Alert className="form-alert" showIcon title={error} type="error" />
        ) : null}
        <Form<PasswordChangeValues>
          layout="vertical"
          onFinish={(values) => void submit(values)}
          requiredMark={false}
        >
          <Form.Item
            label={t("settings:currentPassword")}
            name="currentPassword"
            rules={[
              {
                required: true,
                message: t("settings:currentPasswordRequired"),
              },
            ]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item
            label={t("settings:newPassword")}
            name="newPassword"
            rules={[
              {
                required: true,
                message: t("settings:newPasswordRequired"),
              },
              {
                min: 8,
                max: 32,
                message: t("settings:passwordLength"),
              },
              {
                validator: (_, value: string) => {
                  if (!value) return Promise.resolve();
                  const categories = [
                    /[A-Z]/.test(value),
                    /[a-z]/.test(value),
                    /\d/.test(value),
                    /[^A-Za-z0-9]/.test(value),
                  ].filter(Boolean).length;
                  return categories >= 2
                    ? Promise.resolve()
                    : Promise.reject(new Error(t("settings:passwordStrength")));
                },
              },
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            dependencies={["newPassword"]}
            label={t("settings:confirmPassword")}
            name="confirmPassword"
            rules={[
              {
                required: true,
                message: t("settings:confirmPasswordRequired"),
              },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  return !value || getFieldValue("newPassword") === value
                    ? Promise.resolve()
                    : Promise.reject(new Error(t("settings:passwordMismatch")));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button block htmlType="submit" loading={submitting} type="primary">
            {submitting
              ? t("settings:passwordChanging")
              : t(
                  user?.must_change_password
                    ? "settings:changePassword"
                    : "settings:passwordMenu",
                )}
          </Button>
        </Form>
        {user?.must_change_password ? (
          <Button
            className="password-logout-button"
            disabled={submitting}
            onClick={() => void logout()}
            type="link"
          >
            {t("settings:signOutInstead")}
          </Button>
        ) : null}
      </section>
    </main>
  );
}
