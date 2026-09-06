import { AiContextSources } from "./AiContextSources";
import type {
  AiTaskCreateRequest,
  ContextPreview,
} from "../../shared/api/generated/types.gen";
import { Alert, Button, Checkbox, Input, Modal, Select, Skeleton } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, Send, Square, X } from "lucide-react";
import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import { useTranslation } from "react-i18next";

import type { DocumentSummary } from "../../shared/api/generated/types.gen";
import { streamSse } from "../../shared/api/sse";
import { documentContentQueryKey } from "../editor/editorState";
import { listSkillsRequest } from "../skills/skillsApi";
import {
  previewAiContextRequest,
  applyAiResultRequest,
  cancelAiTaskRequest,
  createAiTaskRequest,
  getAiTaskRequest,
  listProviderConfigsRequest,
  rejectAiResultRequest,
} from "./aiApi";

import {
  applySelectionCandidate,
  type SelectionAction,
} from "../editor/selectionAction";

export type ProjectAiPanelHandle = {
  prepareSelection: (selection: SelectionAction) => boolean;
};

type PanelStatus =
  "idle" | "queued" | "running" | "succeeded" | "failed" | "cancelled";

export function ProjectAiPanel({
  document,
  editorBlocked = false,
  onClose,
  open,
  projectId,
  ref,
}: {
  document?: DocumentSummary;
  editorBlocked?: boolean;
  onClose: () => void;
  open: boolean;
  projectId: string;
  ref?: Ref<ProjectAiPanelHandle>;
}) {
  const { t } = useTranslation("ai");
  const client = useQueryClient();
  const closeRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [preflight, setPreflight] = useState<{
    key: string;
    data: ContextPreview;
  }>();
  const [preparing, setPreparing] = useState(false);
  const [resultPurpose, setResultPurpose] = useState("manuscript");
  const [sourceSelection, setSourceSelection] = useState<{
    documentId?: string;
    summaries: string[];
    facts: string[];
  }>({ summaries: [], facts: [] });
  const [providerId, setProviderId] = useState<string>();
  const [modelId, setModelId] = useState<string>();
  const [taskType, setTaskType] = useState("brainstorm");
  const [instruction, setInstruction] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [taskId, setTaskId] = useState<string>();
  const [resultId, setResultId] = useState<string>();
  const [generationVersion, setGenerationVersion] = useState<number>();
  const [generationDocumentId, setGenerationDocumentId] = useState<string>();
  const [candidate, setCandidate] = useState("");
  const [status, setStatus] = useState<PanelStatus>("idle");
  const [error, setError] = useState<string>();
  const [selection, setSelection] = useState<SelectionAction>();
  const [generationSelection, setGenerationSelection] =
    useState<SelectionAction>();
  useImperativeHandle(ref, () => ({
    prepareSelection(next) {
      if (
        status === "running" ||
        status === "queued" ||
        resultId ||
        candidate
      ) {
        setError(t("selectionBusy"));
        return false;
      }
      setSelection(next);
      setTaskType(next.task);
      setInstruction(t(`selectionInstructions.${next.task}`));
      setError(undefined);
      return true;
    },
  }));
  const providers = useQuery({
    enabled: open,
    queryKey: ["ai", "providers"],
    queryFn: () => listProviderConfigsRequest(),
  });
  const skills = useQuery({
    enabled: open,
    queryKey: ["skills"],
    queryFn: () => listSkillsRequest(),
  });
  const create = useMutation({ mutationFn: createAiTaskRequest });
  const cancel = useMutation({ mutationFn: cancelAiTaskRequest });
  const reject = useMutation({ mutationFn: rejectAiResultRequest });
  const apply = useMutation({
    mutationFn: async () => {
      if (!document || !resultId) throw new Error("missing result");
      if (!generationVersion) throw new Error("missing generation version");
      if (document.id !== generationDocumentId)
        throw new Error("CONTENT_VERSION_CONFLICT");
      return applyAiResultRequest(resultId, {
        content: generationSelection
          ? applySelectionCandidate(
              generationSelection,
              candidate,
              document.id,
              generationVersion,
            )
          : candidate,
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
      setCandidate("");
      setSelection(undefined);
      setGenerationSelection(undefined);
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
  const summaryIds =
    sourceSelection.documentId === document?.id
      ? sourceSelection.summaries
      : [];
  const factIds =
    sourceSelection.documentId === document?.id ? sourceSelection.facts : [];
  const requestPayload: AiTaskCreateRequest = {
    document_id: document?.kind === "folder" ? null : (document?.id ?? null),
    instruction: instruction.trim(),
    max_output_tokens: 2048,
    model_id: activeModelId ?? null,
    project_id: projectId,
    provider_config_id: activeProviderId ?? "",
    selected_text: selection
      ? selection.content.slice(selection.start, selection.end)
      : null,
    skill_ids: skillIds,
    summary_ids: summaryIds,
    fact_ids: factIds,
    task_type: taskType as AiTaskCreateRequest["task_type"],
    expected_document_version: selection?.version,
  };
  const requestKey = JSON.stringify(requestPayload);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const previous = window.document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (
        event.key !== "Tab" ||
        !window.matchMedia("(max-width: 1023px)").matches
      )
        return;
      const elements = Array.from(
        closeRef.current
          ?.closest("aside")
          ?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && window.document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && window.document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.document.addEventListener("keydown", handleKey);
    return () => {
      window.document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [open, onClose]);

  async function generate() {
    if (
      !activeProviderId ||
      !instruction.trim() ||
      status === "running" ||
      status === "queued"
    )
      return;
    if (selection && selection.documentId !== document?.id) {
      setError("CONTENT_VERSION_CONFLICT");
      return;
    }
    if (!preflight || preflight.key !== requestKey) {
      setPreparing(true);
      setError(undefined);
      try {
        const data = await previewAiContextRequest(requestPayload);
        setPreflight({ key: requestKey, data });
      } catch {
        setError("AI_CONTEXT_PREVIEW_FAILED");
      } finally {
        setPreparing(false);
      }
      return;
    }
    setGenerationSelection(selection);
    setGenerationDocumentId(document?.id);
    setCandidate("");
    setError(undefined);
    setResultId(undefined);
    setGenerationVersion(undefined);
    setStatus("queued");
    try {
      const task = await create.mutateAsync({
        ...requestPayload,
        expected_document_version:
          selection?.version ?? preflight.data.document_version ?? undefined,
      });
      setPreflight(undefined);
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
      setResultPurpose(result?.purpose ?? "manuscript");
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
    setSelection(undefined);
    setGenerationSelection(undefined);
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
          {selection ? (
            <Alert
              type="info"
              showIcon
              title={t("selectionScope")}
              description={t("selectionScopeDescription")}
              action={
                <Button
                  disabled={
                    status === "running" ||
                    status === "queued" ||
                    Boolean(resultId)
                  }
                  onClick={() => {
                    setSelection(undefined);
                    setInstruction("");
                  }}
                >
                  {t("clearSelection")}
                </Button>
              }
            />
          ) : null}
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
              <AiContextSources
                projectId={projectId}
                documentId={
                  document?.kind !== "folder" ? document?.id : undefined
                }
                summaryIds={summaryIds}
                factIds={factIds}
                onChange={(summaries, facts) =>
                  setSourceSelection({
                    documentId: document?.id,
                    summaries,
                    facts,
                  })
                }
              />
              <p className="studio-notice">
                {document?.title ?? ""} ·{" "}
                {t(selection ? "applyToSelection" : "applyToDocument")}
              </p>
              {preflight?.key === requestKey ? (
                <div className="studio-notice">
                  <p>
                    {t("studio:estimatedTokens", {
                      count: preflight.data.estimated_input_tokens,
                    })}
                  </p>
                  <p>{t("studio:costUnknown")}</p>
                </div>
              ) : null}
              <Button
                block
                disabled={
                  preparing ||
                  !instruction.trim() ||
                  editorBlocked ||
                  status === "running" ||
                  status === "queued" ||
                  Boolean(resultId)
                }
                icon={<Send aria-hidden size={16} />}
                loading={status === "queued" || preparing}
                onClick={() => void generate()}
                type="primary"
              >
                {t(
                  preflight?.key === requestKey
                    ? "studio:confirmGenerate"
                    : "generate",
                )}
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
                  {document &&
                  document.kind !== "folder" &&
                  resultPurpose === "manuscript" ? (
                    <Button
                      disabled={
                        editorBlocked ||
                        !generationVersion ||
                        document.id !== generationDocumentId
                      }
                      icon={<Check aria-hidden size={15} />}
                      loading={apply.isPending}
                      onClick={() =>
                        Modal.confirm({
                          title: t("applyTitle"),
                          content: t(
                            generationSelection
                              ? "applySelectionDescription"
                              : "applyDescription",
                          ),
                          okText: t("applyConfirm"),
                          cancelText: t("cancel"),
                          onOk: () => apply.mutateAsync(),
                        })
                      }
                      type="primary"
                    >
                      {t(
                        generationSelection
                          ? "applyToSelection"
                          : "applyToDocument",
                      )}
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
