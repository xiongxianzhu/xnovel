import { Alert, Button, Form, Input, Modal, Skeleton } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ImageUp, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { useAuth } from "../../features/auth/useAuth";
import {
  deleteSiteLogoRequest,
  updateSiteNameRequest,
  uploadSiteLogoRequest,
} from "../../features/site/siteApi";
import {
  siteSettingsKey,
  useSiteSettings,
} from "../../features/site/useSiteSettings";
import type { PublicSiteSettingsData } from "../../shared/api/generated/types.gen";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";
import { PreferencesPage } from "./PreferencesPage";
import "./site-settings.css";

export function SystemSettingsPage() {
  const { user } = useAuth();
  return user?.role === "admin" ? <SiteSettingsPage /> : <PreferencesPage />;
}

function SiteSettingsPage() {
  const { t } = useTranslation("site");
  const query = useSiteSettings();
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [logoFailed, setLogoFailed] = useState<string>();
  const [form] = Form.useForm<{ siteName: string }>();
  const [modal, modalContext] = Modal.useModal();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const nameMutation = useMutation({
    mutationFn: updateSiteNameRequest,
    onSuccess: (data) => {
      client.setQueryData(siteSettingsKey, data);
      form.setFieldValue("siteName", data.site_name);
    },
  });
  const updateLogo = ({ url }: { url: string | null }) => {
    client.setQueryData<PublicSiteSettingsData>(siteSettingsKey, (data) =>
      data ? { ...data, logo_url: url } : data,
    );
    void client.invalidateQueries({ queryKey: siteSettingsKey });
    setFile(null);
    setPreview(undefined);
    if (inputRef.current) inputRef.current.value = "";
  };
  const upload = useMutation({
    mutationFn: uploadSiteLogoRequest,
    onSuccess: updateLogo,
  });
  const remove = useMutation({
    mutationFn: deleteSiteLogoRequest,
    onSuccess: updateLogo,
  });
  const busy = nameMutation.isPending || upload.isPending || remove.isPending;
  const logo = preview || resolveMediaUrl(query.data?.logo_url);

  return (
    <main
      className="settings-page site-settings-page"
      aria-labelledby="site-settings-title"
    >
      <header className="page-heading site-settings-heading">
        <div>
          <h1 id="site-settings-title">{t("title")}</h1>
          <p className="page-description">{t("description")}</p>
        </div>
        <Link to="/settings/preferences" className="site-preferences-link">
          {t("preferences")}
          <ArrowUpRight aria-hidden size={16} />
        </Link>
      </header>
      {query.isPending ? (
        <Skeleton active />
      ) : query.isError ? (
        <Alert
          type="error"
          showIcon
          title={t("loadFailed")}
          action={
            <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
          }
        />
      ) : (
        <>
          <section
            className="preference-section site-settings-section"
            aria-labelledby="site-name-heading"
          >
            <div className="site-section-description">
              <h2 id="site-name-heading">{t("identity")}</h2>
              <p>{t("nameDescription")}</p>
            </div>
            <div className="site-section-content">
              <Form
                form={form}
                layout="vertical"
                initialValues={{ siteName: query.data.site_name }}
                onValuesChange={() => nameMutation.reset()}
                onFinish={({ siteName }) =>
                  nameMutation.mutate(siteName.trim())
                }
              >
                <Form.Item
                  name="siteName"
                  label={t("name")}
                  extra={t("nameHint")}
                  rules={[
                    {
                      validator: (_, value: string) =>
                        value?.trim() && Array.from(value.trim()).length <= 100
                          ? Promise.resolve()
                          : Promise.reject(new Error(t("nameInvalid"))),
                    },
                  ]}
                >
                  <Input disabled={busy} />
                </Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={nameMutation.isPending}
                  disabled={busy && !nameMutation.isPending}
                >
                  {t("saveName")}
                </Button>
              </Form>
              {nameMutation.isError ? (
                <Alert
                  className="site-feedback"
                  showIcon
                  type="error"
                  title={t("saveFailed")}
                />
              ) : null}
              {nameMutation.isSuccess ? (
                <p className="site-success" role="status">
                  {t("nameSaved")}
                </p>
              ) : null}
            </div>
          </section>
          <section
            className="preference-section site-settings-section"
            aria-labelledby="site-logo-heading"
          >
            <div className="site-section-description">
              <h2 id="site-logo-heading">{t("logo")}</h2>
              <p>{t("logoDescription")}</p>
            </div>
            <div className="site-section-content">
              <div className="site-logo-workspace">
                <div className="site-logo-preview">
                  {logo && logoFailed !== logo ? (
                    <img
                      src={logo}
                      alt={t("logoPreview")}
                      onError={() => setLogoFailed(logo)}
                    />
                  ) : (
                    <>
                      {!logo ? (
                        <span className="site-logo-fallback">
                          {query.data.site_name}
                        </span>
                      ) : null}
                      <span>{t(logo ? "previewFailed" : "noLogo")}</span>
                    </>
                  )}
                </div>
                <div className="site-logo-controls">
                  <Button
                    className="site-logo-picker"
                    icon={<ImageUp aria-hidden size={18} />}
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                  >
                    {t("chooseLogo")}
                  </Button>
                  <p className="site-logo-hint" id="site-logo-hint">
                    {t("logoHint")}
                  </p>
                  <input
                    ref={inputRef}
                    id="site-logo-file"
                    type="file"
                    hidden
                    aria-label={t("chooseLogo")}
                    aria-describedby="site-logo-hint"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      upload.reset();
                      remove.reset();
                      setFile(null);
                      setPreview(undefined);
                      setFileError(undefined);
                      if (!selected) return;
                      if (
                        selected.size > 5 * 1024 * 1024 ||
                        !["image/png", "image/jpeg", "image/webp"].includes(
                          selected.type,
                        )
                      ) {
                        setFileError(t("fileInvalid"));
                        event.target.value = "";
                        return;
                      }
                      setFile(selected);
                      setPreview(URL.createObjectURL(selected));
                    }}
                  />
                  {file ? <p className="site-file-name">{file.name}</p> : null}
                </div>
              </div>
              <div className="site-logo-actions">
                <Button
                  type="primary"
                  loading={upload.isPending}
                  disabled={
                    !file ||
                    !preview ||
                    logoFailed === preview ||
                    (busy && !upload.isPending)
                  }
                  onClick={() => file && upload.mutate(file)}
                >
                  {t("saveLogo")}
                </Button>
                <Button
                  icon={<Trash2 aria-hidden size={16} />}
                  danger
                  disabled={!query.data.logo_url || busy}
                  onClick={() =>
                    modal.confirm({
                      title: t("removeTitle"),
                      content: t("removeDescription"),
                      okText: t("removeLogo"),
                      cancelText: t("cancel"),
                      okButtonProps: { danger: true },
                      onOk: () => remove.mutateAsync(),
                    })
                  }
                >
                  {t("removeLogo")}
                </Button>
              </div>
              {fileError || upload.isError || remove.isError ? (
                <Alert
                  className="site-feedback"
                  showIcon
                  type="error"
                  title={fileError || t("logoSaveFailed")}
                />
              ) : null}
              {upload.isSuccess || remove.isSuccess ? (
                <p className="site-success" role="status">
                  {t("logoSaved")}
                </p>
              ) : null}
            </div>
          </section>
        </>
      )}
      {modalContext}
    </main>
  );
}
