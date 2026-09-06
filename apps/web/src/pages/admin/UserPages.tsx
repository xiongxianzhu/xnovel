import {
  clearFormDraft,
  parseFormDraft,
  readFormDraft,
} from "../../features/studio/formDrafts";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import {
  listUsersRequest,
  listLoginAuditsRequest,
} from "../../features/admin/adminApi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Pagination } from "antd";
import { useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  createAdminUser,
  disableAdminUser,
  getAdminLoginAudit,
  getAdminUser,
  updateAdminUser,
} from "../../shared/api/generated/sdk.gen";
import type { AdminUserData } from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";
import { useAuth } from "../../features/auth/useAuth";
import { useFormProtection } from "../../features/studio/useFormProtection";
import {
  DraftNotice,
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";

export function AdminUsersListPage() {
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const role =
    params.get("role") === "admin"
      ? "admin"
      : params.get("role") === "user"
        ? "user"
        : undefined;
  const status =
    params.get("status") === "disabled"
      ? "disabled"
      : params.get("status") === "active"
        ? "active"
        : undefined;
  const query = useQuery({
    queryKey: ["admin-users", page, debouncedQ, role, status],
    queryFn: async () =>
      await listUsersRequest({
        offset: (page - 1) * 50,
        limit: 50,
        query: debouncedQ,
        role,
        status,
      }),
  });
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.set("page", "1");
    setParams(next, { replace: true });
  };
  return (
    <StudioFrame
      title={t("users")}
      actions={
        <Link className="studio-link-button" to="/admin/users/new">
          {t("admin:createUser")}
        </Link>
      }
    >
      <div className="studio-filter">
        <label>
          {t("keyword")}
          <input
            value={q}
            onChange={(event) => change("q", event.target.value)}
          />
        </label>
        <label>
          {t("role")}
          <select
            value={role ?? ""}
            onChange={(event) => change("role", event.target.value)}
          >
            <option value="">{t("all")}</option>
            <option value="user">{t("user")}</option>
            <option value="admin">{t("admin")}</option>
          </select>
        </label>
        <label>
          {t("status")}
          <select
            value={status ?? ""}
            onChange={(event) => change("status", event.target.value)}
          >
            <option value="">{t("all")}</option>
            <option value="active">{t("active")}</option>
            <option value="disabled">{t("disabled")}</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <Alert
          type="error"
          showIcon
          title={t("admin:usersLoadFailed")}
          action={
            <Button onClick={() => void query.refetch()}>
              {t("common:retry")}
            </Button>
          }
        />
      ) : (
        <>
          <ul className="studio-list">
            {query.data.items.map((user) => (
              <li key={user.id}>
                <div>
                  <h2>
                    <Link to={`/admin/users/${user.id}`}>
                      <strong>{user.nickname}</strong> ·{" "}
                      <span>@{user.username}</span>
                    </Link>
                  </h2>
                  <p>
                    {t(user.role)} · {t(user.status)}
                  </p>
                  <p>
                    <span>{user.email_masked ?? "—"}</span> ·{" "}
                    <span>{user.phone_masked ?? "—"}</span>
                  </p>
                </div>
                <Link
                  className="studio-link-button"
                  to={`/admin/users/${user.id}/edit`}
                >
                  {t("edit")}
                </Link>
              </li>
            ))}
          </ul>
          {!query.data.items.length ? <p>{t("empty")}</p> : null}
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={query.data.total}
              showSizeChanger={false}
              showQuickJumper
              onChange={(value) => {
                const next = new URLSearchParams(params);
                next.set("page", String(value));
                setParams(next);
              }}
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}

export function AdminUserPage() {
  const { userId = "new" } = useParams();
  const { user } = useAuth();
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const editing = useLocation().pathname.endsWith("/edit") || userId === "new";
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey: ["admin-user", userId],
    enabled: userId !== "new",
    queryFn: async () =>
      (await getAdminUser({ client: apiClient, path: { user_id: userId } }))
        .data.data,
  });
  const disable = useMutation({
    mutationFn: () =>
      disableAdminUser({ client: apiClient, path: { user_id: userId } }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["admin-users"] });
      navigate("/admin/users");
    },
  });
  return (
    <StudioFrame
      title={
        editing
          ? `${t(userId === "new" ? "create" : "edit")} · ${t("users")}`
          : (query.data?.nickname ?? t("users"))
      }
      back="/admin/users"
      actions={
        !editing ? (
          <>
            <Link
              className="studio-link-button"
              to={`/admin/users/${userId}/edit`}
            >
              {t("edit")}
            </Link>
            <Button
              danger
              disabled={
                user?.id === userId || query.data?.status === "disabled"
              }
              onClick={() => setConfirm(true)}
            >
              {t("disable")}
            </Button>
          </>
        ) : undefined
      }
    >
      {userId !== "new" && query.isPending ? (
        <StudioLoading />
      ) : userId !== "new" && query.isError ? (
        <StudioError />
      ) : editing ? (
        <AdminUserForm key={userId} record={query.data} />
      ) : query.data ? (
        <dl className="studio-meta">
          <dt>{t("username")}</dt>
          <dd>{query.data.username}</dd>
          <dt>{t("nickname")}</dt>
          <dd>{query.data.nickname}</dd>
          <dt>{t("role")}</dt>
          <dd>{t(query.data.role)}</dd>
          <dt>{t("status")}</dt>
          <dd>{t(query.data.status)}</dd>
          <dt>{t("email")}</dt>
          <dd>{query.data.email_masked ?? "—"}</dd>
        </dl>
      ) : null}
      {disable.isError ? <StudioError /> : null}
      <Modal
        open={confirm}
        title={t("disable")}
        onCancel={() => setConfirm(false)}
        onOk={() => disable.mutate()}
        confirmLoading={disable.isPending}
        okText={t("disable")}
        cancelText={t("cancel")}
        okButtonProps={{ danger: true }}
      >
        {t("disableNotice")}
      </Modal>
    </StudioFrame>
  );
}

