import { Alert, Button, Input, Skeleton, type InputRef } from "antd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GitCompare,
  Replace,
  Save,
  Search,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { DocumentContentData } from "../../shared/api/generated/types.gen";
import { isApiError } from "../../shared/api/errors";
import {
  getDocumentContentRequest,
  saveDocumentContentRequest,
} from "./editorApi";
import { documentContentQueryKey, estimateDocumentWords } from "./editorState";
import {
  loadEditorDraft,
  removeEditorDraft,
  saveEditorDraft,
  type EditorDraft,
} from "./draftStorage";
import { useEditorNavigation } from "./useEditorNavigation";

type SaveState = "clean" | "conflict" | "dirty" | "failed" | "saved" | "saving";

type ConflictState = {
  localContent: string;
  server: DocumentContentData;
};

export function WritingEditor({
  documentId,
  documentTitle,
  documentTypeLabel,
  projectId,
  userId,
}: {
  documentId: string;
  documentTitle: string;
  documentTypeLabel?: string;
  projectId: string;
  userId: string;
}) {
  const { t } = useTranslation(["common", "projects"]);
  const contentQuery = useQuery({
    queryFn: () => getDocumentContentRequest(projectId, documentId),
    queryKey: documentContentQueryKey(projectId, documentId),
  });

  if (contentQuery.isPending) {
    return (
      <section
        aria-busy="true"
        className="writing-editor writing-editor-loading"
      >
        <Skeleton active paragraph={{ rows: 10 }} title />
      </section>
    );
  }
  if (contentQuery.isError) {
    return (
      <section className="writing-editor">
        <Alert
          action={
            <Button onClick={() => void contentQuery.refetch()}>
              {t("common:retry")}
            </Button>
          }
          showIcon
          title={t("projects:contentLoadFailed")}
          type="error"
        />
      </section>
    );
  }
  return (
    <WritingEditorSession
      documentId={documentId}
      documentTitle={documentTitle}
      documentTypeLabel={documentTypeLabel}
      initial={contentQuery.data}
      key={documentId}
      projectId={projectId}
      userId={userId}
    />
  );
}

