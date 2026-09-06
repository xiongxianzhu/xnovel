import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { Eye } from "lucide-react";
import { SelectField } from "../../shared/ui/SelectField";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Modal, Pagination } from "antd";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../shared/api/client";
import {
  applyAiResult,
  retryAiTask,
  listProjects,
  listProjectDocuments,
  getAiTask,
  getProjectDocumentContent,
  listAiResultHistory,
  listAiTaskHistory,
  pinAiResult,
} from "../../shared/api/generated/sdk.gen";
import type { AiResultData } from "../../shared/api/generated/types.gen";
import { loadEditorDraft } from "../../features/editor/draftStorage";
import { useAuth } from "../../features/auth/useAuth";
import {
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";

export function AiHistoryPage() {
  const { projectId = "", taskId } = useParams();
  return taskId ? (
    <AiTaskDetail key={taskId} projectId={projectId} taskId={taskId} />
  ) : (
    <AiHistoryList projectId={projectId} />
  );
}

function AiHistoryList({ projectId }: { projectId: string }) {
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const favorites = params.get("favorites") === "true";
  const results = params.get("view") === "results";
  const base = projectId ? `/projects/${projectId}/ai-history` : "/ai/history";
  const filterProject = projectId || params.get("project") || undefined;
  const filterDocument = params.get("document") || undefined;
  const filterType = params.get("type") || undefined;
  const filterStatus = params.get("status") || undefined;
  const from = params.get("from") || "";
  const until = params.get("until") || "";
  const filters = {
    project_id: filterProject,
    document_id: filterDocument,
    task_type: filterType,
    status: filterStatus,
    created_from: dateBoundary(from),
    created_to: dateBoundary(until, true),
  };
  const projects = useQuery({
    queryKey: ["history-project-options"],
    enabled: !projectId,
    queryFn: async () =>
      (await listProjects({ client: apiClient, query: { page_size: 100 } }))
        .data.data,
  });
  const docs = useQuery({
    queryKey: ["history-doc-options", filterProject],
    enabled: Boolean(filterProject),
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: filterProject! },
        })
      ).data.data,
  });
  const changeFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    next.set("page", "1");
    if (key === "project") next.delete("document");
    setParams(next, { replace: true });
  };

  const tasks = useQuery({
    queryKey: ["ai-task-history", filters, debouncedQ, page],
    enabled: !results,
    queryFn: async () =>
      (
        await listAiTaskHistory({
          client: apiClient,
          query: { ...filters, q: debouncedQ, page, page_size: 50 },
        })
      ).data.data,
  });
  const candidates = useQuery({
    queryKey: ["ai-result-history", filters, debouncedQ, page, favorites],
    enabled: results,
    queryFn: async () =>
      (
        await listAiResultHistory({
          client: apiClient,
          query: {
            ...filters,
            q: debouncedQ,
            page,
            page_size: 50,
            pinned: favorites ? true : undefined,
          },
        })
      ).data.data,
  });
  const active = results ? candidates : tasks;
  return (
    <StudioFrame
      title={t("aiHistory")}
      back={projectId ? `/projects/${projectId}/studio` : "/ai-models"}
    >
      <p className="studio-notice">{t("aiRetention")}</p>
      <div className="studio-actions">
        <Button
          type={!results ? "primary" : "default"}
          onClick={() => setParams({ view: "tasks" })}
        >
          {t("tasks")}
        </Button>
        <Button
          type={results ? "primary" : "default"}
          onClick={() => setParams({ view: "results" })}
        >
          {t("candidate")}
        </Button>
      </div>
      <div className="studio-filter">
        {!projectId ? (
          <label>
            {t("project")}
            <SelectField
              value={filterProject ?? ""}
              onValueChange={(value) => changeFilter("project", value)}
            >
              <option value="">{t("all")}</option>
              {projects.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </SelectField>
          </label>
        ) : null}
        <label>
          {t("chooseChapter")}
          <SelectField
            value={filterDocument ?? ""}
            onValueChange={(value) => changeFilter("document", value)}
          >
            <option value="">{t("all")}</option>
            {docs.data?.items
              .filter((item) => item.kind !== "folder")
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </SelectField>
        </label>
        <label>
          {t("kind")}
          <SelectField
            value={filterType ?? ""}
            onValueChange={(value) => changeFilter("type", value)}
          >
            <option value="">{t("all")}</option>
            {[
              "brainstorm",
              "outline",
              "rewrite",
              "expand",
              "compress",
              "summary",
              "consistency",
              "extract_settings",
            ].map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          {t("status")}
          <SelectField
            value={filterStatus ?? ""}
            onValueChange={(value) => changeFilter("status", value)}
          >
            <option value="">{t("all")}</option>
            {(results
              ? ["candidate", "applied", "accepted", "rejected"]
              : ["queued", "running", "succeeded", "failed", "cancelled"]
            ).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          {t("fromDate")}
          <input
            type="date"
            value={from}
            onChange={(event) => changeFilter("from", event.target.value)}
          />
        </label>
        <label>
          {t("toDate")}
          <input
            type="date"
            value={until}
            min={from || undefined}
            onChange={(event) => changeFilter("until", event.target.value)}
          />
        </label>
        <label>
          {t("keyword")}
          <input
            value={q}
            onChange={(event) => changeFilter("q", event.target.value)}
          />
        </label>
        {results ? (
          <label>
            <span>{t("favorites")}</span>
            <input
              type="checkbox"
              checked={favorites}
              onChange={(event) =>
                changeFilter("favorites", String(event.target.checked))
              }
            />
          </label>
        ) : null}
      </div>
      {active.isPending ? (
        <StudioLoading />
      ) : active.isError ? (
        <StudioError />
      ) : (
        <>
          {results ? (
            <RecordTable
              items={candidates.data?.items ?? []}
              columns={[
                {
                  title: t("kind"),
                  dataIndex: "task_type",
                  width: 170,
                  render: (value: string) => t(value),
                },
                {
                  title: t("status"),
                  dataIndex: "status",
                  width: 140,
                  render: (value: string) => t(value),
                },
                {
                  title: t("body"),
                  dataIndex: "excerpt",
                  width: 420,
                  ellipsis: true,
                },
                {
                  title: t("favorites"),
                  dataIndex: "pinned",
                  width: 100,
                  render: (value: boolean) => t(value ? "yes" : "no"),
                },
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
                      label={t("details")}
                      icon={Eye}
                      to={`${base}/${row.task_id}`}
                    />
                  ),
                },
              ]}
            />
          ) : (
            <RecordTable
              items={tasks.data?.items ?? []}
              columns={[
                {
                  title: t("kind"),
                  dataIndex: "task_type",
                  width: 170,
                  render: (value: string) => t(value),
                },
                {
                  title: t("status"),
                  dataIndex: "status",
                  width: 140,
                  render: (value: string) => t(value),
                },
                {
                  title: t("provider"),
                  dataIndex: "provider",
                  width: 180,
                  ellipsis: true,
                },
                {
                  title: t("model"),
                  dataIndex: "model",
                  width: 220,
                  ellipsis: true,
                },
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
                      label={t("details")}
                      icon={Eye}
                      to={`${base}/${row.id}`}
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
              total={active.data?.total ?? 0}
              showSizeChanger={false}
              showQuickJumper
              onChange={(value) =>
                setParams({
                  ...Object.fromEntries(params),
                  page: String(value),
                })
              }
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}

function AiTaskDetail({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const { t } = useTranslation("studio");
  const { user } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [retryConfirm, setRetryConfirm] = useState(false);
  const [applying, setApplying] = useState<AiResultData>();
  const [copyError, setCopyError] = useState(false);
  const task = useQuery({
    queryKey: ["ai-history-task", taskId],
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
    queryFn: async () =>
      (await getAiTask({ client: apiClient, path: { task_id: taskId } })).data
        .data,
  });
  const targetProject = task.data?.project_id ?? projectId;
  const documentId = task.data?.document_id ?? "";
  const document = useQuery({
    queryKey: ["history-current-document", documentId],
    enabled: Boolean(documentId),
    queryFn: async () =>
      (
        await getProjectDocumentContent({
          client: apiClient,
          path: { project_id: targetProject, document_id: documentId },
        })
      ).data.data,
  });
  const storedDraft =
    user && documentId
      ? loadEditorDraft(user.id, targetProject, documentId)
      : null;
  const hasDraft = Boolean(
    storedDraft && storedDraft.content !== document.data?.content,
  );
  const stale = Boolean(
    task.data &&
    document.data &&
    task.data.context_manifest.document_version !== document.data.version,
  );
  const retry = useMutation({
    mutationFn: async () =>
      (await retryAiTask({ client: apiClient, path: { task_id: taskId } })).data
        .data,
    onSuccess: (next) => {
      setRetryConfirm(false);
      navigate(
        projectId
          ? `/projects/${projectId}/ai-history/${next.id}`
          : `/ai/history/${next.id}`,
      );
    },
  });
  const selectedText = Boolean(task.data?.context_manifest.selected_text);
  const pin = useMutation({
    mutationFn: async (result: AiResultData) =>
      (
        await pinAiResult({
          client: apiClient,
          path: { result_id: result.id },
          body: { pinned: !result.pinned },
        })
      ).data.data,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["ai-history-task", taskId] }),
  });
  const apply = useMutation({
    mutationFn: async () =>
      (
        await applyAiResult({
          client: apiClient,
          path: { result_id: applying!.id },
          body: {
            document_id: documentId,
            version: document.data!.version,
            content: applying!.content,
          },
        })
      ).data.data,
    onSuccess: async () => {
      setApplying(undefined);
      await client.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes(targetProject) ||
          query.queryKey.includes(documentId) ||
          query.queryKey.includes(taskId) ||
          query.queryKey[0] === "projects",
      });
    },
  });
  return (
    <StudioFrame
      title={t("aiHistory")}
      back={projectId ? `/projects/${projectId}/ai-history` : "/ai/history"}
    >
      {task.isPending ? (
        <StudioLoading />
      ) : task.isError ? (
        <StudioError />
      ) : (
        <>
          <dl className="studio-meta">
            <dt>{t("status")}</dt>
            <dd>{t(task.data.status)}</dd>
            <dt>{t("model")}</dt>
            <dd>{task.data.model}</dd>
            <dt>{t("inputTokens")}</dt>
            <dd>{task.data.input_tokens ?? t("unknown")}</dd>
            <dt>{t("outputTokens")}</dt>
            <dd>{task.data.output_tokens ?? t("unknown")}</dd>
          </dl>
          {stale || hasDraft ? (
            <Alert type="warning" title={t(stale ? "stale" : "draft")} />
          ) : null}
          {selectedText ? (
            <p className="studio-notice">{t("selectionCopyOnly")}</p>
          ) : null}
          {pin.isError || apply.isError || retry.isError || copyError ? (
            <StudioError />
          ) : null}
          {!selectedText &&
          task.data.project_id &&
          !["queued", "running"].includes(task.data.status) ? (
            <Button onClick={() => setRetryConfirm(true)}>
              {t("retryTask")}
            </Button>
          ) : null}
          {(task.data.results ?? []).map((result) => (
            <section key={result.id}>
              <h2>{t(result.status)}</h2>
              <pre className="studio-record-body">{result.content}</pre>
              <div className="studio-actions">
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(result.content)
                      .catch(() => setCopyError(true))
                  }
                >
                  {t("copy")}
                </Button>
                <Button
                  loading={pin.isPending}
                  onClick={() => pin.mutate(result)}
                >
                  {t(result.pinned ? "unpin" : "pin")}
                </Button>
                {result.purpose === "manuscript" &&
                result.status === "candidate" ? (
                  <Button
                    disabled={
                      !document.data || stale || hasDraft || selectedText
                    }
                    onClick={() => setApplying(result)}
                  >
                    {t("apply")}
                  </Button>
                ) : null}
              </div>
            </section>
          ))}
        </>
      )}
      <Modal
        open={Boolean(applying)}
        title={t("apply")}
        okText={t("apply")}
        cancelText={t("cancel")}
        confirmLoading={apply.isPending}
        onOk={() => apply.mutate()}
        onCancel={() => setApplying(undefined)}
      >
        {t("applyConfirm")}
      </Modal>
      <Modal
        open={retryConfirm}
        title={t("retryTask")}
        okText={t("retryTask")}
        cancelText={t("cancel")}
        confirmLoading={retry.isPending}
        onOk={() => retry.mutate()}
        onCancel={() => setRetryConfirm(false)}
      >
        {t("retryNotice")}
      </Modal>
    </StudioFrame>
  );
}

function dateBoundary(value: string, end = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(value + "T00:00:00");
  if (!Number.isFinite(date.getTime())) return undefined;
  if (end) date.setDate(date.getDate() + 1);
  return date.toISOString();
}