function AdminUserForm({ record }: { record?: AdminUserData }) {
  const { user } = useAuth();
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const initial = {
    username: record?.username ?? "",
    nickname: record?.nickname ?? "",
    email: "",
    password: "",
    role: record?.role ?? "user",
    status: record?.status ?? "active",
  };
  const [values, setValues] = useState(initial);
  const draftKey = `xnovel:admin-user-draft:${user?.id}:${record?.id ?? "new"}`;
  const [storedDraft, setStoredDraft] = useState(() => readFormDraft(draftKey));
  const clean = useRef(JSON.stringify(initial));
  const mutation = useMutation({
    mutationFn: async () => {
      if (record)
        return (
          await updateAdminUser({
            client: apiClient,
            path: { user_id: record.id },
            body: {
              username: values.username,
              nickname: values.nickname,
              role: values.role,
              status: values.status,
              ...(values.email.trim() ? { email: values.email.trim() } : {}),
            },
          })
        ).data.data;
      return (
        await createAdminUser({
          client: apiClient,
          body: {
            username: values.username,
            nickname: values.nickname,
            role: values.role,
            password: values.password,
            ...(values.email.trim() ? { email: values.email.trim() } : {}),
          },
        })
      ).data.data;
    },
  });
  async function save() {
    try {
      const result = await mutation.mutateAsync();
      clean.current = JSON.stringify(values);
      clearFormDraft(draftKey);
      await client.invalidateQueries({ queryKey: ["admin-users"] });
      await client.invalidateQueries({ queryKey: ["admin-user", record?.id] });
      return result;
    } catch {
      return null;
    }
  }
  useFormProtection(
    () => JSON.stringify(values) !== clean.current,
    async () => Boolean(await save()),
    () =>
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ ...values, password: "" }),
      ),
  );
  const self = record?.id === user?.id;
  return (
    <form
      className="studio-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save().then((result) => {
          if (result) navigate(`/admin/users/${result.id}`);
        });
      }}
    >
      <fieldset className="studio-form-fields" disabled={mutation.isPending}>
        {storedDraft ? (
          <DraftNotice
            onDiscard={() => {
              clearFormDraft(draftKey);
              setStoredDraft(null);
            }}
            onRestore={() => {
              const data = parseFormDraft(storedDraft);
              if (data)
                setValues((previous) => ({
                  ...previous,
                  username:
                    typeof data.username === "string"
                      ? data.username
                      : previous.username,
                  nickname:
                    typeof data.nickname === "string"
                      ? data.nickname
                      : previous.nickname,
                  email: typeof data.email === "string" ? data.email : "",
                  password: "",
                  role: data.role === "admin" ? "admin" : "user",
                  status: data.status === "disabled" ? "disabled" : "active",
                }));
              setStoredDraft(null);
            }}
          />
        ) : null}
        {(
          [
            "username",
            "nickname",
            "email",
            ...(!record ? (["password"] as const) : []),
          ] as const
        ).map((key) => (
          <label className="studio-field" key={key}>
            {t(key)}
            <input
              type={
                key === "password"
                  ? "password"
                  : key === "email"
                    ? "email"
                    : "text"
              }
              autoComplete={key === "password" ? "new-password" : "off"}
              value={values[key]}
              required={key !== "email"}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
        {record ? (
          <p>
            {t("email")}: {record.email_masked ?? "—"}
          </p>
        ) : null}
        <label className="studio-field">
          {t("role")}
          <select
            disabled={self}
            value={values.role}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                role: event.target.value as "user" | "admin",
              }))
            }
          >
            <option value="user">{t("user")}</option>
            <option value="admin">{t("admin")}</option>
          </select>
        </label>
        {record ? (
          <label className="studio-field">
            {t("status")}
            <select
              disabled={self}
              value={values.status}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  status: event.target.value as "active" | "disabled",
                }))
              }
            >
              <option value="active">{t("active")}</option>
              <option value="disabled">{t("disabled")}</option>
            </select>
          </label>
        ) : null}
        {mutation.isError ? <StudioError /> : null}
        <div>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            {t("save")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function LoginAuditListPage() {
  const { t } = useTranslation(["studio", "admin"]);
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = useQuery({
    queryKey: ["login-audits", page, debouncedQ],
    queryFn: async () =>
      await listLoginAuditsRequest({
        offset: (page - 1) * 50,
        limit: 50,
        query: debouncedQ,
      }),
  });
  return (
    <StudioFrame title={t("admin:loginAuditTitle")}>
      <Alert type="info" title={t("readOnly")} />
      <div className="studio-filter">
        <label>
          {t("keyword")}
          <input
            value={q}
            onChange={(event) =>
              setParams({ q: event.target.value, page: "1" }, { replace: true })
            }
          />
        </label>
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <ul className="studio-list">
            {query.data.items.map((item) => (
              <li key={item.id}>
                <div>
                  <h2>
                    <Link to={`/admin/audit/login/${item.id}`}>
                      {item.username} · {item.nickname}
                    </Link>
                  </h2>
                  <p>
                    {item.last_ip} ·{" "}
                    {new Date(item.last_used_at).toLocaleString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {!query.data.items.length ? <p>{t("admin:noAuditRecords")}</p> : null}
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={query.data.total}
              showSizeChanger={false}
              showQuickJumper
              onChange={(value) => setParams({ q, page: String(value) })}
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}

export function LoginAuditDetailPage() {
  const { sessionId = "" } = useParams();
  const { t } = useTranslation(["studio", "admin"]);
  const query = useQuery({
    queryKey: ["login-audit", sessionId],
    queryFn: async () =>
      (
        await getAdminLoginAudit({
          client: apiClient,
          path: { session_id: sessionId },
        })
      ).data.data,
  });
  return (
    <StudioFrame title={t("admin:loginAuditTitle")} back="/admin/audit/login">
      <p>{t("readOnly")}</p>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <dl className="studio-meta">
          <dt>{t("username")}</dt>
          <dd>{query.data.username}</dd>
          <dt>{t("nickname")}</dt>
          <dd>{query.data.nickname}</dd>
          <dt>IP</dt>
          <dd>{query.data.last_ip}</dd>
          <dt>User-Agent</dt>
          <dd>{query.data.user_agent}</dd>
          <dt>{t("studio:createdAt")}</dt>
          <dd>{new Date(query.data.created_at).toLocaleString()}</dd>
          <dt>{t("studio:lastUsedAt")}</dt>
          <dd>{new Date(query.data.last_used_at).toLocaleString()}</dd>
        </dl>
      )}
    </StudioFrame>
  );
}