function WritingEditorSession({
  documentId,
  documentTitle,
  documentTypeLabel,
  initial,
  projectId,
  userId,
}: {
  documentId: string;
  documentTitle: string;
  documentTypeLabel?: string;
  initial: DocumentContentData;
  projectId: string;
  userId: string;
}) {
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const { registerGuard, setBlocked } = useEditorNavigation();
  const [content, setContent] = useState(initial.content);
  const [confirmedContent, setConfirmedContent] = useState(initial.content);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [wordCount, setWordCount] = useState(initial.word_count);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftCandidate, setDraftCandidate] = useState<EditorDraft | null>(
    () => {
      const draft = loadEditorDraft(userId, projectId, documentId);
      return draft && draft.content !== initial.content ? draft : null;
    },
  );
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [conflictVisible, setConflictVisible] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [replacementText, setReplacementText] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const contentRef = useRef(initial.content);
  const confirmedRef = useRef(initial.content);
  const versionRef = useRef(initial.version);
  const conflictRef = useRef<ConflictState | null>(null);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<InputRef>(null);

  const stash = useCallback(() => {
    if (contentRef.current === confirmedRef.current) return;
    saveEditorDraft(userId, projectId, documentId, {
      baseVersion: versionRef.current,
      content: contentRef.current,
      savedAt: new Date().toISOString(),
    });
  }, [documentId, projectId, userId]);

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (conflictRef.current) {
      setConflictVisible(true);
      return false;
    }
    if (inFlightRef.current) {
      await inFlightRef.current;
      if (conflictRef.current) return false;
      if (contentRef.current === confirmedRef.current) return true;
    }
    if (contentRef.current === confirmedRef.current) {
      setSaveState("clean");
      return true;
    }

    const snapshot = contentRef.current;
    const baseVersion = versionRef.current;
    setSaveState("saving");
    setSaveError(null);
    const operation = (async () => {
      try {
        const saved = await saveDocumentContentRequest(projectId, documentId, {
          content: snapshot,
          content_format: "plain_text",
          version: baseVersion,
        });
        versionRef.current = saved.version;
        confirmedRef.current = snapshot;
        setConfirmedContent(snapshot);
        setWordCount(saved.word_count);
        queryClient.setQueryData(
          documentContentQueryKey(projectId, documentId),
          saved,
        );
        if (contentRef.current === snapshot) {
          setSaveState("saved");
          removeEditorDraft(userId, projectId, documentId);
        } else {
          setSaveState("dirty");
          stash();
        }
        return true;
      } catch (error) {
        const versionConflict =
          isApiError(error) &&
          error.status === 409 &&
          readConflictReason(error.data) === "content_version_conflict";
        if (versionConflict) {
          try {
            const server = await getDocumentContentRequest(
              projectId,
              documentId,
            );
            const nextConflict = { localContent: contentRef.current, server };
            conflictRef.current = nextConflict;
            setConflict(nextConflict);
            setConflictVisible(true);
            setSaveState("conflict");
            stash();
          } catch {
            setSaveError(t("projects:conflictLoadFailed"));
            setSaveState("failed");
            stash();
          }
        } else {
          setSaveError(t("projects:contentSaveFailed"));
          setSaveState("failed");
          stash();
        }
        return false;
      }
    })();
    inFlightRef.current = operation;
    const result = await operation;
    if (inFlightRef.current === operation) inFlightRef.current = null;
    if (
      result &&
      !conflictRef.current &&
      contentRef.current !== confirmedRef.current
    ) {
      return saveNowRef.current();
    }
    return result;
  }, [documentId, projectId, queryClient, stash, t, userId]);

  useEffect(() => {
    saveNowRef.current = saveNow;
  }, [saveNow]);

  useEffect(
    () =>
      registerGuard({
        isBlocked: () =>
          contentRef.current !== confirmedRef.current ||
          Boolean(conflictRef.current),
        save: saveNow,
        stash,
      }),
    [registerGuard, saveNow, stash],
  );

  useEffect(() => {
    setBlocked(
      contentRef.current !== confirmedRef.current || Boolean(conflict),
    );
  }, [conflict, content, confirmedContent, setBlocked]);

  useEffect(() => {
    if (content === confirmedRef.current || conflictRef.current) return;
    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      void saveNow();
    }, 1000);
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [content, saveNow]);

  useEffect(() => {
    if (content === confirmedRef.current) return;
    const timer = window.setTimeout(stash, 250);
    return () => window.clearTimeout(timer);
  }, [content, stash]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (contentRef.current === confirmedRef.current && !conflictRef.current)
        return;
      stash();
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [stash]);

  function updateContent(value: string) {
    contentRef.current = value;
    setContent(value);
    setSaveState(conflictRef.current ? "conflict" : "dirty");
  }

  function restoreDraft() {
    if (!draftCandidate) return;
    contentRef.current = draftCandidate.content;
    setContent(draftCandidate.content);
    setDraftCandidate(null);
    if (draftCandidate.baseVersion !== initial.version) {
      const nextConflict = {
        localContent: draftCandidate.content,
        server: initial,
      };
      conflictRef.current = nextConflict;
      setConflict(nextConflict);
      setConflictVisible(true);
      setSaveState("conflict");
    } else {
      setSaveState("dirty");
    }
  }

  function useServerVersion() {
    if (!conflict) return;
    contentRef.current = conflict.server.content;
    confirmedRef.current = conflict.server.content;
    setConfirmedContent(conflict.server.content);
    versionRef.current = conflict.server.version;
    conflictRef.current = null;
    setContent(conflict.server.content);
    setWordCount(conflict.server.word_count);
    setConflict(null);
    setConflictVisible(false);
    setSaveState("clean");
    removeEditorDraft(userId, projectId, documentId);
    queryClient.setQueryData(
      documentContentQueryKey(projectId, documentId),
      conflict.server,
    );
  }

  async function saveLocalVersion() {
    if (!conflict) return;
    contentRef.current = conflict.localContent;
    versionRef.current = conflict.server.version;
    conflictRef.current = null;
    setConflict(null);
    setConflictVisible(false);
    setSaveState("dirty");
    await saveNow();
  }

  function handleShortcut(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveNow();
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "f"
    ) {
      event.preventDefault();
      setSearchOpen(true);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "h"
    ) {
      event.preventDefault();
      setSearchOpen(true);
      setReplaceOpen(true);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } else if (event.key === "Escape" && searchOpen) {
      event.preventDefault();
      setSearchOpen(false);
      textareaRef.current?.focus();
    }
  }

  function selectMatch(direction: "next" | "previous") {
    if (!searchText) return;
    const haystack = content.toLocaleLowerCase();
    const needle = searchText.toLocaleLowerCase();
    let index =
      direction === "next"
        ? haystack.indexOf(needle, selection.end)
        : haystack.lastIndexOf(needle, Math.max(0, selection.start - 1));
    if (index < 0) {
      index =
        direction === "next"
          ? haystack.indexOf(needle)
          : haystack.lastIndexOf(needle);
    }
    if (index < 0) return;
    const next = { start: index, end: index + searchText.length };
    setSelection(next);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.start, next.end);
    });
  }

  function replaceCurrent() {
    const selected = content.slice(selection.start, selection.end);
    if (
      !searchText ||
      selected.toLocaleLowerCase() !== searchText.toLocaleLowerCase()
    ) {
      selectMatch("next");
      return;
    }
    const nextContent =
      content.slice(0, selection.start) +
      replacementText +
      content.slice(selection.end);
    const nextSelection = {
      start: selection.start,
      end: selection.start + replacementText.length,
    };
    updateContent(nextContent);
    setSelection(nextSelection);
    requestAnimationFrame(() =>
      textareaRef.current?.setSelectionRange(
        nextSelection.start,
        nextSelection.end,
      ),
    );
  }

  function replaceAll() {
    if (!searchText) return;
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const nextContent = content.replace(
      new RegExp(escaped, "giu"),
      replacementText,
    );
    if (nextContent !== content) updateContent(nextContent);
  }

  const displayedWordCount =
    content === confirmedContent ? wordCount : estimateDocumentWords(content);

  return (
    <section className="writing-editor" aria-labelledby="writing-editor-title">
      <header className="writing-editor-toolbar">
        <div className="writing-editor-title">
          <h2 id="writing-editor-title">{documentTitle}</h2>
          <span>{documentTypeLabel ?? t("projects:plainText")}</span>
        </div>
        <div className="writing-editor-meta">
          <span className="writing-word-count">
            {t("projects:wordCount", { count: displayedWordCount })}
            {selection.end > selection.start
              ? ` · ${t("projects:selectedWordCount", {
                  count: estimateDocumentWords(
                    content.slice(selection.start, selection.end),
                  ),
                })}`
              : ""}
          </span>
          <Button
            aria-pressed={searchOpen}
            icon={<Search aria-hidden size={17} />}
            onClick={() => {
              setSearchOpen((value) => !value);
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
          >
            {t("projects:find")}
          </Button>
          <SaveStatus state={saveState} />
          <Button
            disabled={
              saveState === "clean" ||
              saveState === "saving" ||
              saveState === "conflict"
            }
            icon={<Save aria-hidden size={17} />}
            loading={saveState === "saving"}
            onClick={() => void saveNow()}
          >
            {t("common:save")}
          </Button>
        </div>
      </header>
      {searchOpen ? (
        <div className="editor-find-bar" role="search">
          <Input
            aria-label={t("projects:find")}
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                selectMatch(event.shiftKey ? "previous" : "next");
              }
            }}
            placeholder={t("projects:findPlaceholder")}
            ref={searchInputRef}
            value={searchText}
          />
          {replaceOpen ? (
            <Input
              aria-label={t("projects:replaceWith")}
              onChange={(event) => setReplacementText(event.target.value)}
              placeholder={t("projects:replacePlaceholder")}
              value={replacementText}
            />
          ) : null}
          <Button
            aria-label={t("projects:previousMatch")}
            icon={<ChevronUp aria-hidden size={16} />}
            onClick={() => selectMatch("previous")}
          />
          <Button
            aria-label={t("projects:nextMatch")}
            icon={<ChevronDown aria-hidden size={16} />}
            onClick={() => selectMatch("next")}
          />
          {replaceOpen ? (
            <>
              <Button
                icon={<Replace aria-hidden size={16} />}
                onClick={replaceCurrent}
              >
                {t("projects:replace")}
              </Button>
              <Button onClick={replaceAll}>{t("projects:replaceAll")}</Button>
            </>
          ) : (
            <Button onClick={() => setReplaceOpen(true)}>
              {t("projects:showReplace")}
            </Button>
          )}
          <Button
            aria-label={t("common:close")}
            icon={<X aria-hidden size={16} />}
            onClick={() => {
              setSearchOpen(false);
              textareaRef.current?.focus();
            }}
          />
        </div>
      ) : null}
      {draftCandidate ? (
        <Alert
          action={
            <div className="editor-alert-actions">
              <Button onClick={restoreDraft}>
                {t("projects:restoreDraft")}
              </Button>
              <Button
                onClick={() => {
                  removeEditorDraft(userId, projectId, documentId);
                  setDraftCandidate(null);
                }}
              >
                {t("projects:discardDraft")}
              </Button>
            </div>
          }
          className="editor-stable-alert"
          showIcon
          title={t("projects:draftFound")}
          type="warning"
        />
      ) : null}
      {saveState === "failed" ? (
        <Alert
          action={
            <div className="editor-alert-actions">
              <Button onClick={() => void saveNow()}>
                {t("common:retry")}
              </Button>
              <Button
                icon={<Copy aria-hidden size={16} />}
                onClick={() => void copyText(content)}
              >
                {t("projects:copyContent")}
              </Button>
            </div>
          }
          className="editor-stable-alert"
          description={saveError}
          showIcon
          title={t("projects:contentSaveFailedTitle")}
          type="error"
        />
      ) : null}
      {saveState === "conflict" ? (
        <Alert
          action={
            <Button onClick={() => setConflictVisible(true)}>
              {t("projects:compareVersions")}
            </Button>
          }
          className="editor-stable-alert"
          icon={<GitCompare aria-hidden size={18} />}
          showIcon
          title={t("projects:contentConflictTitle")}
          type="warning"
        />
      ) : null}
      <textarea
        aria-label={t("projects:manuscriptEditor")}
        className="manuscript-editor"
        onChange={(event) => updateContent(event.target.value)}
        onKeyDown={handleShortcut}
        onSelect={(event) =>
          setSelection({
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }
        ref={textareaRef}
        placeholder={t("projects:manuscriptPlaceholder")}
        spellCheck
        value={content}
      />
      <ConflictPanel
        conflict={conflictVisible ? conflict : null}
        onBack={() => setConflictVisible(false)}
        onSaveLocal={() => void saveLocalVersion()}
        onUseServer={useServerVersion}
        saving={saveState === "saving"}
      />
    </section>
  );
}

