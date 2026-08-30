import {
  Alert,
  Avatar,
  Button,
  Form,
  Input,
  Modal,
  Skeleton,
  Tabs,
  Upload,
  type UploadProps,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Link as LinkIcon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getProfileRequest } from "../../features/auth/authApi";
import { useAuth } from "../../features/auth/useAuth";
import {
  deleteAvatarRequest,
  setAvatarUrlRequest,
  updateProfileRequest,
  uploadAvatarRequest,
} from "../../features/profile/profileApi";
import { isApiError } from "../../shared/api/errors";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;

type ProfileValues = {
  address?: string;
  currentPassword?: string;
  email?: string;
  nickname: string;
  phone?: string;
  username: string;
};

export function ProfilePage() {
  const { refreshProfile } = useAuth();
  const { t } = useTranslation(["common", "settings"]);
  const queryClient = useQueryClient();
  const [form] = Form.useForm<ProfileValues>();
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const profile = useQuery({
    queryKey: ["current-user-profile"],
    queryFn: getProfileRequest,
  });
  const watchedEmail = Form.useWatch("email", form);
  const watchedPhone = Form.useWatch("phone", form);
  const watchedUsername = Form.useWatch("username", form);
  const identityChanged = Boolean(
    profile.data &&
    (watchedEmail !== undefined ||
      watchedPhone !== undefined ||
      watchedUsername !== undefined) &&
    ((watchedUsername ?? "").trim() !== profile.data.username ||
      (watchedEmail ?? "").trim() !== (profile.data.email ?? "") ||
      (watchedPhone ?? "").trim() !== (profile.data.phone_e164 ?? "")),
  );

  useEffect(() => {
    if (!profile.data) return;
    form.setFieldsValue({
      address: profile.data.address ?? "",
      email: profile.data.email ?? "",
      nickname: profile.data.nickname,
      phone: profile.data.phone_e164 ?? "",
      username: profile.data.username,
    });
  }, [form, profile.data]);

  async function refreshAccount() {
    const next = await refreshProfile();
    queryClient.setQueryData(["current-user-profile"], next);
  }

  const saveProfile = useMutation({
    mutationFn: updateProfileRequest,
    onSuccess: async (next) => {
      queryClient.setQueryData(["current-user-profile"], next);
      await refreshProfile();
      form.setFieldValue("currentPassword", "");
      setSaved(true);
      setError(undefined);
    },
    onError: (reason) => {
      setSaved(false);
      setError(
        isApiError(reason) && reason.code === 11007
          ? t("settings:profileCurrentPasswordInvalid")
          : isApiError(reason) && reason.code === 11002
            ? t("settings:profileIdentifierUnavailable")
            : t("settings:profileSaveFailed"),
      );
    },
  });
  const uploadAvatar = useMutation({
    mutationFn: uploadAvatarRequest,
    onSuccess: refreshAccount,
    onError: () => setError(t("settings:avatarUploadFailed")),
  });
  const setOnlineAvatar = useMutation({
    mutationFn: setAvatarUrlRequest,
    onSuccess: async () => {
      await refreshAccount();
      setAvatarUrl("");
      setError(undefined);
    },
    onError: () => setError(t("settings:avatarUrlInvalid")),
  });
  const deleteAvatar = useMutation({
    mutationFn: deleteAvatarRequest,
    onSuccess: refreshAccount,
    onError: () => setError(t("settings:avatarDeleteFailed")),
  });

  const uploadRequest: UploadProps["customRequest"] = ({
    file,
    onError,
    onSuccess,
  }) => {
    const selected = file as File;
    if (selected.size > MAX_AVATAR_BYTES) {
      const reason = new Error(t("settings:avatarTooLarge"));
      setError(reason.message);
      onError?.(reason);
      return;
    }
    void uploadAvatar
      .mutateAsync(selected)
      .then(() => onSuccess?.({}))
      .catch((reason: Error) => onError?.(reason));
  };

  async function submit(values: ProfileValues) {
    setSaved(false);
    if (identityChanged && !values.currentPassword) {
      form.setFields([
        {
          name: "currentPassword",
          errors: [t("settings:profileCurrentPasswordRequired")],
        },
      ]);
      return;
    }
    try {
      await saveProfile.mutateAsync({
        address: values.address?.trim() || null,
        current_password: identityChanged ? values.currentPassword : undefined,
        email: values.email?.trim() || null,
        nickname: values.nickname.trim(),
        phone_e164: values.phone?.trim() || null,
        username: values.username.trim(),
      });
    } catch {
      // Mutation error state is rendered above without clearing form values.
    }
  }

  if (profile.isPending) {
    return (
      <main aria-busy="true" className="profile-page">
        <Skeleton active paragraph={{ rows: 10 }} title />
      </main>
    );
  }
  if (profile.isError) {
    return (
      <main className="profile-page">
        <Alert
          action={
            <Button onClick={() => void profile.refetch()}>
              {t("common:retry")}
            </Button>
          }
          showIcon
          title={t("settings:profileLoadFailed")}
          type="error"
        />
      </main>
    );
  }

  const currentAvatar = resolveMediaUrl(profile.data.avatar_url);
  const initial = profile.data.nickname.trim().charAt(0).toUpperCase() || "X";

  return (
    <main className="profile-page" aria-labelledby="profile-title">
      <header className="page-heading profile-heading">
        <div>
          <h1 id="profile-title">{t("settings:profileTitle")}</h1>
          <p>{t("settings:profileDescription")}</p>
        </div>
      </header>
      {error ? (
        <Alert
          closable
          className="form-alert"
          onClose={() => setError(undefined)}
          showIcon
          title={error}
          type="error"
        />
      ) : null}
      {saved ? (
        <Alert
          closable
          className="form-alert"
          onClose={() => setSaved(false)}
          showIcon
          title={t("settings:profileSaved")}
          type="success"
        />
      ) : null}
      <div className="profile-workspace">
        <aside
          className="profile-identity"
          aria-label={t("settings:identitySummary")}
        >
          <button
            aria-label={t("settings:previewAvatar")}
            className="profile-avatar-preview-button"
            disabled={!currentAvatar}
            onClick={() => setPreviewOpen(true)}
            type="button"
          >
            <Avatar
              size={112}
              src={
                currentAvatar ? (
                  <img
                    alt=""
                    referrerPolicy="no-referrer"
                    src={currentAvatar}
                  />
                ) : undefined
              }
            >
              {initial}
            </Avatar>
          </button>
          <div className="profile-identity-copy">
            <strong>{profile.data.nickname}</strong>
            <span>@{profile.data.username}</span>
          </div>
          <dl className="profile-identity-list">
            <div>
              <dt>{t("settings:email")}</dt>
              <dd>{profile.data.email || t("settings:notSet")}</dd>
            </div>
            <div>
              <dt>{t("settings:phone")}</dt>
              <dd>{profile.data.phone_e164 || t("settings:notSet")}</dd>
            </div>
          </dl>
        </aside>
        <div className="profile-editor">
          <section
            className="profile-avatar-section"
            aria-labelledby="avatar-title"
          >
            <div className="profile-section-heading">
              <div>
                <h2 id="avatar-title">{t("settings:avatarTitle")}</h2>
                <p>{t("settings:avatarDescription")}</p>
              </div>
              <Button
                danger
                disabled={!currentAvatar}
                icon={<Trash2 aria-hidden size={17} />}
                loading={deleteAvatar.isPending}
                onClick={() => deleteAvatar.mutate()}
              >
                {t("settings:removeAvatar")}
              </Button>
            </div>
            <Tabs
              className="profile-avatar-tabs"
              items={[
                {
                  key: "local",
                  label: t("settings:localAvatarTab"),
                  children: (
                    <Upload.Dragger
                      accept="image/png,image/jpeg,image/webp"
                      className="profile-avatar-dropzone"
                      customRequest={uploadRequest}
                      disabled={uploadAvatar.isPending}
                      maxCount={1}
                      showUploadList={false}
                    >
                      <ImageUp aria-hidden size={26} strokeWidth={1.6} />
                      <strong>{t("settings:localAvatarDropTitle")}</strong>
                      <span>{t("settings:localAvatarDropHint")}</span>
                    </Upload.Dragger>
                  ),
                },
                {
                  key: "online",
                  label: t("settings:onlineAvatarTab"),
                  children: (
                    <div className="profile-avatar-url-panel">
                      <label htmlFor="profile-avatar-url">
                        {t("settings:avatarUrl")}
                      </label>
                      <div className="profile-avatar-url">
                        <Input
                          id="profile-avatar-url"
                          onChange={(event) => setAvatarUrl(event.target.value)}
                          placeholder="https://example.com/avatar.png"
                          prefix={<LinkIcon aria-hidden size={16} />}
                          value={avatarUrl}
                        />
                        <Button
                          disabled={!avatarUrl.trim()}
                          loading={setOnlineAvatar.isPending}
                          onClick={() =>
                            setOnlineAvatar.mutate(avatarUrl.trim())
                          }
                          type="primary"
                        >
                          {t("settings:useOnlineAvatar")}
                        </Button>
                      </div>
                      <p>{t("settings:onlineAvatarHint")}</p>
                    </div>
                  ),
                },
              ]}
            />
          </section>
          <section
            className="profile-form-section"
            aria-labelledby="profile-form-title"
          >
            <h2 id="profile-form-title">{t("settings:basicProfile")}</h2>
            <Form<ProfileValues>
              form={form}
              layout="vertical"
              onFinish={(values) => void submit(values)}
              requiredMark={false}
            >
              <div className="profile-form-grid">
                <Form.Item
                  extra={t("settings:usernameHint")}
                  label={t("settings:username")}
                  name="username"
                  rules={[
                    {
                      required: true,
                      message: t("settings:usernameRequired"),
                    },
                    { max: 32, min: 3 },
                  ]}
                >
                  <Input autoComplete="username" maxLength={32} />
                </Form.Item>
                <Form.Item
                  label={t("settings:nickname")}
                  name="nickname"
                  rules={[
                    {
                      required: true,
                      message: t("settings:nicknameRequired"),
                    },
                    { max: 100 },
                  ]}
                >
                  <Input maxLength={100} />
                </Form.Item>
                <Form.Item
                  label={t("settings:email")}
                  name="email"
                  rules={[
                    { type: "email", message: t("settings:emailInvalid") },
                  ]}
                >
                  <Input autoComplete="email" />
                </Form.Item>
                <Form.Item
                  label={t("settings:phone")}
                  name="phone"
                  rules={[
                    {
                      pattern: /^\+[1-9]\d{7,14}$/,
                      message: t("settings:phoneInvalid"),
                    },
                  ]}
                >
                  <Input autoComplete="tel" placeholder="+8613800138000" />
                </Form.Item>
                <Form.Item
                  className="profile-address-field"
                  label={t("settings:address")}
                  name="address"
                  rules={[{ max: 500 }]}
                >
                  <Input.TextArea maxLength={500} rows={3} />
                </Form.Item>
              </div>
              {identityChanged ? (
                <Form.Item
                  extra={t("settings:profileCurrentPasswordHint")}
                  label={t("settings:currentPassword")}
                  name="currentPassword"
                  rules={[
                    {
                      required: true,
                      message: t("settings:profileCurrentPasswordRequired"),
                    },
                  ]}
                >
                  <Input.Password autoComplete="current-password" />
                </Form.Item>
              ) : null}
              <Button
                htmlType="submit"
                loading={saveProfile.isPending}
                type="primary"
              >
                {t("settings:saveProfile")}
              </Button>
            </Form>
          </section>
        </div>
      </div>
      <Modal
        footer={null}
        onCancel={() => setPreviewOpen(false)}
        open={previewOpen}
        title={t("settings:avatarPreviewTitle")}
      >
        {currentAvatar ? (
          <img
            alt={t("settings:avatarPreviewAlt")}
            className="profile-avatar-modal-image"
            referrerPolicy="no-referrer"
            src={currentAvatar}
          />
        ) : null}
      </Modal>
    </main>
  );
}
