import { RecordTable } from "../../shared/ui/RecordTable";
import { FilterMenu as AdminFilterMenu } from "../../shared/ui/FilterMenu";
import { SelectField } from "../../shared/ui/SelectField";
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
import {
  Alert,
  Button,
  Input,
  Tooltip,
  Modal,
  Pagination,
  type TableColumnsType,
} from "antd";
import { useRef, useState } from "react";
import { Eye, Pencil, Search } from "lucide-react";
import "./admin-list-controls.css";
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
import type {
  AdminUserData,
  LoginAuditData,
} from "../../shared/api/generated/types.gen";
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
  const { t, i18n } = useTranslation("studio");
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
  const columns: TableColumnsType<AdminUserData> = [
    {
      title: t("username"),
      dataIndex: "username",
      width: 160,
      ellipsis: true,
      render: (value: string, user) => (
        <Link to={`/admin/users/${user.id}`}>{value}</Link>
      ),
    },
    { title: t("nickname"), dataIndex: "nickname", width: 140, ellipsis: true },
    {
      title: t("role"),
      dataIndex: "role",
      width: 100,
      render: (value: string) => t(value),
    },
    {
      title: t("status"),
      dataIndex: "status",
      width: 100,
      render: (value: string) => t(value),
    },
    {
      title: t("email"),
      dataIndex: "email_masked",
      width: 200,
      ellipsis: true,
      render: (value: string | null) => value ?? "—",
    },
    {
      title: t("settings:phone"),
      dataIndex: "phone_masked",
      width: 160,
      ellipsis: true,
      render: (value: string | null) => value ?? "—",
    },
    {
      title: t("createdAt"),
      dataIndex: "created_at",
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(i18n.language),
    },
    {
      title: t("admin:lastLogin"),
      dataIndex: "last_login_at",
      width: 190,
      render: (value: string | null) =>
        value
          ? new Date(value).toLocaleString(i18n.language)
          : t("admin:neverLoggedIn"),
    },
    {
      title: t("admin:actions"),
      key: "actions",
      width: 128,
      fixed: "right",
      align: "center",
      render: (_, user) => (
        <div className="record-actions">
          <Tooltip title={t("admin:viewDetails")} trigger={["hover", "focus"]}>
            <Link
              className="record-action"
              aria-label={t("admin:viewDetails")}
              to={`/admin/users/${user.id}`}
            >
              <Eye aria-hidden size={16} />
            </Link>
          </Tooltip>
          <Tooltip
            title={t("admin:editNamed", { name: user.nickname })}
            trigger={["hover", "focus"]}
          >
            <Link
              className="record-action"
              aria-label={t("admin:editNamed", { name: user.nickname })}
              to={`/admin/users/${user.id}/edit`}
            >
              <Pencil aria-hidden size={16} />
            </Link>
          </Tooltip>
        </div>
      ),
    },
  ];
  return (
    <StudioFrame
      title={t("users")}
      actions={
        <Link className="studio-link-button" to="/admin/users/new">
          {t("admin:createUser")}
        </Link>
      }
    >
      <div className="admin-list-filters">
        <Input
          className="admin-list-search"
          aria-label={t("keyword")}
          placeholder={t("admin:searchUsers")}
          prefix={<Search aria-hidden size={16} />}
          value={q}
          onChange={(event) => change("q", event.target.value)}
        />
        <AdminFilterMenu
          label={t("role")}
          value={role ?? ""}
          onChange={(value) => change("role", value)}
          options={[
            { value: "", label: t("admin:allRoles") },
            { value: "user", label: t("user") },
            { value: "admin", label: t("admin") },
          ]}
        />
        <AdminFilterMenu
          label={t("status")}
          value={status ?? ""}
          onChange={(value) => change("status", value)}
          options={[
            { value: "", label: t("admin:allStatuses") },
            { value: "active", label: t("active") },
            { value: "disabled", label: t("disabled") },
          ]}
        />
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
          <RecordTable<AdminUserData>
            columns={columns}
            items={query.data.items}
            emptyText={t("admin:noUsers")}
          />
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
          <SelectField
            disabled={self}
            value={values.role}
            onValueChange={(value) =>
              setValues((previous) => ({
                ...previous,
                role: value as "user" | "admin",
              }))
            }
          >
            <option value="user">{t("user")}</option>
            <option value="admin">{t("admin")}</option>
          </SelectField>
        </label>
        {record ? (
          <label className="studio-field">
            {t("status")}
            <SelectField
              disabled={self}
              value={values.status}
              onValueChange={(value) =>
                setValues((previous) => ({
                  ...previous,
                  status: value as "active" | "disabled",
                }))
              }
            >
              <option value="active">{t("active")}</option>
              <option value="disabled">{t("disabled")}</option>
            </SelectField>
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
  const { t, i18n } = useTranslation(["studio", "admin"]);
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
  const columns: TableColumnsType<LoginAuditData> = [
    {
      title: t("username"),
      dataIndex: "username",
      width: 150,
      ellipsis: true,
      render: (value: string, item) => (
        <Link to={`/admin/audit/login/${item.id}`}>{value}</Link>
      ),
    },
    { title: t("nickname"), dataIndex: "nickname", width: 140, ellipsis: true },
    {
      title: t("admin:createdIp"),
      dataIndex: "created_ip",
      width: 160,
      ellipsis: true,
    },
    {
      title: t("admin:lastIp"),
      dataIndex: "last_ip",
      width: 160,
      ellipsis: true,
    },
    {
      title: t("admin:loginTime"),
      dataIndex: "created_at",
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(i18n.language),
    },
    {
      title: t("lastUsedAt"),
      dataIndex: "last_used_at",
      width: 190,
      render: (value: string) => new Date(value).toLocaleString(i18n.language),
    },
    {
      title: t("admin:sessionStatus"),
      key: "status",
      width: 140,
      render: (_, item) =>
        t(item.revoked_at ? "admin:revoked" : "admin:validSession"),
    },
    {
      title: t("admin:actions"),
      key: "actions",
      width: 100,
      fixed: "right",
      align: "center",
      render: (_, item) => (
        <Tooltip title={t("admin:details")} trigger={["hover", "focus"]}>
          <Link
            className="record-action"
            aria-label={t("admin:details")}
            to={`/admin/audit/login/${item.id}`}
          >
            <Eye aria-hidden size={16} />
          </Link>
        </Tooltip>
      ),
    },
  ];
  return (
    <StudioFrame title={t("admin:loginAuditTitle")}>
      <div className="admin-list-filters">
        <Input
          className="admin-list-search"
          aria-label={t("keyword")}
          placeholder={t("admin:searchLoginAudit")}
          prefix={<Search aria-hidden size={16} />}
          value={q}
          onChange={(event) =>
            setParams({ q: event.target.value, page: "1" }, { replace: true })
          }
        />
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <RecordTable<LoginAuditData>
            columns={columns}
            items={query.data.items}
            emptyText={t("admin:noAuditRecords")}
          />
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
