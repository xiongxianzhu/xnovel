import { useAuth } from "../../features/auth/useAuth";
import { useFormProtection } from "../../features/studio/useFormProtection";
import {
  clearFormDraft,
  parseFormDraft,
  readFormDraft,
} from "../../features/studio/formDrafts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button } from "antd";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../shared/api/client";
import {
  commitManuscriptImport,
  getReleaseSchedule,
  listProjectDocuments,
  previewManuscriptImport,
  previewProjectExport,
  setReleaseSchedule,
} from "../../shared/api/generated/sdk.gen";
import type {
  ImportChapter,
  ImportPreview,
} from "../../shared/api/generated/types.gen";
import {
  DraftNotice,
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";
import { orderedManuscripts } from "../../features/studio/orderedDocuments";

export function ImportPage() {
  const { projectId } = useParams();
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const { user } = useAuth();
  const draftKey = `xnovel:import-draft:${user?.id}:${projectId ?? "new"}`;
  const [storedDraft, setStoredDraft] = useState(() => readFormDraft(draftKey));
  const committed = useRef(false);
  const client = useQueryClient();
  const [file, setFile] = useState<File>();
  const [encoding, setEncoding] = useState("auto");
  const [split, setSplit] = useState("auto");
  const [target, setTarget] = useState(projectId ?? "");
  const [preview, setPreview] = useState<ImportPreview>();
  const [chapters, setChapters] = useState<ImportChapter[]>([]);
  const [title, setTitle] = useState("");
  const [active, setActive] = useState(0);
  const [duplicates, setDuplicates] = useState<"keep" | "skip">("keep");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const load = useMutation({
    mutationFn: async () =>
      (
        await previewManuscriptImport({
          client: apiClient,
          body: { file: file! },
          query: { encoding, split },
        })
      ).data.data,
    onSuccess: (data) => {
      committed.current = false;
      setPreview(data);
      setChapters(data.chapters);
      setTitle(data.title);
      setActive(0);
      setRequestId(crypto.randomUUID());
    },
  });
  const commit = useMutation({
    mutationFn: async () =>
      (
        await commitManuscriptImport({
          client: apiClient,
          body: {
            request_id: requestId,
            project_id: target || null,
            title,
            chapters,
            duplicate_policy: duplicates,
          },
        })
      ).data.data,
    onSuccess: async (data) => {
      committed.current = true;
      clearFormDraft(draftKey);
      await client.invalidateQueries({ queryKey: ["projects"] });
      await client.invalidateQueries({
        queryKey: ["planning-list", data.project_id],
      });
    },
  });
  const changeChapter = (field: "title" | "content", value: string) => {
    setRequestId(crypto.randomUUID());
    setChapters((previous) =>
      previous.map((chapter, index) =>
        index === active ? { ...chapter, [field]: value } : chapter,
      ),
    );
  };
  useFormProtection(
    () => Boolean(preview && !committed.current),
    async () => {
      try {
        await commit.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
    () =>
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({ title, chapters, target, duplicates, requestId }),
      ),
  );
  const duplicateTitles = [
    ...new Set(
      chapters
        .map((chapter) => chapter.title)
        .filter((title, index, names) => names.indexOf(title) !== index),
    ),
  ];
  const moveChapter = (offset: number) => {
    const next = [...chapters];
    const destination = active + offset;
    if (destination < 0 || destination >= next.length) return;
    [next[active], next[destination]] = [next[destination]!, next[active]!];
    setChapters(next);
    setActive(destination);
    setRequestId(crypto.randomUUID());
  };
  return (
    <StudioFrame
      title={t("import")}
      back={projectId ? `/projects/${projectId}/studio` : "/projects"}
    >
      {storedDraft ? (
        <DraftNotice
          onDiscard={() => {
            clearFormDraft(draftKey);
            setStoredDraft(null);
          }}
          onRestore={() => {
            const data = parseFormDraft(storedDraft);
            if (
              data &&
              Array.isArray(data.chapters) &&
              data.chapters.every(
                (chapter) =>
                  chapter &&
                  typeof chapter === "object" &&
                  typeof chapter.title === "string" &&
                  typeof chapter.content === "string",
              )
            ) {
              const restored = data.chapters as ImportChapter[];
              setChapters(restored);
              setTitle(typeof data.title === "string" ? data.title : "");
              setTarget(typeof data.target === "string" ? data.target : "");
              setDuplicates(data.duplicates === "skip" ? "skip" : "keep");
              setRequestId(
                typeof data.requestId === "string"
                  ? (data.requestId as ReturnType<typeof crypto.randomUUID>)
                  : crypto.randomUUID(),
              );
              setPreview({
                chapters: restored,
                title: String(data.title || ""),
                encoding: "utf-8",
                duplicate_titles: [],
              });
            }
            setStoredDraft(null);
          }}
        />
      ) : null}
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          load.mutate();
        }}
      >
        <fieldset
          className="studio-form-fields"
          disabled={load.isPending || commit.isPending}
        >
          <label className="studio-field">
            {t("file")}
            <input
              type="file"
              accept=".txt,.md,.markdown"
              required
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </label>
          <label className="studio-field">
            {t("encoding")}
            <select
              value={encoding}
              onChange={(event) => setEncoding(event.target.value)}
            >
              {[
                "auto",
                "utf-8",
                "utf-8-sig",
                "utf-16",
                "utf-16-le",
                "utf-16-be",
                "gb18030",
              ].map((value) => (
                <option key={value} value={value}>
                  {value === "auto" ? t("auto") : value}
                </option>
              ))}
            </select>
          </label>
          <label className="studio-field">
            {t("split")}
            <select
              value={split}
              onChange={(event) => setSplit(event.target.value)}
            >
              <option value="auto">{t("auto")}</option>
              <option value="none">{t("noSplit")}</option>
            </select>
          </label>
          <div>
            <Button
              htmlType="submit"
              disabled={!file || file.size > 20 * 1024 * 1024}
              loading={load.isPending}
            >
              {t("preview")}
            </Button>
          </div>
        </fieldset>
      </form>
      {load.isError ? <StudioError /> : null}
      {preview ? (
        <form
          className="studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            void commit
              .mutateAsync()
              .then((data) => navigate(`/projects/${data.project_id}`))
              .catch(() => undefined);
          }}
        >
          <fieldset
            className="studio-form-fields"
            disabled={load.isPending || commit.isPending}
          >
            <p>
              {t("encoding")}: {preview.encoding} · {chapters.length}
            </p>
            <label className="studio-field">
              {t("targetProject")}
              <select
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              >
                <option value="">{t("newProject")}</option>
                {projectId ? (
                  <option value={projectId}>{t("studio")}</option>
                ) : null}
              </select>
            </label>
            <label className="studio-field">
              {t("title")}
              <input
                value={title}
                maxLength={100}
                required
                onChange={(event) => {
                  setTitle(event.target.value);
                  setRequestId(crypto.randomUUID());
                }}
              />
            </label>
            <label className="studio-field">
              {t("duplicatePolicy")}
              <select
                value={duplicates}
                onChange={(event) => {
                  setDuplicates(event.target.value as "keep" | "skip");
                  setRequestId(crypto.randomUUID());
                }}
              >
                <option value="keep">{t("keep")}</option>
                <option value="skip">{t("skip")}</option>
              </select>
            </label>
            {duplicateTitles.length ? (
              <Alert
                type="warning"
                title={t("duplicate")}
                description={duplicateTitles.join("、")}
              />
            ) : null}
            <label className="studio-field">
              {t("chooseChapter")}
              <select
                value={active}
                onChange={(event) => setActive(Number(event.target.value))}
              >
                {chapters.map((chapter, index) => (
                  <option key={index} value={index}>
                    {index + 1}. {chapter.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="studio-field">
              {t("title")}
              <input
                value={chapters[active]?.title ?? ""}
                required
                maxLength={200}
                onChange={(event) => changeChapter("title", event.target.value)}
              />
            </label>
            <label className="studio-field">
              {t("body")}
              <textarea
                className="studio-body"
                value={chapters[active]?.content ?? ""}
                onChange={(event) =>
                  changeChapter("content", event.target.value)
                }
              />
            </label>
            <div className="studio-actions">
              <Button onClick={() => moveChapter(-1)} disabled={active === 0}>
                {t("moveUp")}
              </Button>
              <Button
                onClick={() => moveChapter(1)}
                disabled={active >= chapters.length - 1}
              >
                {t("moveDown")}
              </Button>
              <Button
                disabled={active >= chapters.length - 1}
                onClick={() => {
                  const next = [...chapters];
                  const nextChapter = next[active + 1]!;
                  next[active] = {
                    ...next[active]!,
                    content:
                      next[active]!.content +
                      "\n\n" +
                      nextChapter.title +
                      "\n" +
                      nextChapter.content,
                  };
                  next.splice(active + 1, 1);
                  setChapters(next);
                  setRequestId(crypto.randomUUID());
                }}
              >
                {t("mergeNext")}
              </Button>
              <Button
                danger
                disabled={chapters.length <= 1}
                onClick={() => {
                  setChapters((previous) =>
                    previous.filter((_, index) => index !== active),
                  );
                  setActive((value) => Math.max(0, value - 1));
                  setRequestId(crypto.randomUUID());
                }}
              >
                {t("removePreview")}
              </Button>
              <Button
                disabled={chapters.length >= 1000}
                onClick={() => {
                  setChapters((previous) => [
                    ...previous,
                    { title: t("newChapter"), content: "" },
                  ]);
                  setActive(chapters.length);
                  setRequestId(crypto.randomUUID());
                }}
              >
                {t("newChapter")}
              </Button>
            </div>
            {commit.isError ? <StudioError /> : null}
            <div>
              <Button
                type="primary"
                htmlType="submit"
                loading={commit.isPending}
              >
                {t("confirmImport")}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
    </StudioFrame>
  );
}

export function ExportPage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const [selected, setSelected] = useState<string[] | null>(null);
  const [format, setFormat] = useState<"markdown" | "plain_text">("markdown");
  const [titles, setTitles] = useState(true);
  const [separator, setSeparator] = useState("\n\n");
  const docs = useQuery({
    queryKey: ["export-documents", projectId],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const available = orderedManuscripts(docs.data?.items ?? []);
  const ids = selected ?? available.map((item) => item.id);
  const preview = useMutation({
    mutationFn: async () =>
      (
        await previewProjectExport({
          client: apiClient,
          path: { project_id: projectId },
          body: {
            document_ids: ids,
            format,
            include_titles: titles,
            separator,
          },
        })
      ).data.data,
  });
  function download() {
    if (!preview.data) return;
    const url = URL.createObjectURL(
      new Blob([preview.data.content], { type: "text/plain;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = preview.data.filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <StudioFrame title={t("export")} back={`/projects/${projectId}`}>
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          preview.mutate();
        }}
      >
        <fieldset className="studio-form-fields" disabled={preview.isPending}>
          <label className="studio-field">
            {t("format")}
            <select
              value={format}
              onChange={(event) => {
                setFormat(event.target.value as "markdown" | "plain_text");
                preview.reset();
              }}
            >
              <option value="markdown">{t("markdown")}</option>
              <option value="plain_text">{t("plain_text")}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={titles}
              onChange={(event) => {
                setTitles(event.target.checked);
                preview.reset();
              }}
            />{" "}
            {t("includeTitles")}
          </label>
          <label className="studio-field">
            {t("separator")}
            <select
              value={separator}
              onChange={(event) => {
                setSeparator(event.target.value);
                preview.reset();
              }}
            >
              <option value={"\n\n"}>{t("blankLine")}</option>
              <option value={"\n\n---\n\n"}>{t("dividerLine")}</option>
            </select>
          </label>
          <div className="studio-source-list" aria-label={t("chooseChapter")}>
            {available.map((doc) => (
              <label key={doc.id}>
                <input
                  type="checkbox"
                  checked={ids.includes(doc.id)}
                  onChange={(event) => {
                    setSelected(
                      event.target.checked
                        ? [...ids, doc.id]
                        : ids.filter((id) => id !== doc.id),
                    );
                    preview.reset();
                  }}
                />
                {doc.title}
              </label>
            ))}
          </div>
          <details>
            <summary>{t("exportOrder")}</summary>
            <ol className="studio-list">
              {ids.map((id, index) => (
                <li key={id}>
                  <span>{available.find((item) => item.id === id)?.title}</span>
                  <div className="studio-actions">
                    <Button
                      disabled={index === 0}
                      onClick={() => {
                        const next = [...ids];
                        [next[index - 1], next[index]] = [
                          next[index]!,
                          next[index - 1]!,
                        ];
                        setSelected(next);
                        preview.reset();
                      }}
                    >
                      {t("moveUp")}
                    </Button>
                    <Button
                      disabled={index === ids.length - 1}
                      onClick={() => {
                        const next = [...ids];
                        [next[index + 1], next[index]] = [
                          next[index]!,
                          next[index + 1]!,
                        ];
                        setSelected(next);
                        preview.reset();
                      }}
                    >
                      {t("moveDown")}
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          </details>
          <div>
            <Button
              htmlType="submit"
              loading={preview.isPending}
              disabled={!ids.length}
            >
              {t("preview")}
            </Button>
          </div>
        </fieldset>
      </form>
      {preview.isError || docs.isError ? <StudioError /> : null}
      {preview.data ? (
        <>
          <h2>{t("warnings")}</h2>
          {preview.data.warnings.length ? (
            <ul>
              {preview.data.warnings.map((warning, index) => (
                <li key={index}>
                  {t(warning.kind === "empty" ? "emptyChapter" : warning.kind)}{" "}
                  · {warning.title}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("noWarnings")}</p>
          )}
          <pre className="studio-record-body">{preview.data.content}</pre>
          <Button type="primary" onClick={download}>
            {t("download")}
          </Button>
        </>
      ) : null}
    </StudioFrame>
  );
}

export function SchedulePage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["release-schedule", projectId],
    queryFn: async () =>
      (
        await getReleaseSchedule({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const { user } = useAuth();
  const draftKey = `xnovel:schedule-draft:${user?.id}:${projectId}`;
  const [draft, setDraft] = useState(() => readFormDraft(draftKey));
  const [frequency, setFrequency] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await setReleaseSchedule({
          client: apiClient,
          path: { project_id: projectId },
          body: {
            chapters_per_week: Number(
              frequency ?? query.data?.chapters_per_week,
            ),
            note: note ?? query.data?.note ?? "",
          },
        })
      ).data.data,
    onSuccess: async (data) => {
      client.setQueryData(["release-schedule", projectId], data);
      setFrequency(null);
      setNote(null);
      clearFormDraft(draftKey);
    },
  });
  useFormProtection(
    () => frequency !== null || note !== null,
    async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
    () => sessionStorage.setItem(draftKey, JSON.stringify({ frequency, note })),
  );
  return (
    <StudioFrame title={t("schedule")} back={`/projects/${projectId}/studio`}>
      {draft ? (
        <DraftNotice
          onDiscard={() => {
            clearFormDraft(draftKey);
            setDraft(null);
          }}
          onRestore={() => {
            const data = parseFormDraft(draft);
            if (typeof data?.frequency === "string")
              setFrequency(data.frequency);
            if (typeof data?.note === "string") setNote(data.note);
            setDraft(null);
          }}
        />
      ) : null}
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <p>{t("readyCount", { count: query.data.ready_chapters })}</p>
          <p>
            {query.data.estimated_days === null
              ? t("scheduleUnset")
              : t("stockDays", { days: query.data.estimated_days })}
          </p>
          <form
            className="studio-form"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <fieldset
              className="studio-form-fields"
              disabled={mutation.isPending}
            >
              <label className="studio-field">
                {t("frequency")}
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={frequency ?? query.data.chapters_per_week ?? ""}
                  onChange={(event) => setFrequency(event.target.value)}
                />
              </label>
              <label className="studio-field">
                {t("body")}
                <textarea
                  value={note ?? query.data.note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
              {mutation.isError ? <StudioError /> : null}
              <div>
                <Button
                  htmlType="submit"
                  type="primary"
                  loading={mutation.isPending}
                >
                  {t("save")}
                </Button>
              </div>
            </fieldset>
          </form>
        </>
      )}
    </StudioFrame>
  );
}
