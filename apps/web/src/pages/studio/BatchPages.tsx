import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Pagination } from "antd";
import { useRef, useState } from "react";
import { useAuth } from "../../features/auth/useAuth";
import { useFormProtection } from "../../features/studio/useFormProtection";
import {
  clearFormDraft,
  parseFormDraft,
  readFormDraft,
} from "../../features/studio/formDrafts";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../shared/api/client";
import {
  controlAiBatch,
  createAiBatch,
  getAiBatch,
  listAiBatches,
  listAiProviderConfigs,
  listProjectDocuments,
  previewAiBatch,
} from "../../shared/api/generated/sdk.gen";
import type { BatchRequest } from "../../shared/api/generated/types.gen";
import {
  DraftNotice,
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";
import { orderedManuscripts } from "../../features/studio/orderedDocuments";

export function BatchListPage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = useQuery({
    queryKey: ["batches", projectId, page],
    queryFn: async () =>
      (
        await listAiBatches({
          client: apiClient,
          query: { project_id: projectId, page, page_size: 50 },
        })
      ).data.data,
    refetchInterval: 5000,
  });
  return (
    <StudioFrame
      title={t("batches")}
      back={`/projects/${projectId}/studio`}
      actions={
        <Link
          className="studio-link-button"
          to={`/projects/${projectId}/batches/new`}
        >
          {t("create")}
        </Link>
      }
    >
      <p className="studio-notice">{t("background")}</p>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <ul className="studio-list">
            {query.data.items.map((batch) => (
              <li key={batch.id}>
                <div>
                  <h2>
                    <Link to={`/projects/${projectId}/batches/${batch.id}`}>
                      {t(batch.task_type)}
                    </Link>
                  </h2>
                  <p>{t(batch.status)}</p>
                  <p>
                    {t("succeeded")}: {batch.counts.succeeded ?? 0} /{" "}
                    {batch.total}
                  </p>
                  <time>{new Date(batch.created_at).toLocaleString()}</time>
                </div>
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
              onChange={(value) => setParams({ page: String(value) })}
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}

export function BatchCreatePage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const { user } = useAuth();
  const draftKey = `xnovel:batch-draft:${user?.id}:${projectId}`;
  const [draft, setDraft] = useState(() => readFormDraft(draftKey));
  const submitted = useRef(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [ids, setIds] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [taskType, setTaskType] = useState<"summary" | "consistency">(
    "summary",
  );
  const [instruction, setInstruction] = useState("");
  const [useRecall, setUseRecall] = useState(false);
  const docs = useQuery({
    queryKey: ["batch-documents", projectId],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const providers = useQuery({
    queryKey: ["batch-providers"],
    queryFn: async () =>
      (
        await listAiProviderConfigs({
          client: apiClient,
          query: { page_size: 100 },
        })
      ).data.data,
  });
  const provider = providers.data?.items.find((item) => item.id === providerId);
  const documents = orderedManuscripts(docs.data?.items ?? []);
  const request: BatchRequest = {
    request_id: requestId,
    project_id: projectId,
    document_ids: ids,
    provider_config_id: providerId,
    model_id: modelId || provider?.default_model_id || null,
    task_type: taskType,
    instruction,
    use_recall: useRecall,
  };
  const preview = useMutation({
    mutationFn: async (body: BatchRequest) =>
      (await previewAiBatch({ client: apiClient, body })).data.data,
  });
  const create = useMutation({
    mutationFn: async (body: BatchRequest) =>
      (await createAiBatch({ client: apiClient, body })).data.data,
    onSuccess: (batch) => {
      submitted.current = true;
      clearFormDraft(draftKey);
      navigate(`/projects/${projectId}/batches/${batch.id}`);
    },
  });
  const stash = () =>
    sessionStorage.setItem(
      draftKey,
      JSON.stringify({
        ids,
        providerId,
        modelId,
        taskType,
        instruction,
        useRecall,
        requestId,
      }),
    );
  useFormProtection(
    () =>
      !submitted.current && Boolean(ids.length || instruction || providerId),
    async () => {
      stash();
      return true;
    },
    stash,
  );
  const reset = () => {
    setRequestId(crypto.randomUUID());
    preview.reset();
  };
  return (
    <StudioFrame title={t("batches")} back={`/projects/${projectId}/batches`}>
      <p className="studio-notice">{t("background")}</p>
      {draft ? (
        <DraftNotice
          onDiscard={() => {
            clearFormDraft(draftKey);
            setDraft(null);
          }}
          onRestore={() => {
            const data = parseFormDraft(draft);
            if (data) {
              if (
                Array.isArray(data.ids) &&
                data.ids.every((id) => typeof id === "string")
              )
                setIds(data.ids);
              if (typeof data.providerId === "string")
                setProviderId(data.providerId);
              if (typeof data.modelId === "string") setModelId(data.modelId);
              if (typeof data.instruction === "string")
                setInstruction(data.instruction);
              setTaskType(
                data.taskType === "consistency" ? "consistency" : "summary",
              );
              setUseRecall(data.useRecall === true);
            }
            setDraft(null);
          }}
        />
      ) : null}
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          preview.mutate(request);
        }}
      >
        <fieldset
          className="studio-form-fields"
          disabled={preview.isPending || create.isPending}
        >
          <label className="studio-field">
            {t("provider")}
            <select
              required
              value={providerId}
              onChange={(event) => {
                setProviderId(event.target.value);
                setModelId("");
                reset();
              }}
            >
              <option value="">—</option>
              {providers.data?.items
                .filter((item) => item.enabled)
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.display_name}
                  </option>
                ))}
            </select>
          </label>
          <label className="studio-field">
            {t("model")}
            <select
              value={modelId || provider?.default_model_id || ""}
              onChange={(event) => {
                setModelId(event.target.value);
                reset();
              }}
            >
              <option value="">—</option>
              {provider?.models.map((model) => (
                <option value={model.id} key={model.id}>
                  {model.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-field">
            {t("kind")}
            <select
              value={taskType}
              onChange={(event) => {
                setTaskType(event.target.value as "summary" | "consistency");
                reset();
              }}
            >
              <option value="summary">{t("summary")}</option>
              <option value="consistency">{t("consistency")}</option>
            </select>
          </label>
          <label className="studio-field">
            {t("instruction")}
            <textarea
              maxLength={2000}
              value={instruction}
              onChange={(event) => {
                setInstruction(event.target.value);
                reset();
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={useRecall}
              onChange={(event) => {
                setUseRecall(event.target.checked);
                reset();
              }}
            />{" "}
            {t("useRecall")}
          </label>
          <div className="studio-actions">
            <Button
              onClick={() => {
                setIds(documents.map((item) => item.id));
                reset();
              }}
            >
              {t("all")}
            </Button>
            <span>
              {ids.length} / {documents.length}
            </span>
          </div>
          <div className="studio-source-list">
            {documents.map((doc) => (
              <label key={doc.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(doc.id)}
                  onChange={(event) => {
                    const selected = event.target.checked
                      ? new Set([...ids, doc.id])
                      : new Set(ids.filter((id) => id !== doc.id));
                    setIds(
                      documents
                        .filter((item) => selected.has(item.id))
                        .map((item) => item.id),
                    );
                    reset();
                  }}
                />
                {doc.title}
              </label>
            ))}
          </div>
          <div>
            <Button
              htmlType="submit"
              loading={preview.isPending}
              disabled={!providerId || !ids.length}
            >
              {t("preview")}
            </Button>
          </div>
        </fieldset>
      </form>
      {providers.isError ||
      docs.isError ||
      preview.isError ||
      create.isError ? (
        <StudioError />
      ) : null}
      {preview.data ? (
        <section>
          <h2>{t("preview")}</h2>
          <p>
            {t("estimatedTokens", {
              count: preview.data.estimated_input_tokens,
            })}
          </p>
          <p>{t("segmented", { count: preview.data.segmented_documents })}</p>
          <p>{t("costUnknown")}</p>
          <ul>
            {preview.data.source_titles.map((title, index) => (
              <li key={index}>{title}</li>
            ))}
          </ul>
          <Button
            type="primary"
            loading={create.isPending}
            onClick={() => create.mutate(request)}
          >
            {t("startBatch")}
          </Button>
        </section>
      ) : null}
    </StudioFrame>
  );
}

export function BatchDetailPage() {
  const { projectId = "", batchId = "" } = useParams();
  const { t } = useTranslation("studio");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["batch", batchId],
    queryFn: async () =>
      (await getAiBatch({ client: apiClient, path: { batch_id: batchId } }))
        .data.data,
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const docs = useQuery({
    queryKey: ["batch-documents", projectId],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const control = useMutation({
    mutationFn: async (action: "cancel" | "resume" | "retry_failed") =>
      (
        await controlAiBatch({
          client: apiClient,
          path: { batch_id: batchId },
          body: { action },
        })
      ).data.data,
    onSuccess: () => client.invalidateQueries({ queryKey: ["batch", batchId] }),
  });
  return (
    <StudioFrame title={t("batches")} back={`/projects/${projectId}/batches`}>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <h2>
            {t(query.data.task_type)} · {t(query.data.status)}
          </h2>
          <p role="status">
            {(
              [
                "succeeded",
                "failed",
                "cancelled",
                "queued",
                "running",
                "stale",
              ] as const
            )
              .map(
                (status) =>
                  `${t(status)}: ${query.data.items.filter((item) => item.status === status).length}`,
              )
              .join(" · ")}
          </p>
          <p className="studio-notice">{t("retryNotice")}</p>
          <div className="studio-actions">
            {["queued", "running"].includes(query.data.status) ? (
              <Button
                onClick={() => control.mutate("cancel")}
                loading={control.isPending}
              >
                {t("cancel")}
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => control.mutate("resume")}
                  disabled={
                    !query.data.items.some((item) => item.status === "queued")
                  }
                  loading={control.isPending}
                >
                  {t("resume")}
                </Button>
                <Button
                  onClick={() => control.mutate("retry_failed")}
                  disabled={
                    !query.data.items.some((item) =>
                      ["failed", "stale"].includes(item.status),
                    )
                  }
                  loading={control.isPending}
                >
                  {t("retryFailed")}
                </Button>
              </>
            )}
          </div>
          {control.isError ? <StudioError /> : null}
          <ul className="studio-list">
            {query.data.items.map((item) => (
              <li key={item.id}>
                <div>
                  <h3>
                    {docs.data?.items.find((doc) => doc.id === item.document_id)
                      ?.title ?? t("missing")}
                  </h3>
                  <p>{t(item.status)}</p>
                  {item.error_code ? (
                    <Alert type="warning" title={t("requestFailed")} />
                  ) : null}
                </div>
                <div className="studio-actions">
                  {item.result_id ? (
                    <Link
                      className="studio-link-button"
                      to={
                        query.data.task_type === "summary"
                          ? `/projects/${projectId}/studio/summaries/${item.result_id}`
                          : `/projects/${projectId}/studio/issues?source=${item.document_id}`
                      }
                    >
                      {t("details")}
                    </Link>
                  ) : null}
                  {item.task_id ? (
                    <Link
                      to={`/projects/${projectId}/ai-history/${item.task_id}`}
                    >
                      {t("aiHistory")}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </StudioFrame>
  );
}
