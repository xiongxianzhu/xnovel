import { Alert, Button, Form, Input } from "antd";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { isApiError } from "../../shared/api/errors";
import { useAuth } from "../../features/auth/useAuth";

interface LoginValues {
  identifier: string;
  password: string;
}

function safeReturnPath(state: unknown): string {
  if (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof state.from === "string" &&
    state.from.startsWith("/") &&
    !state.from.startsWith("//")
  ) {
    return state.from;
  }
  return "/";
}

export function LoginPage() {
  const { login, status } = useAuth();
  const { t } = useTranslation("auth");
  const location = useLocation();
  const navigate = useNavigate();
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      void navigate(safeReturnPath(location.state), { replace: true });
    }
  }, [location.state, navigate, status]);

  const submit = async (values: LoginValues) => {
    setSubmitting(true);
    setErrorKey(null);
    try {
      await login(values.identifier, values.password);
    } catch (error) {
      setErrorKey(
        isApiError(error) && error.code === 11004
          ? "invalidCredentials"
          : "genericError",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">
          xnovel
        </div>
        <h1 id="login-title">{t("title")}</h1>
        <p className="page-description">{t("description")}</p>

        {errorKey ? (
          <Alert
            className="form-alert"
            showIcon
            title={t(errorKey)}
            type="error"
          />
        ) : null}

        <Form<LoginValues>
          layout="vertical"
          onFinish={(values) => void submit(values)}
          requiredMark={false}
        >
          <Form.Item
            label={t("identifier")}
            name="identifier"
            rules={[{ required: true, message: t("identifierPlaceholder") }]}
          >
            <Input
              autoComplete="username"
              placeholder={t("identifierPlaceholder")}
            />
          </Form.Item>
          <Form.Item
            label={t("password")}
            name="password"
            rules={[{ required: true, message: t("passwordPlaceholder") }]}
          >
            <Input.Password
              autoComplete="current-password"
              placeholder={t("passwordPlaceholder")}
            />
          </Form.Item>
          <Button block htmlType="submit" loading={submitting} type="primary">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </Form>
      </section>
    </main>
  );
}
