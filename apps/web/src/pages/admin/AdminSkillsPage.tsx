import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { Alert, Button, Input, Modal, Pagination, Skeleton } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listAdminSkillsRequest,
  quarantineSkillRequest,
  releaseSkillRequest,
} from "../../features/skills/skillsApi";

export function AdminSkillsPage() {
  const { t } = useTranslation("skills");
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [reason, setReason] = useState("POLICY_REVIEW");
  const query = useQuery({
    queryKey: ["admin", "skills", page, debouncedQ],
    queryFn: () =>
      listAdminSkillsRequest({ page, page_size: 50, q: debouncedQ }),
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["admin", "skills"] }),
      client.invalidateQueries({ queryKey: ["skills"] }),
    ]);
  const quarantine = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      quarantineSkillRequest(id, code),
    onSuccess: async () => {
      await refresh();
      setTarget(null);
    },
  });
  const release = useMutation({
    mutationFn: (id: string) => releaseSkillRequest(id, "REVIEW_COMPLETE"),
    onSuccess: refresh,
  });
  return (
    <main className="tool-page" aria-labelledby="admin-skills-title">
      <header className="tool-page-heading">
        <div>
          <span className="page-eyebrow">{t("adminEyebrow")}</span>
          <h1 id="admin-skills-title">{t("adminTitle")}</h1>
          <p>{t("adminDescription")}</p>
        </div>
      </header>
      <div className="studio-filter">
        <label>
          {t("studio:keyword")}
          <input
            value={q}
            onChange={(event) =>
              setParams(
                { tab: "security", q: event.target.value, page: "1" },
                { replace: true },
              )
            }
          />
        </label>
      </div>
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : query.isError ? (
        <Alert
          action={
            <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
          }
          showIcon
          title={t("metadataLoadFailed")}
          type="error"
        />
      ) : query.data.items.length === 0 ? (
        <section className="tool-empty">
          <ShieldCheck aria-hidden size={30} />
          <h2>{t("noAdminSkills")}</h2>
        </section>
      ) : (
        <RecordTable
          items={query.data.items}
          columns={[
            {
              title: t("studio:title"),
              dataIndex: "name",
              width: 220,
              ellipsis: true,
            },
            {
              title: t("studio:owner"),
              dataIndex: "owner_id",
              width: 220,
              ellipsis: true,
            },
            {
              title: t("studio:status"),
              dataIndex: "status",
              width: 140,
              render: (value: string) =>
                t(value === "quarantined" ? "quarantined" : "normal"),
            },
            {
              title: "SHA-256",
              dataIndex: "content_sha256",
              width: 250,
              ellipsis: true,
            },
            {
              title: t("studio:fileCount"),
              dataIndex: "file_count",
              width: 100,
            },
            {
              title: t("studio:sizeKiB"),
              dataIndex: "uncompressed_size",
              width: 120,
              render: (value: number) => Math.ceil(value / 1024),
            },
            {
              title: t("admin:actions"),
              key: "actions",
              width: 100,
              fixed: "right",
              align: "center",
              render: (_, item) =>
                item.status === "quarantined" ? (
                  <RowAction
                    label={t("release")}
                    icon={ShieldCheck}
                    loading={release.isPending}
                    onClick={() => release.mutate(item.id)}
                  />
                ) : (
                  <RowAction
                    label={t("quarantine")}
                    icon={ShieldAlert}
                    danger
                    onClick={() => setTarget({ id: item.id, name: item.name })}
                  />
                ),
            },
          ]}
        />
      )}
      <div className="studio-pagination">
        <Pagination
          current={page}
          pageSize={50}
          total={query.data?.total ?? 0}
          showSizeChanger={false}
          onChange={(value) =>
            setParams({ tab: "security", q, page: String(value) })
          }
        />
      </div>
      <Modal
        onCancel={() => setTarget(null)}
        onOk={() =>
          target && quarantine.mutate({ id: target.id, code: reason })
        }
        okButtonProps={{ danger: true }}
        okText={t("confirmQuarantine")}
        open={Boolean(target)}
        title={t("quarantineTitle")}
        confirmLoading={quarantine.isPending}
      >
        <p>{t("quarantineDescription", { name: target?.name })}</p>
        <label className="field-label" htmlFor="quarantine-reason">
          {t("reasonCode")}
        </label>
        <Input
          id="quarantine-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value.toUpperCase())}
        />
      </Modal>
    </main>
  );
}
