import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Skeleton,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import { Pencil, Plus, UserRoundCheck, UserRoundX } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  AdminUserCreateRequestWritable,
  AdminUserData,
  AdminUserUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { useAuth } from "../../features/auth/useAuth";
import {
  createUserRequest,
  disableUserRequest,
  listUsersRequest,
  updateUserRequest,
} from "../../features/admin/adminApi";
import { useDebouncedValue } from "../../features/admin/useDebouncedValue";

const PAGE_SIZE = 50;

export function AdminUsersPage() {
  const { t } = useTranslation("admin");
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"user" | "admin" | undefined>();
  const [status, setStatus] = useState<"active" | "disabled" | undefined>();
  const [editing, setEditing] = useState<AdminUserData | "create" | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  const queryKey = [
    "admin",
    "users",
    { page, query: debouncedSearch, role, status },
  ] as const;
  const users = useQuery({
    queryKey,
    queryFn: () =>
      listUsersRequest({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        query: debouncedSearch || undefined,
        role,
        status,
      }),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
  const createMutation = useMutation({
    mutationFn: createUserRequest,
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: AdminUserUpdateRequest;
    }) => updateUserRequest(id, values),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const disableMutation = useMutation({
    mutationFn: disableUserRequest,
    onSuccess: refresh,
  });

  const columns: TableColumnsType<AdminUserData> = [
    {
      title: t("account"),
      dataIndex: "username",
      key: "account",
      width: 220,
      render: (_, record) => (
        <div className="admin-account-cell">
          <strong title={record.nickname}>{record.nickname}</strong>
          <span title={record.username}>@{record.username}</span>
        </div>
      ),
    },
    {
      title: t("contact"),
      key: "contact",
      width: 240,
      render: (_, record) => (
        <div className="admin-contact-cell">
          <span>{record.email_masked ?? t("notSet")}</span>
          <span>{record.phone_masked ?? t("notSet")}</span>
        </div>
      ),
    },
    {
      title: t("role"),
      dataIndex: "role",
      width: 110,
      render: (value: AdminUserData["role"]) => (
        <Tag>{value === "admin" ? t("administrator") : t("writer")}</Tag>
      ),
    },
    {
      title: t("status"),
      dataIndex: "status",
      width: 110,
      render: (value: AdminUserData["status"]) => (
        <span
          className={`status-label ${value === "disabled" ? "status-danger" : ""}`}
        >
          {value === "active" ? t("active") : t("disabled")}
        </span>
      ),
    },
    {
      title: t("lastLogin"),
      dataIndex: "last_login_at",
      width: 180,
      render: (value: string | null) =>
        value ? new Date(value).toLocaleString() : t("neverLoggedIn"),
    },
    {
      title: t("actions"),
      key: "actions",
      fixed: "right",
      align: "center",
      width: 144,
      render: (_, record) => (
        <div className="admin-row-actions">
          <Button
            aria-label={t("editNamed", { name: record.nickname })}
            icon={<Pencil aria-hidden size={16} />}
            onClick={() => setEditing(record)}
            type="text"
          />
          {record.status === "active" ? (
            <Popconfirm
              description={t("disableDescription")}
              disabled={record.id === currentUser?.id}
              okButtonProps={{ danger: true }}
              okText={t("disable")}
              onConfirm={() => disableMutation.mutate(record.id)}
              title={t("disableNamed", { name: record.nickname })}
            >
              <Button
                aria-label={t("disableNamed", { name: record.nickname })}
                danger
                disabled={record.id === currentUser?.id}
                icon={<UserRoundX aria-hidden size={16} />}
                type="text"
              />
            </Popconfirm>
          ) : (
            <Button
              aria-label={t("restoreNamed", { name: record.nickname })}
              icon={<UserRoundCheck aria-hidden size={16} />}
              loading={updateMutation.isPending}
              onClick={() =>
                updateMutation.mutate({
                  id: record.id,
                  values: { status: "active" },
                })
              }
              type="text"
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <main className="admin-page" aria-labelledby="admin-users-title">
      <header className="admin-page-heading">
        <div>
          <h1 id="admin-users-title">{t("usersTitle")}</h1>
          <p>{t("usersDescription")}</p>
        </div>
        <Button
          icon={<Plus aria-hidden size={17} />}
          onClick={() => setEditing("create")}
          type="primary"
        >
          {t("createUser")}
        </Button>
      </header>
      <section aria-label={t("filters")} className="admin-filters">
        <Input.Search
          allowClear
          aria-label={t("searchUsers")}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={t("searchUsers")}
          value={search}
        />
        <Select
          allowClear
          aria-label={t("filterRole")}
          onChange={(value) => {
            setRole(value);
            setPage(1);
          }}
          options={[
            { label: t("administrator"), value: "admin" },
            { label: t("writer"), value: "user" },
          ]}
          placeholder={t("allRoles")}
          value={role}
        />
        <Select
          allowClear
          aria-label={t("filterStatus")}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          options={[
            { label: t("active"), value: "active" },
            { label: t("disabled"), value: "disabled" },
          ]}
          placeholder={t("allStatuses")}
          value={status}
        />
      </section>
      {users.isPending ? (
        <Skeleton active paragraph={{ rows: 7 }} />
      ) : users.isError ? (
        <Alert
          action={
            <Button onClick={() => void users.refetch()}>{t("retry")}</Button>
          }
          showIcon
          title={t("usersLoadFailed")}
          type="error"
        />
      ) : (
        <div className="admin-table-shell">
          <Table
            columns={columns}
            dataSource={users.data.items}
            locale={{ emptyText: t("noUsers") }}
            pagination={{
              current: page,
              onChange: setPage,
              pageSize: PAGE_SIZE,
              position: ["bottomRight"],
              showQuickJumper: true,
              showSizeChanger: false,
              total: users.data.total,
            }}
            rowKey="id"
            scroll={{ x: 1000 }}
          />
        </div>
      )}
      <UserEditorModal
        currentUserId={currentUser?.id}
        editing={editing}
        loading={createMutation.isPending || updateMutation.isPending}
        onCancel={() => setEditing(null)}
        onCreate={(values) => createMutation.mutate(values)}
        onUpdate={(id, values) => updateMutation.mutate({ id, values })}
        saveError={createMutation.isError || updateMutation.isError}
      />
    </main>
  );
}

type UserFormValues = AdminUserCreateRequestWritable & AdminUserUpdateRequest;

function UserEditorModal({
  currentUserId,
  editing,
  loading,
  onCancel,
  onCreate,
  onUpdate,
  saveError,
}: {
  currentUserId?: string;
  editing: AdminUserData | "create" | null;
  loading: boolean;
  onCancel: () => void;
  onCreate: (values: AdminUserCreateRequestWritable) => void;
  onUpdate: (id: string, values: AdminUserUpdateRequest) => void;
  saveError: boolean;
}) {
  const { t } = useTranslation("admin");
  const [form] = Form.useForm<UserFormValues>();
  const creating = editing === "create";
  const protectingSelf =
    editing !== null && editing !== "create" && editing.id === currentUserId;

  return (
    <Modal
      afterOpenChange={(open) => {
        if (!open) return;
        form.resetFields();
        if (editing && editing !== "create") {
          form.setFieldsValue({
            nickname: editing.nickname,
            role: editing.role,
            status: editing.status,
            username: editing.username,
          });
        }
      }}
      confirmLoading={loading}
      okText={creating ? t("create") : t("save")}
      onCancel={onCancel}
      onOk={() => void form.submit()}
      open={editing !== null}
      title={creating ? t("createUser") : t("editUser")}
    >
      {saveError ? (
        <Alert showIcon title={t("userSaveFailed")} type="error" />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          if (creating) {
            onCreate(values);
          } else if (editing) {
            onUpdate(editing.id, {
              ...(values.email ? { email: values.email } : {}),
              nickname: values.nickname,
              role: values.role,
              status: values.status,
              username: values.username,
            });
          }
        }}
      >
        <Form.Item
          label={t("username")}
          name="username"
          rules={[{ required: true }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item
          label={t("nickname")}
          name="nickname"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          extra={
            creating
              ? undefined
              : t("currentEmail", {
                  value:
                    editing && typeof editing === "object"
                      ? (editing.email_masked ?? t("notSet"))
                      : t("notSet"),
                })
          }
          label={creating ? t("email") : t("newEmail")}
          name="email"
          rules={[{ type: "email" }]}
        >
          <Input autoComplete="off" />
        </Form.Item>
        {creating ? (
          <>
            <Form.Item
              extra={t("temporaryPasswordHint")}
              label={t("temporaryPassword")}
              name="password"
              rules={[
                { max: 32, min: 8, required: true },
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
                      : Promise.reject(new Error(t("temporaryPasswordRules")));
                  },
                },
              ]}
            >
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </>
        ) : null}
        <Form.Item label={t("role")} name="role" rules={[{ required: true }]}>
          <Select
            disabled={protectingSelf}
            options={[
              { label: t("writer"), value: "user" },
              { label: t("administrator"), value: "admin" },
            ]}
          />
        </Form.Item>
        {!creating ? (
          <Form.Item
            label={t("status")}
            name="status"
            rules={[{ required: true }]}
          >
            <Select
              disabled={protectingSelf}
              options={[
                { label: t("active"), value: "active" },
                { label: t("disabled"), value: "disabled" },
              ]}
            />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