function SaveStatus({ state }: { state: SaveState }) {
  const { t } = useTranslation("projects");
  const icon =
    state === "failed" || state === "conflict" ? (
      <AlertTriangle aria-hidden size={16} />
    ) : state === "saved" ? (
      <Check aria-hidden size={16} />
    ) : null;
  return (
    <span
      aria-live="polite"
      className={`writing-save-status writing-save-status-${state}`}
    >
      {icon}
      {t(`saveState.${state}`)}
    </span>
  );
}

function ConflictPanel({
  conflict,
  onBack,
  onSaveLocal,
  onUseServer,
  saving,
}: {
  conflict: ConflictState | null;
  onBack: () => void;
  onSaveLocal: () => void;
  onUseServer: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation(["common", "projects"]);
  if (!conflict) return null;
  return (
    <div
      aria-labelledby="conflict-panel-title"
      className="editor-conflict-panel"
      role="dialog"
    >
      <div className="editor-conflict-heading">
        <div>
          <h3 id="conflict-panel-title">{t("projects:compareVersions")}</h3>
          <p>{t("projects:conflictDescription")}</p>
        </div>
        <Button onClick={onBack}>{t("projects:returnToEditing")}</Button>
      </div>
      <div className="editor-conflict-grid">
        <label>
          <span>{t("projects:localVersion")}</span>
          <textarea readOnly value={conflict.localContent} />
          <Button
            icon={<Copy aria-hidden size={16} />}
            onClick={() => void copyText(conflict.localContent)}
          >
            {t("projects:copyLocalVersion")}
          </Button>
        </label>
        <label>
          <span>{t("projects:serverVersion")}</span>
          <textarea readOnly value={conflict.server.content} />
          <Button
            icon={<Copy aria-hidden size={16} />}
            onClick={() => void copyText(conflict.server.content)}
          >
            {t("projects:copyServerVersion")}
          </Button>
        </label>
      </div>
      <div className="document-dialog-actions">
        <Button disabled={saving} onClick={onUseServer}>
          {t("projects:useServerVersion")}
        </Button>
        <Button loading={saving} onClick={onSaveLocal} type="primary">
          {t("projects:saveLocalVersion")}
        </Button>
      </div>
    </div>
  );
}

function readConflictReason(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const data = (value as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  const reason = (data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // 剪贴板不可用时不改变或清空编辑器内容。
  }
}
