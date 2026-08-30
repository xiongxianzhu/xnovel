import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Input, Modal, Skeleton, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import { Eye } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listLoginAuditsRequest,
  listOperationAuditsRequest,
} from "../../features/admin/adminApi";
import { useDebouncedValue } from "../../features/admin/useDebouncedValue";
import type {
  LoginAuditData,
  OperationAuditData,
} from "../../shared/api/generated/types.gen";

const PAGE_SIZE = 50;

export function AdminLoginAuditPage() {
  return <AdminAuditPage mode="login" />;
}

export function AdminOperationAuditPage() {
  return <AdminAuditPage mode="operations" />;
}

function AdminAuditPage({ mode }: { mode: "login" | "operations" }) {
  const { t } = useTranslation("admin");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<
    LoginAuditData | OperationAuditData | null
  >(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  const loginQuery = useQuery({
    enabled: mode === "login",
    queryKey: ["admin", "audit", "login", { page, query: debouncedSearch }],
    queryFn: () =>
      listLoginAuditsRequest({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        query: debouncedSearch || undefined,
      }),
  });
  const operationsQuery = useQuery({
    enabled: mode === "operations",
    queryKey: [
      "admin",
      "audit",
      "operations",
      { action: debouncedSearch, page },
    ],
    queryFn: () =>
      listOperationAuditsRequest({
        action: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  });
  const query = mode === "login" ? loginQuery : operationsQuery;
  const data = mode === "login" ? loginQuery.data : operationsQuery.data;
  const columns =
    mode === "login"
      ? loginColumns(t, setDetail)
      : operationColumns(t, setDetail);

  return (
    <main className="admin-page" aria-labelledby={`admin-${mode}-audit-title`}>
      <header className="admin-page-heading">
        <div>
          <h1 id={`admin-${mode}-audit-title`}>
            {mode === "login" ? t("loginAuditTitle") : t("operationAuditTitle")}
          </h1>
          <p>
            {mode === "login"
              ? t("loginAuditDescription")
              : t("operationAuditDescription")}
          </p>
        </div>
        <Tag>{t("readOnly")}</Tag>
      </header>
      <section aria-label={t("filters")} className="admin-filters">
        <Input.Search
          allowClear
          aria-label={
            mode === "login" ? t("searchLoginAudit") : t("searchOperationAudit")
          }
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder={
            mode === "login" ? t("searchLoginAudit") : t("searchOperationAudit")
          }
          value={search}
        />
      </section>
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 7 }} />
      ) : query.isError ? (
        <Alert
          action={
            <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
          }
          showIcon
          title={t("auditLoadFailed")}
          type="error"
        />
      ) : (
        <div className="admin-table-shell">
          <Table<LoginAuditData | OperationAuditData>
            columns={
              columns as TableColumnsType<LoginAuditData | OperationAuditData>
            }
            dataSource={data?.items ?? []}
            locale={{ emptyText: t("noAuditRecords") }}
            pagination={{
              current: page,
              onChange: setPage,
              pageSize: PAGE_SIZE,
              position: ["bottomRight"],
              showQuickJumper: true,
              showSizeChanger: false,
              total: data?.total ?? 0,
            }}
            rowKey="id"
            scroll={{ x: mode === "login" ? 1040 : 900 }}
          />
        </div>
      )}
      <AuditDetailModal detail={detail} onCancel={() => setDetail(null)} />
    </main>
  );
}

function loginColumns(
  t: ReturnType<typeof useTranslation>["t"],
  setDetail: (value: LoginAuditData) => void,
): TableColumnsType<LoginAuditData> {
  return [
    {
      title: t("account"),
      dataIndex: "username",
      width: 190,
      render: (_, record) => (
        <div className="admin-account-cell">
          <strong>{record.nickname}</strong>
          <span>@{record.username}</span>
        </div>
      ),
    },
    { title: t("createdIp"), dataIndex: "created_ip", width: 160 },
    { title: t("lastIp"), dataIndex: "last_ip", width: 160 },
    {
      title: t("sessionStatus"),
      key: "status",
      width: 130,
      render: (_, record) => (
        <span
          className={`status-label ${record.revoked_at ? "status-danger" : ""}`}
        >
          {record.revoked_at ? t("revoked") : t("validSession")}
        </span>
      ),
    },
    {
      title: t("loginTime"),
      dataIndex: "created_at",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    detailColumn(t, setDetail),
  ];
}

function operationColumns(
  t: ReturnType<typeof useTranslation>["t"],
  setDetail: (value: OperationAuditData) => void,
): TableColumnsType<OperationAuditData> {
  return [
    {
      title: t("actor"),
      key: "actor",
      width: 170,
      render: (_, record) => record.admin_username ?? t("systemActor"),
    },
    { title: t("action"), dataIndex: "action", width: 250, ellipsis: true },
    { title: t("targetType"), dataIndex: "target_type", width: 150 },
    {
      title: t("targetId"),
      dataIndex: "target_id",
      width: 230,
      ellipsis: true,
    },
    {
      title: t("operationTime"),
      dataIndex: "created_at",
      width: 180,
      render: (value: string) => new Date(value).toLocaleString(),
    },
    detailColumn(t, setDetail),
  ];
}

function detailColumn<T extends LoginAuditData | OperationAuditData>(
  t: ReturnType<typeof useTranslation>["t"],
  setDetail: (value: T) => void,
) {
  return {
    align: "center" as const,
    fixed: "right" as const,
    key: "details",
    render: (_: unknown, record: T) => (
      <Button
        aria-label={t("viewDetails")}
        icon={<Eye aria-hidden size={16} />}
        onClick={() => setDetail(record)}
        type="text"
      />
    ),
    title: t("details"),
    width: 88,
  };
}

function AuditDetailModal({
  detail,
  onCancel,
}: {
  detail: LoginAuditData | OperationAuditData | null;
  onCancel: () => void;
}) {
  const { t } = useTranslation("admin");
  return (
    <Modal
      footer={null}
      onCancel={onCancel}
      open={detail !== null}
      title={t("auditDetails")}
    >
      {detail ? (
        <dl className="admin-detail-list">
          {Object.entries(detail).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                {typeof value === "object" && value !== null
                  ? JSON.stringify(value, null, 2)
                  : String(value ?? "-")}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Modal>
  );
}
