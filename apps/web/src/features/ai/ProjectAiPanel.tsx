import { Alert, Button, Checkbox, Input, Modal, Select, Skeleton } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, Send, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DocumentSummary } from "../../shared/api/generated/types.gen";
import { streamSse } from "../../shared/api/sse";
import { documentContentQueryKey } from "../editor/editorState";
import { listSkillsRequest } from "../skills/skillsApi";
import {
  applyAiResultRequest,
  cancelAiTaskRequest,
  createAiTaskRequest,
  getAiTaskRequest,
  listProviderConfigsRequest,
  rejectAiResultRequest,
} from "./aiApi";

type PanelStatus =
  "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export function ProjectAiPanel({
  document,
  editorBlocked = false,
  onClose,
  open,
  projectId,
}: {
  document?: DocumentSummary;
  editorBlocked?: boolean;
  onClose: () => void;
  open: boolean;
  projectId: string;
}) {
  const { t } = useTranslation("ai");
  const client = useQueryClient();
  const closeRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [providerId, setProviderId] = useState<string>();
  const [modelId, setModelId] = useState<string>();
  const [taskType, setTaskType] = useState("brainstorm");
  const [instruction, setInstruction] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string>();
  const [resultId, setResultId] = useState<string>();
  const [generationVersion, setGenerationVersion] = useState<number>();
  const [candidate, setCandidate] = useState("");
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [error, setError] = useState<string>();
  const providers = useQuery({
    enabled: open,
    queryKey: ["ai", "providers"],
    queryFn: () => listProviderConfigsRequest(),
  });
  const skills = useQuery({
    enabled: open,
    queryKey: ["skills"],
    queryFn: listSkillsRequest,
  });
  const create = useMutation({ mutationFn: createAiTaskRequest });
  const cancel = useMutation({ mutationFn: cancelAiTaskRequest });
  const reject = useMutation({ mutationFn: rejectAiResultRequest });
  const apply = useMutation({
    mutationFn: async () => {
      if (!document || !resultId) throw new Error("missing result");
      if (!generationVersion) throw new Error("missing generation version");
      return applyAiResultRequest(resultId, {
        content: candidate,
        document_id: document.id,
        version: generationVersion,
      });
    },
    onSuccess: async () => {
      if (document)
        await client.invalidateQueries({
          queryKey: documentContentQueryKey(projectId, document.id),
        });
      setStatus("idle");
      setResultId(undefined);
      setGenerationVersion(undefined);
    },
    onError: () => setError("CONTENT_VERSION_CONFLICT"),
  });

  const enabledProviders =
    providers.data?.items.filter((item) => item.enabled) ?? [];
  const activeProviderId = providerId ?? enabledProviders[0]?.id;
  const selectedProvider = enabledProviders.find(
    (item) => item.id === activeProviderId,
  );
  const activeModelId = modelId ?? selectedProvider?.default_model_id;

  useEffect(() => () => abortRef.current?.abort(), []);

  async function generate() {
    if (!activeProviderId || !instruction.trim()) return;
    setCandidate("");
    setError(undefined);
    setResultId(undefined);
    setGenerationVersion(undefined);
    setStatus("queued");
    try {
      const task = await create.mutateAsync({
        document_id:
          document?.kind === "folder" ? null : (document?.id ?? null),
        instruction: instruction.trim(),
        max_output_tokens: 2048,
        model_id: activeModelId ?? null,
        project_id: projectId,
        provider_config_id: activeProviderId,
        selected_text: null,
        skill_ids: skillIds,
        task_type: taskType as "brainstorm",
      });
      setTaskId(task.id);
      const controller = new AbortController();
      abortRef.current = controller;
      await streamSse(
        `/api/v1/ai/tasks/${task.id}/events`,
        (event) => {
          if (event.type === "delta" && typeof event.text === "string")
            setCandidate((value) => value + event.text);
          if (event.type === "status" && typeof event.status === "string")
            setStatus(event.status as PanelStatus);
          if (event.type === "error" && typeof event.code === "string")
            setError(event.code);
        },
        controller.signal,
      );
      const latest = await getAiTaskRequest(task.id);
      setStatus(latest.status);
      const result = latest.results?.[0];
      setResultId(result?.id);
      const manifestVersion = latest.context_manifest?.document_version;
      setGenerationVersion(
        typeof manifestVersion === "number" ? manifestVersion : undefined,
      );
      if (result) setCandidate(result.content);
      if (latest.error_code) setError(latest.error_code);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError("AI_REQUEST_FAILED");
        setStatus("failed");
      }
    }
  }

  async function cancelTask() {
    abortRef.current?.abort();
    if (taskId) await cancel.mutateAsync(taskId);
    setStatus("cancelled");
  }

  async function rejectResult() {
    if (!resultId) return;
    await reject.mutateAsync(resultId);
    setResultId(undefined);
    setGenerationVersion(undefined);
    setCandidate("");
    setStatus("idle");
  }

  return (
    <>
      <aside
        aria-label={t("assistantTitle")}
        className={`planning-panel ai-panel ${open ? "planning-panel-open" : ""}`}
        aria-hidden={!open}
      >
        <header className="planning-panel-header">
          <div>
            <strong>{t("assistantTitle")}</strong>
            <span>{t("assistantDescription")}</span>
          </div>
          <button
            aria-label={t("closeAssistant")}
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </header>
        <div className="planning-panel-content ai-panel-content">
          {providers.isPending || skills.isPending ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : providers.isError || skills.isError ? (
            <Alert showIcon title={t("configLoadFailed")} type="error" />
          ) : enabledProviders.length === 0 ? (
            <section className="planning-empty">
              <p>{t("configureProvider")}</p>
            </section>
          ) : (
            <>
              <label className="field-label" htmlFor="ai-provider">
                {t("model")}
              </label>
              <Select
                id="ai-provider"
                value={activeProviderId}
                onChange={(value) => {
                  setProviderId(value);
                  const item = enabledProviders.find(
                    (entry) => entry.id === value,
                  );
                  setModelId(item?.default_model_id);
                }}
                options={enabledProviders.map((item) => ({
                  label: item.display_name,
                  value: item.id,
                }))}
              />
              <label className="field-label" htmlFor="ai-model">
                {t("specificModel")}
              </label>
              <Select
                id="ai-model"
                value={activeModelId}
                onChange={setModelId}
                options={selectedProvider?.models
                  .filter((item) => item.enabled)
                  .map((item) => ({
                    label: item.display_name,
                    value: item.id,
                  }))}
              />
              <label className="field-label" htmlFor="ai-task-type">
                {t("task")}
              </label>
              <Select
                id="ai-task-type"
                value={taskType}
                onChange={setTaskType}
                options={[
                  { label: t("taskTypes.brainstorm"), value: "brainstorm" },
                  { label: t("taskTypes.outline"), value: "outline" },
                  { label: t("taskTypes.rewrite"), value: "rewrite" },
                  { label: t("taskTypes.expand"), value: "expand" },
                  { label: t("taskTypes.compress"), value: "compress" },
                  { label: t("taskTypes.consistency"), value: "consistency" },
                  {
                    label: t("taskTypes.extract_settings"),
                    value: "extract_settings",
                  },
                ]}
              />
              <label className="field-label" htmlFor="ai-instruction">
                {t("instruction")}
              </label>
              <Input.TextArea
                id="ai-instruction"
                maxLength={10000}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder={t("instructionPlaceholder")}
                rows={5}
                value={instruction}
              />
              {skills.data?.items.some(
                (item) => item.enabled && item.status === "ready",
              ) ? (
                <fieldset className="ai-skill-fieldset">
                  <legend>{t("selectedSkills")}</legend>
                  <Checkbox.Group
                    options={skills.data.items
                      .filter((item) => item.enabled && item.status === "ready")
                      .map((item) => ({ label: item.name, value: item.id }))}
                    value={skillIds}
                    onChange={(values) => setSkillIds(values as string[])}
                  />
                </fieldset>
              ) : null}
              <Button
                block
                disabled={!instruction.trim() || editorBlocked}
                icon={<Send aria-hidden size={16} />}
                loading={status === "queued"}
                onClick={() => void generate()}
                type="primary"
              >
                {t("generate")}
              </Button>
              {editorBlocked ? (
                <Alert showIcon title={t("saveBeforeAi")} type="warning" />
              ) : null}
            </>
          )}
          {status === "running" || candidate ? (
            <section className="ai-candidate" aria-live="polite">
              <div className="ai-candidate-heading">
                <strong>{t("candidate")}</strong>
                <span>
                  {status === "running"
                    ? t("generating")
                    : status === "succeeded"
                      ? t("awaitingDecision")
                      : status}
                </span>
              </div>
              <pre>{candidate || t("waiting")}</pre>
              {status === "running" ? (
                <Button
                  icon={<Square aria-hidden size={15} />}
                  loading={cancel.isPending}
                  onClick={() => void cancelTask()}
                >
                  {t("stop")}
                </Button>
              ) : resultId ? (
                <div className="ai-candidate-actions">
                  <Button
                    icon={<Copy aria-hidden size={15} />}
                    onClick={() =>
                      void navigator.clipboard.writeText(candidate)
                    }
                  >
                    {t("copy")}
                  </Button>
                  <Button
                    danger
                    icon={<Ban aria-hidden size={15} />}
                    loading={reject.isPending}
                    onClick={() => void rejectResult()}
                  >
                    {t("reject")}
                  </Button>
                  {document && document.kind !== "folder" ? (
                    <Button
                      disabled={editorBlocked || !generationVersion}
                      icon={<Check aria-hidden size={15} />}
                      loading={apply.isPending}
                      onClick={() =>
                        Modal.confirm({
                          title: t("applyTitle"),
                          content: t("applyDescription"),
                          okText: t("applyConfirm"),
                          cancelText: t("cancel"),
                          onOk: () => apply.mutateAsync(),
                        })
                      }
                      type="primary"
                    >
                      {t("applyToDocument")}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          {error ? (
            <Alert showIcon title={t("taskFailed", { error })} type="error" />
          ) : null}
        </div>
      </aside>
      {open ? (
        <button
          aria-label={t("closeAssistant")}
          className="planning-panel-scrim"
          onClick={onClose}
          type="button"
        />
      ) : null}
    </>
  );
}
