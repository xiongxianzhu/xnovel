import { GitCompareArrows } from "lucide-react";
import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { compareText } from "@xnovel/text-diff";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Pagination } from "antd";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../shared/api/client";
import {
  createDocumentCheckpoint,
  getDocumentRevision,
  getProjectDocumentContent,
  listDocumentRevisions,
  restoreDocumentRevision,
} from "../../shared/api/generated/sdk.gen";
import {
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";

export function RevisionPage() {
  const { projectId = "", documentId = "" } = useParams();
  const { t } = useTranslation("studio");
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const selected = params.get("revision") ?? "";
  const [name, setName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const path = { project_id: projectId, document_id: documentId };
  const current = useQuery({
    queryKey: ["revision-current", documentId],
    queryFn: async () =>
      (await getProjectDocumentContent({ client: apiClient, path })).data.data,
  });
  const revisions = useQuery({
    queryKey: ["revisions", documentId, page],
    queryFn: async () =>
      (
        await listDocumentRevisions({
          client: apiClient,
          path,
          query: { page, page_size: 50 },
        })
      ).data.data,
  });
  const snapshot = useQuery({
    queryKey: ["revision", selected],
    enabled: Boolean(selected),
    queryFn: async () =>
      (
        await getDocumentRevision({
          client: apiClient,
          path: { ...path, revision_id: selected },
        })
      ).data.data,
  });
  const refresh = async () => {
    await client.invalidateQueries({
      predicate: (query) =>
        query.queryKey.includes(projectId) ||
        query.queryKey.includes(documentId) ||
        query.queryKey.includes(selected) ||
        query.queryKey[0] === "projects",
    });
    setConfirm(false);
  };
  const checkpoint = useMutation({
    mutationFn: async () =>
      (
        await createDocumentCheckpoint({
          client: apiClient,
          path,
          body: { name, version: current.data!.version },
        })
      ).data.data,
    onSuccess: async () => {
      setName("");
      await refresh();
    },
  });
  const restore = useMutation({
    mutationFn: async () =>
      (
        await restoreDocumentRevision({
          client: apiClient,
          path: { ...path, revision_id: selected },
          body: { version: current.data!.version },
        })
      ).data.data,
    onSuccess: refresh,
  });
  return (
    <StudioFrame
      title={t("history")}
      back={`/projects/${projectId}?document=${documentId}`}
    >
      <p className="studio-notice">{t("retention")}</p>
      <form
        className="studio-filter"
        onSubmit={(event) => {
          event.preventDefault();
          checkpoint.mutate();
        }}
      >
        <fieldset
          className="studio-form-fields"
          disabled={checkpoint.isPending || restore.isPending}
        >
          <label>
            {t("checkpointName")}
            <input
              value={name}
              required
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <Button
            htmlType="submit"
            disabled={!current.data || !name.trim()}
            loading={checkpoint.isPending}
          >
            {t("checkpoint")}
          </Button>
        </fieldset>
      </form>
      {checkpoint.isError || restore.isError || current.isError ? (
        <StudioError />
      ) : null}
      {revisions.isPending ? (
        <StudioLoading />
      ) : revisions.isError ? (
        <StudioError />
      ) : (
        <>
          <RecordTable
            items={revisions.data.items}
            columns={[
              {
                title: t("checkpointName"),
                dataIndex: "checkpoint_name",
                width: 240,
                ellipsis: true,
                render: (value: string | null) => value || t("autoSnapshot"),
              },
              { title: t("version"), dataIndex: "version", width: 100 },
              { title: t("wordCount"), dataIndex: "word_count", width: 120 },
              {
                title: t("createdAt"),
                dataIndex: "created_at",
                width: 190,
                render: (value: string) => new Date(value).toLocaleString(),
              },
              {
                title: t("admin:actions"),
                key: "actions",
                width: 88,
                fixed: "right",
                align: "center",
                render: (_, row) => (
                  <RowAction
                    label={t("compare")}
                    icon={GitCompareArrows}
                    onClick={() =>
                      setParams({ page: String(page), revision: row.id })
                    }
                  />
                ),
              },
            ]}
          />
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={revisions.data.total}
              showSizeChanger={false}
              onChange={(value) =>
                setParams({
                  page: String(value),
                  ...(selected ? { revision: selected } : {}),
                })
              }
            />
          </div>
        </>
      )}
      {snapshot.isError ? (
        <StudioError />
      ) : snapshot.data && current.data ? (
        <>
          <div className="studio-compare">
            <section>
              <h2>
                {t("oldText")} · v{snapshot.data.version}
              </h2>
              <RevisionComparison
                before={snapshot.data.content}
                after={current.data.content}
                side="before"
              />
            </section>
            <section>
              <h2>
                {t("currentText")} · v{current.data.version}
              </h2>
              <RevisionComparison
                before={snapshot.data.content}
                after={current.data.content}
                side="after"
              />
            </section>
          </div>
          <div className="studio-actions">
            <Button danger onClick={() => setConfirm(true)}>
              {t("restore")}
            </Button>
            <Link to={`/projects/${projectId}?document=${documentId}`}>
              {t("writing")}
            </Link>
          </div>
        </>
      ) : null}
      <Modal
        open={confirm}
        title={t("restore")}
        onCancel={() => setConfirm(false)}
        onOk={() => restore.mutate()}
        confirmLoading={restore.isPending}
        okText={t("restore")}
        cancelText={t("cancel")}
      >
        <Alert type="warning" title={t("restoreConfirm")} />
      </Modal>
    </StudioFrame>
  );
}

export function RevisionComparison({
  before,
  after,
  side,
}: {
  before: string;
  after: string;
  side: "before" | "after";
}) {
  const comparison = compareText(before, after);
  const lines = side === "before" ? comparison.before : comparison.after;
  return (
    <pre>
      {lines.map((line, index) => (
        <span key={index}>
          {line.kind === "removed" ? (
            <del>{line.text || " "}</del>
          ) : line.kind === "added" ? (
            <ins>{line.text || " "}</ins>
          ) : (
            line.text
          )}
          {index < lines.length - 1 ? "\n" : ""}
        </span>
      ))}
    </pre>
  );
}
